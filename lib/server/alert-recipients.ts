// Who receives failure alerts (backup failed, no backup in 26 hours, an email that could not be
// delivered, emails stuck in the outbox, the portal sign-in check not answering).
//
// Jack ruled on 11/06/2026 that alerts go to cto@orderofkpi.org and that administrators keep the
// list on the orderofkpi.com Admin Dashboard. The Support Center fetches it from the portal
// (POST /api/support-sso/settings, signed like the other support-sso calls) when the server starts
// and every 10 minutes from the worker tick, and keeps the last good answer in its own database so
// it survives a restart. The list is resolved in this order:
//   1. the list most recently fetched from the portal ("portal");
//   2. never fetched: SUPPORT_ALERT_EMAILS ("env");
//   3. that unset too: cto@orderofkpi.org ("default").
// A failed or invalid fetch keeps the last good list and raises no alert by itself. Only when there
// has been no good fetch for 24 hours does one alert go to the current list, at most every 6 hours.
//
// The pure functions here are tested without a database; the store, the portal call and the email
// templates are imported when needed.

import { alertEmails as envAlertEmails, DEFAULT_ALERT_EMAIL, EMAIL_PATTERN, settingsRefreshMs } from "./config";

const HOUR_MS = 60 * 60 * 1000;

const easternFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
function easternDateTime(ms: number) {
  return easternFormatter.format(new Date(ms));
}
export const MAX_ALERT_RECIPIENTS = 10;
/** No good fetch for this long raises the "could not be refreshed" alert. */
export const ALERT_LIST_STALE_MS = 24 * HOUR_MS;
/** ...and that alert repeats at most this often. */
export const ALERT_LIST_STALE_REPEAT_MS = 6 * HOUR_MS;

export type AlertRecipientsSource = "portal" | "env" | "default";

/** What is kept in the database after a good fetch. */
export type StoredAlertList = { emails: string[]; fetchedAt: number; portalUpdatedAt: string | null };

/** Bookkeeping for the fetches, kept beside it. */
export type AlertListStatus = {
  /** When this copy first tried to fetch the list: counts as the last good fetch until there is one. */
  watchStart: number;
  lastFailureAt: number | null;
  lastFailure: string | null;
  lastStaleAlertAt: number | null;
};

export type ResolvedAlertRecipients = {
  emails: string[];
  source: AlertRecipientsSource;
  fetchedAt: number | null;
  portalUpdatedAt: string | null;
};

const STORE_KEY = "alert-list";
const STATUS_KEY = "alert-list-status";

export type PortalSettingsCheck = { ok: true; emails: string[]; updatedAt: string | null } | { ok: false; reason: string };

/**
 * Accepts the portal's answer only if it is exactly what the contract promises: `alertEmails`, a
 * list of 1 to 10 valid email addresses, and `updatedAt`, a string or null. Anything else is
 * treated as a failed fetch, so a broken answer can never empty or corrupt the alert list.
 */
export function validatePortalSettings(raw: unknown): PortalSettingsCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "the answer is not an object" };
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.alertEmails)) return { ok: false, reason: "alertEmails is missing" };
  if (value.alertEmails.length > MAX_ALERT_RECIPIENTS) return { ok: false, reason: `more than ${MAX_ALERT_RECIPIENTS} addresses` };
  const emails: string[] = [];
  for (const item of value.alertEmails) {
    if (typeof item !== "string") return { ok: false, reason: "an address is not text" };
    const email = item.trim().toLowerCase();
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return { ok: false, reason: "an address is not a valid email address" };
    if (!emails.includes(email)) emails.push(email);
  }
  if (!emails.length) return { ok: false, reason: "the list is empty" };
  const updatedAt = value.updatedAt;
  if (updatedAt !== undefined && updatedAt !== null && typeof updatedAt !== "string") return { ok: false, reason: "updatedAt is not text" };
  return { ok: true, emails, updatedAt: typeof updatedAt === "string" ? updatedAt.slice(0, 64) : null };
}

/** The resolution order: the stored portal list, else SUPPORT_ALERT_EMAILS, else cto@orderofkpi.org. */
export function resolveAlertRecipients(stored: StoredAlertList | null, envList: string[]): ResolvedAlertRecipients {
  const portalList = stored && Array.isArray(stored.emails) ? stored.emails.filter((item) => typeof item === "string" && EMAIL_PATTERN.test(item)) : [];
  if (stored && portalList.length) {
    return { emails: portalList, source: "portal", fetchedAt: Number(stored.fetchedAt) || null, portalUpdatedAt: stored.portalUpdatedAt ?? null };
  }
  if (envList.length) return { emails: [...new Set(envList)], source: "env", fetchedAt: null, portalUpdatedAt: null };
  return { emails: [DEFAULT_ALERT_EMAIL], source: "default", fetchedAt: null, portalUpdatedAt: null };
}

/**
 * Is the "alert list could not be refreshed" alert due? Only after 24 hours without a good fetch
 * (counted from the first attempt when there has never been one), and not within 6 hours of the
 * last such alert.
 */
export function isStaleAlertDue(input: { lastSuccessAt: number | null; watchStart: number; lastStaleAlertAt: number | null }, now: number) {
  const since = input.lastSuccessAt ?? input.watchStart;
  if (now - since < ALERT_LIST_STALE_MS) return false;
  return input.lastStaleAlertAt === null || now - input.lastStaleAlertAt >= ALERT_LIST_STALE_REPEAT_MS;
}

// ---------------------------------------------------------------------------------------------
// With the database

export async function getAlertRecipients(): Promise<ResolvedAlertRecipients> {
  const { getStateValue } = await import("./store");
  return resolveAlertRecipients(await getStateValue<StoredAlertList>(STORE_KEY), envAlertEmails());
}

export async function getAlertListStatus(): Promise<AlertListStatus | null> {
  const { getStateValue } = await import("./store");
  return getStateValue<AlertListStatus>(STATUS_KEY);
}

export function minutesSince(ms: number | null, now: number) {
  return ms === null ? null : Math.max(0, Math.round((now - ms) / 60_000));
}

/** For /staff/settings and /api/health: the current list, how fresh it is, and the last failed try. */
export async function alertListView(now = Date.now()) {
  const [alerts, status] = await Promise.all([getAlertRecipients(), getAlertListStatus()]);
  const lastFailureAt = status?.lastFailureAt ?? null;
  return {
    ...alerts,
    refreshedMinutesAgo: minutesSince(alerts.fetchedAt, now),
    lastFailureAt,
    failedSinceRefresh: lastFailureAt !== null && (alerts.fetchedAt === null || lastFailureAt > alerts.fetchedAt),
  };
}

export type AlertListView = Awaited<ReturnType<typeof alertListView>>;

/** Queues one alert email to every current recipient. */
export async function sendAlert(summary: string, details: string[]) {
  const [{ queueAlert }, { alertEmail }] = await Promise.all([import("./store"), import("./email")]);
  const { emails } = await getAlertRecipients();
  if (emails.length) await queueAlert(emails, alertEmail(summary, details));
}

export type RefreshResult = { ok: true; emails: string[] } | { ok: false; error: string; staleAlertSent: boolean };

/** Fetches the list from the portal once. A failure keeps the last good list. */
export async function refreshAlertRecipients(now = Date.now()): Promise<RefreshResult> {
  const { getStateValue, setStateValue } = await import("./store");
  const { fetchPortalSettings } = await import("./sso");
  const status: AlertListStatus = (await getStateValue<AlertListStatus>(STATUS_KEY)) ?? { watchStart: now, lastFailureAt: null, lastFailure: null, lastStaleAlertAt: null };
  let error: string;
  try {
    const check = validatePortalSettings(await fetchPortalSettings());
    if (check.ok) {
      await setStateValue(STORE_KEY, { emails: check.emails, fetchedAt: now, portalUpdatedAt: check.updatedAt } satisfies StoredAlertList);
      await setStateValue(STATUS_KEY, { ...status, lastFailureAt: null, lastFailure: null });
      return { ok: true, emails: check.emails };
    }
    error = `settings: the portal's answer was not usable (${check.reason})`;
  } catch (caught) {
    error = caught instanceof Error ? caught.message.slice(0, 200) : "settings: failed";
  }
  console.error(`[support] alert list not refreshed from the portal, keeping the last good list: ${error}`);
  const stored = await getStateValue<StoredAlertList>(STORE_KEY);
  const next: AlertListStatus = { ...status, lastFailureAt: now, lastFailure: error };
  const due = isStaleAlertDue({ lastSuccessAt: stored?.fetchedAt ?? null, watchStart: status.watchStart, lastStaleAlertAt: status.lastStaleAlertAt }, now);
  if (due) next.lastStaleAlertAt = now;
  await setStateValue(STATUS_KEY, next);
  if (due) {
    await sendAlert("The alert list could not be refreshed", [
      stored?.fetchedAt
        ? `The Support Center has not been able to fetch the list of who gets these alerts from the Member Portal since ${easternDateTime(stored.fetchedAt)}.`
        : "The Support Center has not been able to fetch the list of who gets these alerts from the Member Portal for 24 hours.",
      `What went wrong: ${error}`,
      "Alerts keep going to the last list it had, which includes you. Please check that the Member Portal is running and that both sites share the same support sign-in secret.",
    ]);
  }
  return { ok: false, error, staleAlertSent: due };
}

const state = globalThis as unknown as { __kpAlertListAttemptAt?: number; __kpAlertListRunning?: boolean };

/** From the worker tick: the first tick after start-up, then every 10 minutes. */
export async function maybeRefreshAlertRecipients(now = Date.now()) {
  if (state.__kpAlertListRunning) return null;
  if (state.__kpAlertListAttemptAt !== undefined && now - state.__kpAlertListAttemptAt < settingsRefreshMs()) return null;
  state.__kpAlertListAttemptAt = now;
  state.__kpAlertListRunning = true;
  try {
    return await refreshAlertRecipients(now);
  } finally {
    state.__kpAlertListRunning = false;
  }
}
