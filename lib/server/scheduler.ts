// Timed jobs, run from the outbox worker's tick inside the Node process (no cron):
//   - the nightly backup at 2:00 AM US Eastern (BR-62);
//   - the daily digest at 8:00 AM US Eastern on business days (TECH_SPEC 5.4);
//   - the "no good backup in 26 hours" alarm (BR-61).
//
// A job runs on the first tick at or after its time on a day it has not yet run, so a server that
// was down at 2:00 AM backs up when it comes back. The digest only catches up until noon (four
// hours after its time), so a restart in the evening does not send a morning email. Each day is claimed in the database first
// (claimMarker), so a second process or an overlapping tick cannot run the same day twice; an
// in-process flag stops a slow run from overlapping itself. SUPPORT_BACKUP_AT and
// SUPPORT_DIGEST_AT ("HH:MM") move the times, for testing.

import { runBackup } from "./backup";
import { easternDateKey, easternMinuteOfDay, isBusinessDay } from "./business-time";
import { alertEmails, backupAtMinutes, digestAtMinutes } from "./config";
import { buildDigest } from "./digest";
import { alertEmail } from "./email";
import { claimMarker, getMarker, lastSuccessfulBackupAt, queueAlert, queueEmails, setMarker } from "./store";

const HOUR_MS = 60 * 60 * 1000;
/** A backup older than this is "missed" (one nightly run plus two hours of slack). */
export const BACKUP_STALE_HOURS = 26;

/** 2026-11-04 as 20261104, so later days compare as larger numbers. */
export function dayNumber(ms: number) {
  return Number(easternDateKey(ms).replace(/-/g, ""));
}

/** How long after its time a missed digest may still go out. */
export const DIGEST_CATCH_UP_MINUTES = 4 * 60;

/** Is a job set for `atMinutes` past Eastern midnight due at `now`? `windowMinutes` limits how late it may run. */
export function isJobDue(now: number, atMinutes: number, businessDaysOnly: boolean, windowMinutes = 24 * 60) {
  if (businessDaysOnly && !isBusinessDay(now)) return false;
  const minute = easternMinuteOfDay(now);
  return minute >= atMinutes && minute < atMinutes + windowMinutes;
}

const state = globalThis as unknown as { __kpBackupRunning?: boolean; __kpDigestRunning?: boolean };

async function alert(summary: string, details: string[]) {
  const to = alertEmails();
  if (to.length) await queueAlert(to, alertEmail(summary, details));
}

export async function maybeBackup(now = Date.now()) {
  if (state.__kpBackupRunning) return null;
  if (!isJobDue(now, backupAtMinutes(), false)) return null;
  if (now < (await getMarker("backup-next-try"))) return null;
  const previousDay = await getMarker("backup-day");
  if (!(await claimMarker("backup-day", dayNumber(now)))) return null;
  state.__kpBackupRunning = true;
  try {
    const result = await runBackup(now);
    if (result.ok) {
      console.log(`[support] backup ${result.fileName}: ${result.integrity}, ${result.requestCount} requests, ${result.uploadFiles} files (${result.uploadFilesCopied} copied)${result.removed.length ? `, removed ${result.removed.join(", ")}` : ""}`);
      return result;
    }
    console.error(`[support] backup failed: ${result.error}`);
    // Give the day back so it is tried again in an hour.
    await setMarker("backup-day", previousDay);
    await setMarker("backup-next-try", Date.now() + HOUR_MS);
    if (Date.now() - (await getMarker("backup-failed-alert")) >= 6 * HOUR_MS) {
      await setMarker("backup-failed-alert", Date.now());
      await alert("The nightly backup failed", [
        `The Support Center could not make a good backup (${result.fileName}).`,
        `What went wrong: ${result.error ?? "unknown"}`,
        "It will try again every hour. The live data is not affected. Please check the server's disk space and the backups folder.",
      ]);
    }
    return result;
  } finally {
    state.__kpBackupRunning = false;
  }
}

export async function maybeDigest(now = Date.now()) {
  if (state.__kpDigestRunning) return null;
  if (!isJobDue(now, digestAtMinutes(), true, DIGEST_CATCH_UP_MINUTES)) return null;
  if (!(await claimMarker("digest-day", dayNumber(now)))) return null;
  state.__kpDigestRunning = true;
  try {
    const emails = await buildDigest(now);
    if (emails.length) await queueEmails(emails);
    console.log(`[support] daily digest: ${emails.length} email(s) queued`);
    return emails.length;
  } finally {
    state.__kpDigestRunning = false;
  }
}

/** Hours since the last good backup, and whether that is fine. With none yet, counts from first start. */
export async function backupHealth(now = Date.now()) {
  const last = await lastSuccessfulBackupAt();
  let watchStart = await getMarker("backup-watch-start");
  if (!watchStart) {
    watchStart = now;
    await setMarker("backup-watch-start", now);
  }
  const lastBackupHoursAgo = last === null ? null : Math.round(((now - last) / HOUR_MS) * 10) / 10;
  const ok = last !== null ? now - last <= BACKUP_STALE_HOURS * HOUR_MS : now - watchStart <= BACKUP_STALE_HOURS * HOUR_MS;
  return { ok, lastBackupHoursAgo };
}

export async function checkBackupFreshness(now = Date.now()) {
  const health = await backupHealth(now);
  if (health.ok) return health;
  if (now - (await getMarker("backup-missed-alert")) < 24 * HOUR_MS) return health;
  await setMarker("backup-missed-alert", now);
  await alert("No backup in the last 26 hours", [
    health.lastBackupHoursAgo === null ? "The Support Center has not made a good backup yet." : `The last good backup finished ${health.lastBackupHoursAgo} hours ago.`,
    "The nightly backup runs at 2:00 AM Eastern inside the Support Center. Please check that the site is running and that the backups folder can be written to.",
  ]);
  return health;
}

export async function runScheduledJobs(now = Date.now()) {
  await maybeBackup(now);
  await maybeDigest(now);
  await checkBackupFreshness(now);
}
