// The daily digest (TECH_SPEC 5.4): at 8:00 AM US Eastern on business days, one email listing
// every open request that has nobody assigned or is past the response target. By CEO ruling of
// 11-05-2026 it goes only to the fixed digest address (SUPPORT_DIGEST_EMAILS, normally
// cto@orderofkpi.org), never to committee chairs. Nobody gets an empty digest. The emails go
// through the outbox like every other email.
//
// selectDigestFor is pure so it can be tested without a database. selectDigest (routing by chair)
// is kept for the record but no longer used.

import { digestEmails } from "./config";
import { digestEmail, type DigestLine, type EmailContent } from "./email";
import { isRouteChair, isSupportLead, type Actor } from "./permissions";
import { isOpenStatus } from "../shared/statuses";

export type DigestRequest = {
  number: string;
  topicLabel: string;
  urgency: string;
  status: string;
  statusLabel: string;
  createdAt: number;
  routedCommittee: string;
  assigneeEmail: string | null;
  pastTarget: boolean;
};

export type DigestPerson = { email: string; name: string; actor: Actor };

export type DigestReason = "unassigned" | "past_target";

export type DigestItem = DigestRequest & { reasons: DigestReason[] };

export type DigestRecipient = { email: string; name: string; items: DigestItem[] };

const REASON_TEXT: Record<DigestReason, string> = {
  unassigned: "Nobody assigned",
  past_target: "Past the response target",
};

export function reasonsFor(request: DigestRequest): DigestReason[] {
  if (!isOpenStatus(request.status)) return [];
  const reasons: DigestReason[] = [];
  if (!request.assigneeEmail) reasons.push("unassigned");
  if (request.pastTarget) reasons.push("past_target");
  return reasons;
}

/**
 * Who gets which requests. A request goes to every chair of its route; with no chair known, to
 * every support lead; with neither, to `fallback` (SUPPORT_ALERT_EMAILS), so it is never dropped.
 * Each person gets one list, oldest request first, even if they chair more than one route.
 */
export function selectDigest(requests: DigestRequest[], people: DigestPerson[], fallback: string[] = []): DigestRecipient[] {
  const byEmail = new Map<string, DigestRecipient>();
  const add = (email: string, name: string, item: DigestItem) => {
    const key = email.toLowerCase();
    const entry = byEmail.get(key) ?? { email: key, name, items: [] };
    if (!entry.items.some((existing) => existing.number === item.number)) entry.items.push(item);
    byEmail.set(key, entry);
  };
  const leads = people.filter((person) => isSupportLead(person.actor));
  for (const request of requests) {
    const reasons = reasonsFor(request);
    if (!reasons.length) continue;
    const item: DigestItem = { ...request, reasons };
    const chairs = people.filter((person) => isRouteChair(person.actor, request.routedCommittee));
    const chosen = chairs.length ? chairs : leads;
    if (chosen.length) {
      for (const person of chosen) add(person.email, person.name, item);
    } else {
      for (const email of fallback) add(email, "Support Center team", item);
    }
  }
  return [...byEmail.values()]
    .filter((entry) => entry.items.length > 0)
    .map((entry) => ({ ...entry, items: [...entry.items].sort((a, b) => a.createdAt - b.createdAt || a.number.localeCompare(b.number)) }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** Every listed recipient gets one email with all requests that need attention, oldest first. */
export function selectDigestFor(requests: DigestRequest[], recipients: string[]): DigestRecipient[] {
  const items: DigestItem[] = [];
  for (const request of requests) {
    const reasons = reasonsFor(request);
    if (reasons.length) items.push({ ...request, reasons });
  }
  if (!items.length) return [];
  items.sort((a, b) => a.createdAt - b.createdAt || a.number.localeCompare(b.number));
  const unique = [...new Set(recipients.map((email) => email.toLowerCase()))].sort();
  return unique.map((email) => ({ email, name: "Support Center team", items: [...items] }));
}

export function ageText(createdAt: number, now: number) {
  const days = Math.max(0, Math.floor((now - createdAt) / 86_400_000));
  if (days === 0) return "Sent today";
  return days === 1 ? "1 day old" : `${days} days old`;
}

export function digestLines(items: DigestItem[], now: number): DigestLine[] {
  return items.map((item) => ({
    number: item.number,
    topicLabel: item.topicLabel,
    urgency: item.urgency,
    statusLabel: item.statusLabel,
    ageText: ageText(item.createdAt, now),
    reasons: item.reasons.map((reason) => REASON_TEXT[reason]),
  }));
}

/** Builds the day's digest emails from the store. Returns nothing to send when nothing needs attention. */
export async function buildDigest(now = Date.now()): Promise<{ to: string; content: EmailContent }[]> {
  const { digestRequests } = await import("./store");
  const to = digestEmails();
  const recipients = selectDigestFor(await digestRequests(now), to);
  if (!to.length) console.error("[support] daily digest: no SUPPORT_DIGEST_EMAILS or SUPPORT_ALERT_EMAILS set; nothing sent");
  return recipients.map((recipient) => ({ to: recipient.email, content: digestEmail(recipient.name, digestLines(recipient.items, now)) }));
}
