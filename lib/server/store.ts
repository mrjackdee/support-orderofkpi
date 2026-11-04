// The Support Center's data layer. Every read and write of stored data goes through this module,
// so a MySQL version can replace the SQLite one behind the same functions.
//
// Permission rules come from ./permissions; this module applies them when it builds what a page
// may see, so a member's view can never include internal notes or internal history.

import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, getHolder } from "./db/client";
import {
  backups,
  deflections,
  files,
  history,
  internalNotes,
  messages,
  outbox,
  people,
  requestCounters,
  requests,
  sessions,
  settings,
  topics,
} from "./db/schema";
import { addBusinessDays, businessMsBetween, easternYear } from "./business-time";
import {
  assignedEmail,
  completedEmail,
  newRequestStaffEmail,
  receivedEmail,
  staffReplyEmail,
  waitingEmail,
  type EmailContent,
} from "./email";
import { formatRequestNumber } from "./numbering";
import {
  can,
  canBeAssigned,
  canGlobal,
  isOwner,
  isRouteChair,
  isSupportLead,
  reopenDeadline,
  staffRoutes,
  type Actor,
  type RequestAccessFacts,
} from "./permissions";
import type { DigestPerson, DigestRequest } from "./digest";
import type { Claims } from "./sso";
import { commitStaged, discardStaged, type StagedFile } from "./uploads";
import { filesCapMessage, REOPEN_DAYS } from "../shared/limits";
import { OPEN_STATUSES, STATUS_LABELS, isStatusCode, type StatusCode } from "../shared/statuses";
import { DEFAULT_TOPICS, ROUTES, isRouteCode, routeForTopic, routeName, type Topic } from "../shared/topics";
import type {
  ConversationItem,
  FileView,
  HistoryView,
  MemberRequestView,
  PersonOption,
  QueueRow,
  RequestSummary,
  RequestView,
  StaffExtras,
} from "../shared/views";

type RequestRow = typeof requests.$inferSelect;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type DbLike = ReturnType<typeof getDb> | Tx;

export class StoreError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------
// Set-up

let seeded = false;

function ensureReady() {
  const db = getDb();
  if (seeded) return db;
  const now = Date.now();
  for (const topic of DEFAULT_TOPICS) {
    db.insert(topics)
      .values({ ...topic, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }
  seeded = true;
  return db;
}

export function databaseHealthy() {
  try {
    const holder = getHolder();
    holder.sqlite.prepare("select 1 as ok").get();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Settings

export type SupportSettings = {
  responseTargetDays: number;
  urgentTargetDays: number;
  notifyEmails: string[];
};

const DEFAULT_SETTINGS: SupportSettings = { responseTargetDays: 2, urgentTargetDays: 1, notifyEmails: [] };

function readSettings(db: DbLike): SupportSettings {
  const rows = db.select().from(settings).all();
  const result: SupportSettings = { ...DEFAULT_SETTINGS, notifyEmails: [] };
  for (const row of rows) {
    try {
      const value = JSON.parse(row.value);
      if (row.key === "responseTargetDays" && Number.isFinite(value) && value > 0) result.responseTargetDays = value;
      if (row.key === "urgentTargetDays" && Number.isFinite(value) && value > 0) result.urgentTargetDays = value;
      if (row.key === "notifyEmails" && Array.isArray(value)) result.notifyEmails = value.filter((item) => typeof item === "string");
    } catch {
      // Ignore a damaged value and keep the default.
    }
  }
  return result;
}

export async function getSettings() {
  return readSettings(ensureReady());
}

export async function updateSettings(actor: Actor, patch: Partial<SupportSettings>) {
  if (!canGlobal(actor, "settings")) throw new StoreError("Not found", 404);
  const db = ensureReady();
  const now = Date.now();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      tx.insert(settings)
        .values({ key, value: JSON.stringify(value), updatedAt: now, updatedBy: actor.email })
        .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value), updatedAt: now, updatedBy: actor.email } })
        .run();
    }
  });
  return readSettings(db);
}

/** Internal key-value markers, such as when an alert was last sent. */
export async function getMarker(key: string) {
  const row = ensureReady().select().from(settings).where(eq(settings.key, `marker:${key}`)).get();
  return row ? Number(JSON.parse(row.value)) || 0 : 0;
}

export async function setMarker(key: string, value: number) {
  const now = Date.now();
  ensureReady()
    .insert(settings)
    .values({ key: `marker:${key}`, value: JSON.stringify(value), updatedAt: now, updatedBy: "system" })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value), updatedAt: now } })
    .run();
}

/**
 * Raises a marker to `value` only if it is lower now, in one statement, and says whether this
 * call did it. Two workers that race for the same day's job: only one gets true.
 */
export async function claimMarker(key: string, value: number) {
  ensureReady();
  const now = Date.now();
  const result = getHolder()
    .sqlite.prepare(
      "insert into settings (key, value, updated_at, updated_by) values (?, ?, ?, 'system') on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at where cast(settings.value as real) < cast(excluded.value as real)",
    )
    .run(`marker:${key}`, JSON.stringify(value), now);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------------------------
// Backups (BR-62)

/** Copies the live database to `file` with SQLite's online backup, while the site keeps working. */
export async function backupDatabaseTo(file: string) {
  ensureReady();
  await getHolder().sqlite.backup(file);
}

export type BackupRecord = Omit<typeof backups.$inferInsert, "id">;

export async function recordBackup(record: BackupRecord) {
  ensureReady().insert(backups).values(record).run();
}

export async function lastSuccessfulBackupAt(): Promise<number | null> {
  const row = ensureReady().select({ at: sql<number | null>`max(${backups.finishedAt})` }).from(backups).where(eq(backups.status, "OK")).get();
  return row?.at ?? null;
}

export async function recentBackups(limit = 20) {
  return ensureReady().select().from(backups).orderBy(desc(backups.finishedAt), desc(backups.id)).limit(limit).all();
}

// ---------------------------------------------------------------------------------------------
// Topics

function toTopic(row: typeof topics.$inferSelect): Topic {
  return { code: row.code, label: row.label, description: row.description, defaultRoute: row.defaultRoute, enabled: row.enabled, sort: row.sort };
}

export async function listTopics(options: { enabledOnly?: boolean } = {}) {
  const db = ensureReady();
  const rows = db.select().from(topics).orderBy(asc(topics.sort), asc(topics.code)).all();
  return rows.map(toTopic).filter((topic) => !options.enabledOnly || topic.enabled);
}

function topicLabels(db: DbLike) {
  return new Map(db.select().from(topics).all().map((row) => [row.code, row.label]));
}

/** BR-10: add a topic, or change one. A topic is never removed, only switched off. */
export async function saveTopic(actor: Actor, input: Topic) {
  if (!canGlobal(actor, "settings")) throw new StoreError("Not found", 404);
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(code)) throw new StoreError("A topic code is 2 to 5 capital letters, for example DUE.");
  const label = input.label.trim();
  if (!label || label.length > 80) throw new StoreError("Give the topic a name of up to 80 characters.");
  const description = input.description.trim().slice(0, 200);
  if (input.defaultRoute !== "member_choice" && !isRouteCode(input.defaultRoute)) throw new StoreError("Choose where the topic is routed.");
  const db = ensureReady();
  const now = Date.now();
  db.insert(topics)
    .values({ code, label, description, defaultRoute: input.defaultRoute, enabled: input.enabled, sort: Math.round(input.sort) || 0, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: topics.code,
      set: { label, description, defaultRoute: input.defaultRoute, enabled: input.enabled, sort: Math.round(input.sort) || 0, updatedAt: now },
    })
    .run();
  return listTopics();
}

// ---------------------------------------------------------------------------------------------
// People and sessions

export function claimsToActor(claims: Claims): Actor {
  return {
    personId: claims.personId,
    email: claims.email,
    name: claims.name,
    roles: claims.roles,
    isAdmin: claims.isAdmin,
    isStaff: claims.isStaff,
    committees: claims.committees,
    committeeRoles: claims.committeeRoles,
  };
}

function parseClaims(raw: string): Claims | null {
  try {
    return JSON.parse(raw) as Claims;
  } catch {
    return null;
  }
}

function upsertPersonTx(db: DbLike, claims: Claims, now: number) {
  db.insert(people)
    .values({ email: claims.email, personId: claims.personId, name: claims.name, claims: JSON.stringify(claims), lastSeenAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: people.email, set: { personId: claims.personId, name: claims.name, claims: JSON.stringify(claims), lastSeenAt: now, updatedAt: now } })
    .run();
}

export type SessionRecord = typeof sessions.$inferSelect & { parsedClaims: Claims };

export async function createSession(idHash: string, claims: Claims, expiresAt: number) {
  const db = ensureReady();
  const now = Date.now();
  db.transaction((tx) => {
    tx.insert(sessions)
      .values({ idHash, email: claims.email, personId: claims.personId, claims: JSON.stringify(claims), createdAt: now, lastSeenAt: now, checkedAt: now, lastGoodCheckAt: now, expiresAt })
      .run();
    upsertPersonTx(tx, claims, now);
  });
}

export async function findSession(idHash: string): Promise<SessionRecord | null> {
  const row = ensureReady().select().from(sessions).where(eq(sessions.idHash, idHash)).get();
  if (!row) return null;
  const parsedClaims = parseClaims(row.claims);
  return parsedClaims ? { ...row, parsedClaims } : null;
}

export async function touchSession(idHash: string, now: number) {
  ensureReady().update(sessions).set({ lastSeenAt: now }).where(eq(sessions.idHash, idHash)).run();
}

/** A good answer from the portal: refresh the claims everywhere we keep them. */
export async function recordGoodCheck(email: string, claims: Claims, now: number) {
  const db = ensureReady();
  db.transaction((tx) => {
    tx.update(sessions)
      .set({ claims: JSON.stringify(claims), personId: claims.personId, checkedAt: now, lastGoodCheckAt: now, checkFailedAt: null })
      .where(eq(sessions.email, email))
      .run();
    upsertPersonTx(tx, claims, now);
  });
}

export async function recordFailedCheck(idHash: string, now: number) {
  ensureReady().update(sessions).set({ checkFailedAt: now }).where(eq(sessions.idHash, idHash)).run();
}

export async function deleteSession(idHash: string) {
  ensureReady().delete(sessions).where(eq(sessions.idHash, idHash)).run();
}

/** The portal refused this person: end every session they have. */
export async function deleteSessionsFor(email: string) {
  ensureReady().delete(sessions).where(eq(sessions.email, email)).run();
}

export async function purgeExpiredSessions(now: number, idleMs: number) {
  ensureReady()
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, now), lt(sessions.lastSeenAt, now - idleMs)))
    .run();
}

function knownPeople(db: DbLike) {
  return db
    .select()
    .from(people)
    .all()
    .map((row) => ({ row, claims: parseClaims(row.claims) }))
    .filter((item): item is { row: typeof people.$inferSelect; claims: Claims } => item.claims !== null);
}

function assignableFor(db: DbLike, route: string): PersonOption[] {
  return knownPeople(db)
    .filter((item) => canBeAssigned(claimsToActor(item.claims), route))
    .map((item) => ({ email: item.row.email, name: item.row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** BR-41: the routed committee's chair; the support lead when the committee has no chair. */
function newRequestRecipients(db: DbLike, route: string, extra: string[]) {
  const everyone = knownPeople(db);
  const chairs = everyone.filter((item) => isRouteChair(claimsToActor(item.claims), route));
  const chosen = chairs.length ? chairs : everyone.filter((item) => isSupportLead(claimsToActor(item.claims)));
  return [...new Set([...chosen.map((item) => item.row.email), ...extra.map((item) => item.toLowerCase())])];
}

// ---------------------------------------------------------------------------------------------
// Outbox

function enqueueEmail(db: DbLike, to: string, content: EmailContent, requestId: number | null, kind: "email" | "alert" = "email") {
  const now = Date.now();
  db.insert(outbox)
    .values({ kind, toAddress: to, subject: content.subject, html: content.html, text: content.text, status: "PENDING", attempts: 0, nextAttemptAt: now, requestId, createdAt: now, updatedAt: now })
    .run();
}

export async function queueAlert(to: string[], content: EmailContent) {
  const db = ensureReady();
  for (const address of [...new Set(to)]) enqueueEmail(db, address, content, null, "alert");
}

/** Several emails at once, in one transaction (the daily digest). */
export async function queueEmails(items: { to: string; content: EmailContent }[]) {
  const db = ensureReady();
  db.transaction((tx) => {
    for (const item of items) enqueueEmail(tx, item.to, item.content, null);
  });
}

export async function dueOutboxItems(now: number, limit = 20) {
  return ensureReady()
    .select()
    .from(outbox)
    .where(and(eq(outbox.status, "PENDING"), lt(outbox.nextAttemptAt, now + 1)))
    .orderBy(asc(outbox.nextAttemptAt))
    .limit(limit)
    .all();
}

export async function updateOutboxItem(id: number, patch: Partial<typeof outbox.$inferInsert>) {
  ensureReady()
    .update(outbox)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(outbox.id, id))
    .run();
}

export async function outboxOldestPendingMinutes(now = Date.now()) {
  const row = ensureReady().select({ oldest: sql<number | null>`min(${outbox.createdAt})` }).from(outbox).where(eq(outbox.status, "PENDING")).get();
  return row?.oldest ? Math.floor((now - row.oldest) / 60000) : 0;
}

export async function outboxForRequest(requestNumber: string) {
  const db = ensureReady();
  const row = db.select({ id: requests.id }).from(requests).where(eq(requests.requestNumber, requestNumber)).get();
  if (!row) return [];
  return db.select({ to: outbox.toAddress, subject: outbox.subject, status: outbox.status }).from(outbox).where(eq(outbox.requestId, row.id)).all();
}

// ---------------------------------------------------------------------------------------------
// Requests

function facts(row: RequestRow): RequestAccessFacts {
  return { requesterPersonId: row.requesterPersonId, requesterEmail: row.requesterEmail, status: row.status, routedCommittee: row.routedCommittee, completedAt: row.completedAt };
}

function addHistory(db: DbLike, requestId: number, actor: { email: string; name: string }, action: string, fromValue: string | null, toValue: string | null, memberVisible: boolean, now: number) {
  db.insert(history).values({ requestId, action, fromValue, toValue, actorEmail: actor.email, actorName: actor.name, memberVisible, createdAt: now }).run();
}

function insertFiles(db: DbLike, requestId: number, messageId: number | null, staged: StagedFile[], actor: Actor, now: number) {
  for (const file of staged) {
    db.insert(files)
      .values({ requestId, messageId, storageKey: file.storageKey, originalName: file.originalName, mime: file.mime, bytes: file.bytes, sha256: file.sha256, uploadedByEmail: actor.email, uploadedByName: actor.name, createdAt: now })
      .run();
    addHistory(db, requestId, actor, "file_added", null, file.originalName, true, now);
  }
}

function dueText(days: number) {
  return days === 1 ? "within 1 business day" : `within ${days} business days`;
}

export type NewRequestInput = {
  topicCode: string;
  urgency: string;
  subject: string;
  description: string;
  chosenCommittee: string | null;
  clientToken: string;
};

export async function countRequestsSince(actor: Actor, since: number) {
  const row = ensureReady()
    .select({ total: count() })
    .from(requests)
    .where(and(eq(requests.requesterEmail, actor.email), gte(requests.createdAt, since)))
    .get();
  return row?.total ?? 0;
}

/**
 * Saves a new request with its files and its emails in one transaction (BR-15 to BR-17). The
 * same clientToken twice returns the first request instead of making a second (BR-16).
 */
export async function createRequest(actor: Actor, input: NewRequestInput, staged: StagedFile[]): Promise<{ number: string; duplicate: boolean; dueAt: number }> {
  const db = ensureReady();
  const existing = db.select().from(requests).where(eq(requests.clientToken, input.clientToken)).get();
  if (existing) {
    discardStaged(staged);
    if (existing.requesterEmail !== actor.email) throw new StoreError("Please refresh the page and try again.", 409);
    return { number: existing.requestNumber, duplicate: true, dueAt: existing.responseDueAt };
  }
  const topic = db.select().from(topics).where(eq(topics.code, input.topicCode)).get();
  if (!topic || !topic.enabled) {
    discardStaged(staged);
    throw new StoreError("Please choose what you need help with.");
  }
  const now = Date.now();
  const current = readSettings(db);
  const days = input.urgency === "Urgent" ? current.urgentTargetDays : current.responseTargetDays;
  const dueAt = addBusinessDays(now, days);
  const route = routeForTopic(topic, input.chosenCommittee);
  const year = easternYear(now);
  let number = "";
  try {
    number = db.transaction(
      (tx) => {
        const counter = tx
          .insert(requestCounters)
          .values({ topicCode: topic.code, year, nextValue: 2 })
          .onConflictDoUpdate({ target: [requestCounters.topicCode, requestCounters.year], set: { nextValue: sql`${requestCounters.nextValue} + 1` } })
          .returning({ nextValue: requestCounters.nextValue })
          .get();
        const requestNumber = formatRequestNumber(topic.code, year, counter.nextValue - 1);
        const inserted = tx
          .insert(requests)
          .values({
            requestNumber,
            topicCode: topic.code,
            requesterPersonId: actor.personId,
            requesterName: actor.name,
            requesterEmail: actor.email,
            urgency: input.urgency,
            subject: input.subject,
            description: input.description,
            status: "RECEIVED",
            routedCommittee: route,
            chosenCommittee: input.chosenCommittee,
            responseDueAt: dueAt,
            clientToken: input.clientToken,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: requests.id })
          .get();
        addHistory(tx, inserted.id, actor, "created", null, route, false, now);
        insertFiles(tx, inserted.id, null, staged, actor, now);
        enqueueEmail(tx, actor.email, receivedEmail(actor.name, requestNumber, topic.label, dueText(days)), inserted.id);
        for (const to of newRequestRecipients(tx, route, current.notifyEmails)) {
          if (to === actor.email) continue;
          enqueueEmail(tx, to, newRequestStaffEmail(requestNumber, topic.label, input.urgency, routeName(route)), inserted.id);
        }
        return requestNumber;
      },
      { behavior: "immediate" },
    );
  } catch (error) {
    discardStaged(staged);
    // Two taps that raced past the first check: the unique client token stopped the second.
    const raced = db.select().from(requests).where(eq(requests.clientToken, input.clientToken)).get();
    if (raced && raced.requesterEmail === actor.email) return { number: raced.requestNumber, duplicate: true, dueAt: raced.responseDueAt };
    throw error;
  }
  commitStaged(staged);
  return { number, duplicate: false, dueAt };
}

function summaryOf(row: RequestRow, labels: Map<string, string>): RequestSummary {
  return {
    number: row.requestNumber,
    topicCode: row.topicCode,
    topicLabel: labels.get(row.topicCode) ?? row.topicCode,
    subject: row.subject,
    urgency: row.urgency,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status as StatusCode] ?? row.status,
    committeeName: routeName(row.routedCommittee),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function ownerCondition(actor: Actor): SQL {
  const byEmail = eq(requests.requesterEmail, actor.email);
  return actor.personId ? (or(byEmail, eq(requests.requesterPersonId, actor.personId)) as SQL) : byEmail;
}

/** BR-20: the member's own requests, newest first. */
export async function listMyRequests(actor: Actor): Promise<RequestSummary[]> {
  const db = ensureReady();
  const labels = topicLabels(db);
  return db
    .select()
    .from(requests)
    .where(ownerCondition(actor))
    .orderBy(desc(requests.createdAt), desc(requests.id))
    .limit(200)
    .all()
    .map((row) => summaryOf(row, labels));
}

function isPastTarget(row: RequestRow, now: number) {
  return row.firstResponseAt === null && row.status !== "WAITING" && (OPEN_STATUSES as string[]).includes(row.status) && now > row.responseDueAt;
}

function fileView(row: typeof files.$inferSelect): FileView {
  return { id: row.id, name: row.originalName, mime: row.mime, bytes: row.bytes, uploadedBy: row.uploadedByName, createdAt: row.createdAt };
}

function historyText(row: typeof history.$inferSelect, forMember: boolean) {
  switch (row.action) {
    case "created":
      return forMember ? "Request sent" : `Request created and routed to ${routeName(row.toValue)}`;
    case "status":
      return `Status changed to ${STATUS_LABELS[row.toValue as StatusCode] ?? row.toValue}`;
    case "assigned":
      return row.toValue ? `${row.toValue} is now the lead contact` : "Lead contact removed";
    case "rerouted":
      return forMember ? `Your request is now with the ${routeName(row.toValue)}` : `Rerouted from ${routeName(row.fromValue)} to ${routeName(row.toValue)}`;
    case "reopened":
      return "Request reopened";
    case "withdrawn":
      return "Request withdrawn";
    case "file_added":
      return `File added: ${row.toValue ?? ""}`;
    case "reply":
      return "Reply sent to the member";
    case "member_message":
      return "Member added details";
    case "note":
      return "Internal note added";
    default:
      return row.action;
  }
}

const MEMBER_EVENT_ACTIONS = new Set(["status", "assigned", "rerouted", "reopened", "withdrawn"]);

function buildView(db: DbLike, row: RequestRow, actor: Actor, now: number): RequestView {
  const labels = topicLabels(db);
  const accessFacts = facts(row);
  const staff = can(actor, "view_internal", accessFacts, now);
  const allFiles = db.select().from(files).where(eq(files.requestId, row.id)).orderBy(asc(files.id)).all();
  const messageRows = db.select().from(messages).where(eq(messages.requestId, row.id)).orderBy(asc(messages.createdAt), asc(messages.id)).all();
  const historyRows = db.select().from(history).where(eq(history.requestId, row.id)).orderBy(asc(history.createdAt), asc(history.id)).all();

  const conversation: ConversationItem[] = [];
  for (const message of messageRows) {
    conversation.push({
      kind: "message",
      id: message.id,
      authorName: message.authorName,
      authorRole: message.authorRole === "staff" ? "staff" : message.authorRole === "system" ? "system" : "member",
      body: message.body,
      createdAt: message.createdAt,
      files: allFiles.filter((file) => file.messageId === message.id).map(fileView),
    });
  }
  for (const event of historyRows) {
    if (!event.memberVisible || !MEMBER_EVENT_ACTIONS.has(event.action)) continue;
    conversation.push({ kind: "event", id: event.id, text: historyText(event, true), createdAt: event.createdAt });
  }
  conversation.sort((a, b) => a.createdAt - b.createdAt || (a.kind === b.kind ? a.id - b.id : a.kind === "message" ? -1 : 1));

  const request: MemberRequestView = {
    number: row.requestNumber,
    topicCode: row.topicCode,
    topicLabel: labels.get(row.topicCode) ?? row.topicCode,
    subject: row.subject,
    description: row.description,
    urgency: row.urgency,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status as StatusCode] ?? row.status,
    committeeName: routeName(row.routedCommittee),
    leadContact: row.assigneeName ?? routeName(row.routedCommittee),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    reopenUntil: row.reopenUntil,
    isOwner: isOwner(actor, accessFacts),
    canReply: can(actor, "member_reply", accessFacts, now),
    canWithdraw: can(actor, "withdraw", accessFacts, now),
    canReopen: can(actor, "reopen", accessFacts, now),
    files: allFiles.filter((file) => file.messageId === null).map(fileView),
    conversation,
  };
  if (!staff) return { request };

  const notes = db.select().from(internalNotes).where(eq(internalNotes.requestId, row.id)).orderBy(asc(internalNotes.createdAt), asc(internalNotes.id)).all();
  const historyView: HistoryView[] = historyRows.map((event) => ({ id: event.id, text: historyText(event, false), actorName: event.actorName, createdAt: event.createdAt, memberVisible: event.memberVisible }));
  const extras: StaffExtras = {
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    routedCommittee: row.routedCommittee,
    chosenCommittee: row.chosenCommittee,
    assigneeEmail: row.assigneeEmail,
    responseDueAt: row.responseDueAt,
    firstResponseAt: row.firstResponseAt,
    pastTarget: isPastTarget(row, now),
    notes: notes.map((note) => ({ id: note.id, authorName: note.authorName, body: note.body, createdAt: note.createdAt })),
    history: historyView,
    assignable: assignableFor(db, row.routedCommittee),
    canAssign: can(actor, "assign", accessFacts, now),
    canReroute: can(actor, "reroute", accessFacts, now),
    canSetStatus: can(actor, "set_status", accessFacts, now),
    canStaffReply: can(actor, "staff_reply", accessFacts, now),
    canNote: can(actor, "note", accessFacts, now),
  };
  return { request, staff: extras };
}

function loadForActor(db: DbLike, number: string, actor: Actor, action: Parameters<typeof can>[1], now: number) {
  const row = db.select().from(requests).where(eq(requests.requestNumber, number)).get();
  // BR-21: someone else's request answers exactly as a number that does not exist.
  if (!row || !can(actor, "view", facts(row), now)) throw new StoreError("Not found", 404);
  if (!can(actor, action, facts(row), now)) throw new StoreError("That change is not available on this request.", 403);
  return row;
}

export async function getRequestView(number: string, actor: Actor): Promise<RequestView | null> {
  const db = ensureReady();
  const now = Date.now();
  const row = db.select().from(requests).where(eq(requests.requestNumber, number)).get();
  if (!row || !can(actor, "view", facts(row), now)) return null;
  return buildView(db, row, actor, now);
}

function leaveWaiting(row: RequestRow, now: number) {
  if (row.status !== "WAITING" || row.waitingSince === null) return {};
  return { responseDueAt: row.responseDueAt + businessMsBetween(row.waitingSince, now), waitingSince: null };
}

export type MessageKind = "member" | "staff" | "note";

/**
 * A member's follow-up (BR-23, reopening within 14 days per BR-24), a staff reply to the member
 * (BR-34, emailed), or an internal note (never shown to the member).
 */
export async function addMessage(number: string, actor: Actor, kind: MessageKind, body: string, staged: StagedFile[]) {
  const db = ensureReady();
  const now = Date.now();
  let row: RequestRow;
  try {
    row = loadForActor(db, number, actor, kind === "member" ? "member_reply" : kind === "staff" ? "staff_reply" : "note", now);
  } catch (error) {
    discardStaged(staged);
    throw error;
  }
  if (kind === "note" && staged.length) {
    discardStaged(staged);
    throw new StoreError("Internal notes cannot carry files. Attach files to a reply instead.");
  }
  try {
    db.transaction(
      (tx) => {
        if (kind === "note") {
          tx.insert(internalNotes).values({ requestId: row.id, authorEmail: actor.email, authorName: actor.name, body, createdAt: now }).run();
          addHistory(tx, row.id, actor, "note", null, null, false, now);
          tx.update(requests).set({ updatedAt: now }).where(eq(requests.id, row.id)).run();
          return;
        }
        if (staged.length) {
          // BR-13: 5 files per request in all, counted inside the write lock so two uploads at
          // once cannot both squeeze past the limit.
          const already = tx.select({ total: count() }).from(files).where(eq(files.requestId, row.id)).get()?.total ?? 0;
          const refusal = filesCapMessage(already, staged.length);
          if (refusal) throw new StoreError(refusal);
        }
        const message = tx
          .insert(messages)
          .values({ requestId: row.id, authorEmail: actor.email, authorPersonId: actor.personId, authorName: actor.name, authorRole: kind, body, createdAt: now })
          .returning({ id: messages.id })
          .get();
        insertFiles(tx, row.id, message.id, staged, actor, now);
        const patch: Partial<typeof requests.$inferInsert> = { updatedAt: now };
        if (kind === "staff") {
          addHistory(tx, row.id, actor, "reply", null, null, false, now);
          if (row.firstResponseAt === null) patch.firstResponseAt = now;
          enqueueEmail(tx, row.requesterEmail, staffReplyEmail(row.requesterName, row.requestNumber), row.id);
        } else {
          addHistory(tx, row.id, actor, "member_message", null, null, false, now);
          if (row.status === "COMPLETED") {
            const current = readSettings(tx);
            const days = row.urgency === "Urgent" ? current.urgentTargetDays : current.responseTargetDays;
            Object.assign(patch, { status: "REVIEW", completedAt: null, reopenUntil: null, responseDueAt: addBusinessDays(now, days) });
            addHistory(tx, row.id, actor, "reopened", "COMPLETED", "REVIEW", true, now);
          } else if (row.status === "WAITING") {
            Object.assign(patch, { status: "WORKING", ...leaveWaiting(row, now) });
            addHistory(tx, row.id, actor, "status", "WAITING", "WORKING", true, now);
          }
        }
        tx.update(requests).set(patch).where(eq(requests.id, row.id)).run();
      },
      { behavior: "immediate" },
    );
  } catch (error) {
    discardStaged(staged);
    throw error;
  }
  commitStaged(staged);
}

/** BR-33, BR-35: Completed needs a resolution note to the member, which is sent as a reply. */
export async function setStatus(number: string, actor: Actor, status: string, resolution: string) {
  if (!isStatusCode(status) || status === "WITHDRAWN") throw new StoreError("Choose a status.");
  const db = ensureReady();
  const now = Date.now();
  const row = loadForActor(db, number, actor, "set_status", now);
  if (row.status === "WITHDRAWN") throw new StoreError("This request was withdrawn by the member.");
  if (status === row.status) return;
  if (status === "COMPLETED" && resolution.trim().length < 5) {
    throw new StoreError("Write a resolution note to the member before marking this request completed.");
  }
  db.transaction(
    (tx) => {
      const patch: Partial<typeof requests.$inferInsert> = { status, updatedAt: now, ...leaveWaiting(row, now) };
      if (status === "WAITING") patch.waitingSince = now;
      if (status === "COMPLETED") {
        tx.insert(messages)
          .values({ requestId: row.id, authorEmail: actor.email, authorPersonId: actor.personId, authorName: actor.name, authorRole: "staff", body: resolution.trim(), createdAt: now })
          .run();
        addHistory(tx, row.id, actor, "reply", null, null, false, now);
        patch.completedAt = now;
        patch.reopenUntil = reopenDeadline(now);
        if (row.firstResponseAt === null) patch.firstResponseAt = now;
      } else if (row.status === "COMPLETED") {
        patch.completedAt = null;
        patch.reopenUntil = null;
      }
      tx.update(requests).set(patch).where(eq(requests.id, row.id)).run();
      addHistory(tx, row.id, actor, "status", row.status, status, true, now);
      if (status === "WAITING") enqueueEmail(tx, row.requesterEmail, waitingEmail(row.requesterName, row.requestNumber), row.id);
      if (status === "COMPLETED") enqueueEmail(tx, row.requesterEmail, completedEmail(row.requesterName, row.requestNumber, REOPEN_DAYS), row.id);
    },
    { behavior: "immediate" },
  );
}

/** BR-32: assign to a named person on the routed committee, or clear the assignment. */
export async function assign(number: string, actor: Actor, assigneeEmail: string | null) {
  const db = ensureReady();
  const now = Date.now();
  const row = loadForActor(db, number, actor, "assign", now);
  let assigneeName: string | null = null;
  if (assigneeEmail) {
    const wanted = assigneeEmail.toLowerCase();
    const option = assignableFor(db, row.routedCommittee).find((person) => person.email === wanted);
    if (!option) throw new StoreError("Choose someone on the KPI committee this request is routed to.");
    assigneeName = option.name;
    assigneeEmail = option.email;
  }
  if ((row.assigneeEmail ?? null) === (assigneeEmail ?? null)) return;
  db.transaction((tx) => {
    tx.update(requests).set({ assigneeEmail, assigneeName, updatedAt: now }).where(eq(requests.id, row.id)).run();
    addHistory(tx, row.id, actor, "assigned", row.assigneeName, assigneeName, true, now);
    if (assigneeEmail && assigneeEmail !== actor.email) enqueueEmail(tx, assigneeEmail, assignedEmail(assigneeName ?? "", row.requestNumber), row.id);
  });
}

/** BR-31: move a request to another KPI committee. The member sees where it went. */
export async function reroute(number: string, actor: Actor, route: string) {
  if (!isRouteCode(route)) throw new StoreError("Choose a KPI committee.");
  const db = ensureReady();
  const now = Date.now();
  const row = loadForActor(db, number, actor, "reroute", now);
  if (row.routedCommittee === route) return;
  const keepAssignee = row.assigneeEmail ? assignableFor(db, route).some((person) => person.email === row.assigneeEmail) : false;
  const current = readSettings(db);
  db.transaction((tx) => {
    tx.update(requests)
      .set({ routedCommittee: route, updatedAt: now, ...(keepAssignee ? {} : { assigneeEmail: null, assigneeName: null }) })
      .where(eq(requests.id, row.id))
      .run();
    addHistory(tx, row.id, actor, "rerouted", row.routedCommittee, route, true, now);
    if (row.assigneeEmail && !keepAssignee) addHistory(tx, row.id, actor, "assigned", row.assigneeName, null, true, now);
    for (const to of newRequestRecipients(tx, route, current.notifyEmails)) {
      if (to === actor.email) continue;
      enqueueEmail(tx, to, newRequestStaffEmail(row.requestNumber, topicLabels(tx).get(row.topicCode) ?? row.topicCode, row.urgency, routeName(route)), row.id);
    }
  });
}

/** BR-25 */
export async function withdraw(number: string, actor: Actor) {
  const db = ensureReady();
  const now = Date.now();
  const row = loadForActor(db, number, actor, "withdraw", now);
  db.transaction((tx) => {
    tx.update(requests).set({ status: "WITHDRAWN", updatedAt: now, ...leaveWaiting(row, now) }).where(eq(requests.id, row.id)).run();
    addHistory(tx, row.id, actor, "withdrawn", row.status, "WITHDRAWN", true, now);
  });
}

/** BR-37: a file opens only for someone who may see its request. */
export async function fileForDownload(id: number, actor: Actor) {
  const db = ensureReady();
  const file = db.select().from(files).where(eq(files.id, id)).get();
  if (!file) return null;
  const row = db.select().from(requests).where(eq(requests.id, file.requestId)).get();
  if (!row || !can(actor, "view", facts(row))) return null;
  return file;
}

export async function allStorageKeys() {
  return new Set(ensureReady().select({ key: files.storageKey }).from(files).all().map((row) => row.key));
}

// ---------------------------------------------------------------------------------------------
// Staff queue (BR-30)

export type QueueFilters = {
  q?: string;
  status?: string;
  topic?: string;
  urgency?: string;
  committee?: string;
  assignee?: string;
  age?: string;
};

export async function queue(actor: Actor, filters: QueueFilters): Promise<QueueRow[]> {
  if (!canGlobal(actor, "view_queue")) throw new StoreError("Not found", 404);
  const db = ensureReady();
  const now = Date.now();
  const conditions: SQL[] = [];
  if (!canGlobal(actor, "view_all")) {
    const routes = staffRoutes(actor);
    conditions.push(routes.length ? inArray(requests.routedCommittee, routes) : sql`0`);
  }
  const status = filters.status || "open";
  if (status === "open") conditions.push(inArray(requests.status, OPEN_STATUSES));
  else if (status !== "all" && isStatusCode(status)) conditions.push(eq(requests.status, status));
  if (filters.topic) conditions.push(eq(requests.topicCode, filters.topic));
  if (filters.urgency) conditions.push(eq(requests.urgency, filters.urgency));
  if (filters.committee) conditions.push(eq(requests.routedCommittee, filters.committee));
  if (filters.assignee === "none") conditions.push(isNull(requests.assigneeEmail));
  else if (filters.assignee === "me") conditions.push(eq(requests.assigneeEmail, actor.email));
  else if (filters.assignee) conditions.push(eq(requests.assigneeEmail, filters.assignee.toLowerCase()));
  const ageDays = Number(filters.age);
  if (Number.isFinite(ageDays) && ageDays > 0) conditions.push(lt(requests.createdAt, now - ageDays * 86400000));
  const q = (filters.q ?? "").trim().slice(0, 100);
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
    conditions.push(
      sql`(${requests.requestNumber} like ${pattern} escape '\\' or ${requests.subject} like ${pattern} escape '\\' or ${requests.requesterName} like ${pattern} escape '\\' or ${requests.requesterEmail} like ${pattern} escape '\\')`,
    );
  }
  const labels = topicLabels(db);
  const rows = db
    .select()
    .from(requests)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(requests.createdAt), desc(requests.id))
    .limit(300)
    .all();
  return rows.map((row) => ({
    ...summaryOf(row, labels),
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    routedCommittee: row.routedCommittee,
    assigneeName: row.assigneeName,
    ageDays: Math.floor((now - row.createdAt) / 86400000),
    pastTarget: isPastTarget(row, now),
  }));
}

/** People a filter can name: everyone known who works a queue. */
export async function staffPeople(): Promise<PersonOption[]> {
  return knownPeople(ensureReady())
    .filter((item) => canGlobal(claimsToActor(item.claims), "view_queue"))
    .map((item) => ({ email: item.row.email, name: item.row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// Daily digest (TECH_SPEC 5.4)

/** Open requests with only the fields the digest may show. No titles, descriptions or notes. */
export async function digestRequests(now = Date.now()): Promise<DigestRequest[]> {
  const db = ensureReady();
  const labels = topicLabels(db);
  return db
    .select()
    .from(requests)
    .where(inArray(requests.status, OPEN_STATUSES))
    .orderBy(asc(requests.createdAt), asc(requests.id))
    .all()
    .map((row) => ({
      number: row.requestNumber,
      topicLabel: labels.get(row.topicCode) ?? row.topicCode,
      urgency: row.urgency,
      status: row.status,
      statusLabel: STATUS_LABELS[row.status as StatusCode] ?? row.status,
      createdAt: row.createdAt,
      routedCommittee: row.routedCommittee,
      assigneeEmail: row.assigneeEmail,
      pastTarget: isPastTarget(row, now),
    }));
}

/** Everyone who has signed in, with the roles from their latest sign-in. */
export async function digestPeople(): Promise<DigestPerson[]> {
  return knownPeople(ensureReady()).map((item) => ({ email: item.row.email, name: item.row.name, actor: claimsToActor(item.claims) }));
}

// ---------------------------------------------------------------------------------------------
// Reports (BR-50, BR-51)

export async function recordDeflection(topicCode: string, tipId: string) {
  ensureReady().insert(deflections).values({ topicCode: topicCode.slice(0, 8), tipId: tipId.slice(0, 40), createdAt: Date.now() }).run();
}

export type Report = {
  openBacklog: number;
  urgentOpen: number;
  pastTarget: number;
  averageAgeDays: number;
  byTopic: { label: string; count: number }[];
  byCommittee: { label: string; count: number }[];
  byStatus: { label: string; count: number }[];
  weekly: { label: string; count: number }[];
  firstResponseBusinessHours: number | null;
  firstResponseWithinTargetPercent: number | null;
  resolutionDays: number | null;
  deflections: number;
  totalRequests: number;
};

export async function report(actor: Actor, now = Date.now()): Promise<Report> {
  if (!canGlobal(actor, "reports")) throw new StoreError("Not found", 404);
  const db = ensureReady();
  const rows = db.select().from(requests).all();
  const labels = topicLabels(db);
  const open = rows.filter((row) => (OPEN_STATUSES as string[]).includes(row.status));
  const tally = (values: string[]) => {
    const map = new Map<string, number>();
    for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
    return [...map.entries()].map(([label, total]) => ({ label, count: total })).sort((a, b) => b.count - a.count);
  };
  const weekly: { label: string; count: number }[] = [];
  const week = 7 * 86400000;
  for (let index = 7; index >= 0; index -= 1) {
    const end = now - index * week;
    const start = end - week;
    const label = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", timeZone: "America/New_York" }).format(new Date(start + 86400000));
    weekly.push({ label, count: rows.filter((row) => row.createdAt >= start && row.createdAt < end).length });
  }
  const responded = rows.filter((row) => row.firstResponseAt !== null);
  const firstResponseBusinessHours = responded.length
    ? Math.round((responded.reduce((sum, row) => sum + businessMsBetween(row.createdAt, row.firstResponseAt as number), 0) / responded.length / 3600000) * 10) / 10
    : null;
  const withinTarget = responded.filter((row) => (row.firstResponseAt as number) <= row.responseDueAt).length;
  const completed = rows.filter((row) => row.status === "COMPLETED" && row.completedAt !== null);
  const resolutionDays = completed.length
    ? Math.round((completed.reduce((sum, row) => sum + ((row.completedAt as number) - row.createdAt), 0) / completed.length / 86400000) * 10) / 10
    : null;
  const deflected = db.select({ total: count() }).from(deflections).get()?.total ?? 0;
  return {
    openBacklog: open.length,
    urgentOpen: open.filter((row) => row.urgency === "Urgent").length,
    pastTarget: open.filter((row) => isPastTarget(row, now)).length,
    averageAgeDays: open.length ? Math.round((open.reduce((sum, row) => sum + (now - row.createdAt), 0) / open.length / 86400000) * 10) / 10 : 0,
    byTopic: tally(rows.map((row) => labels.get(row.topicCode) ?? row.topicCode)),
    byCommittee: tally(rows.map((row) => routeName(row.routedCommittee))),
    byStatus: tally(rows.map((row) => STATUS_LABELS[row.status as StatusCode] ?? row.status)),
    weekly,
    firstResponseBusinessHours,
    firstResponseWithinTargetPercent: responded.length ? Math.round((withinTarget / responded.length) * 100) : null,
    resolutionDays,
    deflections: deflected,
    totalRequests: rows.length,
  };
}

/** BR-51: what the queue shows, for administrators. No descriptions, notes or files. */
export async function exportRows(actor: Actor) {
  if (!canGlobal(actor, "export_csv")) throw new StoreError("Not found", 404);
  const db = ensureReady();
  const labels = topicLabels(db);
  const now = Date.now();
  return db
    .select()
    .from(requests)
    .orderBy(asc(requests.createdAt))
    .all()
    .map((row) => ({
      "Request number": row.requestNumber,
      Topic: labels.get(row.topicCode) ?? row.topicCode,
      Status: STATUS_LABELS[row.status as StatusCode] ?? row.status,
      Urgency: row.urgency,
      "KPI committee": routeName(row.routedCommittee),
      "Assigned to": row.assigneeName ?? "",
      "Member name": row.requesterName,
      "Member email": row.requesterEmail,
      Title: row.subject,
      Sent: new Date(row.createdAt).toISOString(),
      "First response": row.firstResponseAt ? new Date(row.firstResponseAt).toISOString() : "",
      Completed: row.completedAt ? new Date(row.completedAt).toISOString() : "",
      "Past response target": isPastTarget(row, now) ? "Yes" : "No",
    }));
}

export const ALL_ROUTES = ROUTES;
