// Support Center database (TECH_SPEC section 4), SQLite through Drizzle.
// Times are whole milliseconds since 1970 UTC. Migrations: `npm run db:generate`.

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const requests = sqliteTable(
  "requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestNumber: text("request_number").notNull().unique(),
    topicCode: text("topic_code").notNull(),
    requesterPersonId: text("requester_person_id"),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email").notNull(),
    urgency: text("urgency").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("RECEIVED"),
    routedCommittee: text("routed_committee").notNull(),
    chosenCommittee: text("chosen_committee"),
    assigneeEmail: text("assignee_email"),
    assigneeName: text("assignee_name"),
    firstResponseAt: integer("first_response_at"),
    completedAt: integer("completed_at"),
    reopenUntil: integer("reopen_until"),
    responseDueAt: integer("response_due_at").notNull(),
    waitingSince: integer("waiting_since"),
    clientToken: text("client_token").notNull().unique(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("requests_requester_email_idx").on(table.requesterEmail),
    index("requests_requester_person_idx").on(table.requesterPersonId),
    index("requests_status_idx").on(table.status),
    index("requests_routed_idx").on(table.routedCommittee),
  ],
);

export const requestCounters = sqliteTable(
  "request_counters",
  {
    topicCode: text("topic_code").notNull(),
    year: integer("year").notNull(),
    nextValue: integer("next_value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.topicCode, table.year] })],
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: integer("request_id").notNull().references(() => requests.id),
    authorEmail: text("author_email").notNull(),
    authorPersonId: text("author_person_id"),
    authorName: text("author_name").notNull(),
    /** member, staff or system. Every message here is shown to the member. */
    authorRole: text("author_role").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("messages_request_idx").on(table.requestId)],
);

/** Staff only. Never serialized for a member (BR-34). */
export const internalNotes = sqliteTable(
  "internal_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: integer("request_id").notNull().references(() => requests.id),
    authorEmail: text("author_email").notNull(),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("internal_notes_request_idx").on(table.requestId)],
);

export const files = sqliteTable(
  "files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: integer("request_id").notNull().references(() => requests.id),
    messageId: integer("message_id").references(() => messages.id),
    storageKey: text("storage_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    uploadedByEmail: text("uploaded_by_email").notNull(),
    uploadedByName: text("uploaded_by_name").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("files_request_idx").on(table.requestId)],
);

/** Append-only (BR-36). member_visible rows are the ones a member may read. */
export const history = sqliteTable(
  "history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: integer("request_id").notNull().references(() => requests.id),
    action: text("action").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    actorEmail: text("actor_email").notNull(),
    actorName: text("actor_name").notNull(),
    memberVisible: integer("member_visible", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("history_request_idx").on(table.requestId)],
);

export const topics = sqliteTable("topics", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  defaultRoute: text("default_route").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

/** Only the SHA-256 HMAC of the cookie value is kept (TECH_SPEC 3.2). */
export const sessions = sqliteTable(
  "sessions",
  {
    idHash: text("id_hash").primaryKey(),
    email: text("email").notNull(),
    personId: text("person_id"),
    claims: text("claims").notNull(),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    checkedAt: integer("checked_at").notNull(),
    lastGoodCheckAt: integer("last_good_check_at").notNull(),
    checkFailedAt: integer("check_failed_at"),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("sessions_email_idx").on(table.email)],
);

/** Everyone who has signed in, from their latest claims. Used to offer assignees. */
export const people = sqliteTable("people", {
  email: text("email").primaryKey(),
  personId: text("person_id"),
  name: text("name").notNull(),
  claims: text("claims").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const outbox = sqliteTable(
  "outbox",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** email, or alert (an alert that fails does not raise another alert). */
    kind: text("kind").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    /** PENDING, SENT, FAILED or NOT_CONFIGURED */
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    lastError: text("last_error"),
    requestId: integer("request_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    sentAt: integer("sent_at"),
  },
  (table) => [index("outbox_status_idx").on(table.status, table.nextAttemptAt)],
);

/** "This solved my question" choices (BR-14). No personal data. */
export const deflections = sqliteTable("deflections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicCode: text("topic_code").notNull(),
  tipId: text("tip_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** One row per nightly backup run (BR-62). Never holds member data, only counts. */
export const backups = sqliteTable(
  "backups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The Eastern date in the file name, YYYY-MM-DD. */
    backupDate: text("backup_date").notNull(),
    fileName: text("file_name").notNull(),
    /** OK or FAILED */
    status: text("status").notNull(),
    /** What PRAGMA integrity_check answered on the copy ("ok" when sound). */
    integrity: text("integrity"),
    requestCount: integer("request_count"),
    uploadFiles: integer("upload_files"),
    uploadFilesCopied: integer("upload_files_copied"),
    missingFiles: integer("missing_files"),
    bytes: integer("bytes"),
    error: text("error"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at").notNull(),
  },
  (table) => [index("backups_status_idx").on(table.status, table.finishedAt)],
);
