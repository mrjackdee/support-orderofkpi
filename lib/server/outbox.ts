// The email outbox worker (TECH_SPEC 5.3, BR-43, BR-61). Runs inside the Node process.
// Retries back off 1 m, 5 m, 30 m, 2 h, 6 h. When an item finally fails, or the oldest pending
// item is more than 30 minutes old, an alert goes to SUPPORT_ALERT_EMAILS. The same tick runs the
// timed jobs in ./scheduler (nightly backup, daily digest).

import nodemailer, { type Transporter } from "nodemailer";
import { alertEmails, outboxIntervalMs, SESSION_IDLE_MS, smtpConfig } from "./config";
import { alertEmail } from "./email";
import { runScheduledJobs } from "./scheduler";
import { sweepOrphans } from "./uploads";
import {
  allStorageKeys,
  dueOutboxItems,
  getMarker,
  outboxOldestPendingMinutes,
  purgeExpiredSessions,
  queueAlert,
  setMarker,
  updateOutboxItem,
} from "./store";

export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

/** When to try again after `attempts` failed tries, or null when there are no tries left. */
export function nextAttemptDelay(attempts: number) {
  return attempts >= 1 && attempts <= BACKOFF_MS.length ? BACKOFF_MS[attempts - 1] : null;
}

let transporter: Transporter | null = null;
let transporterKey = "";

function getTransporter() {
  const config = smtpConfig();
  if (!config) return null;
  const key = `${config.host}:${config.port}:${config.user}:${config.secure}`;
  if (!transporter || key !== transporterKey) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    transporterKey = key;
  }
  return { transporter, from: config.from };
}

let running = false;

export async function processOutbox(now = Date.now()) {
  if (running) return;
  running = true;
  try {
    const items = await dueOutboxItems(now);
    const smtp = getTransporter();
    for (const item of items) {
      if (!smtp) {
        // Recorded, not failed: the site works without email until SMTP is set up.
        await updateOutboxItem(item.id, { status: "NOT_CONFIGURED", lastError: "SMTP_HOST is not set" });
        continue;
      }
      try {
        await smtp.transporter.sendMail({ from: smtp.from, to: item.toAddress, subject: item.subject, html: item.html, text: item.text });
        await updateOutboxItem(item.id, { status: "SENT", attempts: item.attempts + 1, sentAt: Date.now(), lastError: null });
      } catch (error) {
        const attempts = item.attempts + 1;
        const delay = nextAttemptDelay(attempts);
        const message = error instanceof Error ? error.message.slice(0, 300) : "send failed";
        if (delay === null) {
          await updateOutboxItem(item.id, { status: "FAILED", attempts, lastError: message });
          if (item.kind !== "alert") {
            const to = alertEmails();
            if (to.length) {
              await queueAlert(to, alertEmail("An email could not be delivered", [
                `After ${attempts} tries the Support Center gave up sending "${item.subject}" to ${item.toAddress}.`,
                `Last error: ${message}`,
                "The request itself is saved. Please let the member know another way if this matters.",
              ]));
            }
          }
        } else {
          await updateOutboxItem(item.id, { attempts, nextAttemptAt: Date.now() + delay, lastError: message });
        }
      }
    }
    await checkStalledOutbox();
  } finally {
    running = false;
  }
}

async function checkStalledOutbox() {
  const minutes = await outboxOldestPendingMinutes();
  if (minutes <= 30) return;
  const now = Date.now();
  if (now - (await getMarker("outbox-stalled-alert")) < 60 * 60 * 1000) return;
  await setMarker("outbox-stalled-alert", now);
  const to = alertEmails();
  if (to.length) {
    await queueAlert(to, alertEmail("Support Center emails are waiting to send", [`The oldest email waiting to send is ${minutes} minutes old.`, "Check the SMTP settings on the host."]));
  }
}

async function dailyHousekeeping() {
  const now = Date.now();
  if (now - (await getMarker("housekeeping")) < 24 * 60 * 60 * 1000) return;
  await setMarker("housekeeping", now);
  await purgeExpiredSessions(now, SESSION_IDLE_MS);
  sweepOrphans(await allStorageKeys(), now);
}

const holder = globalThis as unknown as { __kpSupportWorker?: NodeJS.Timeout };

export function startBackgroundWorker() {
  if (holder.__kpSupportWorker) return;
  const tick = () => {
    processOutbox().catch((error) => console.error("[support] outbox error", error instanceof Error ? error.message : "unknown"));
    dailyHousekeeping().catch((error) => console.error("[support] housekeeping error", error instanceof Error ? error.message : "unknown"));
    // The nightly backup and the daily digest (./scheduler).
    runScheduledJobs().catch((error) => console.error("[support] scheduled job error", error instanceof Error ? error.message : "unknown"));
  };
  holder.__kpSupportWorker = setInterval(tick, outboxIntervalMs());
  holder.__kpSupportWorker.unref?.();
  setTimeout(tick, 2000).unref?.();
}

/** Send straight away after a change, rather than waiting for the next tick. */
export function kickOutbox() {
  setTimeout(() => {
    processOutbox().catch(() => undefined);
  }, 10).unref?.();
}
