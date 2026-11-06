// Runs the real data layer on a throw-away SUPPORT_DATA_DIR (invented people only): the 5-files-
// per-request cap on the server, the nightly backup and its check, the daily digest claim, and
// the alert list fetched from a stubbed portal.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kp-support-jobs-"));
process.env.SUPPORT_DATA_DIR = dataDir;
process.env.SUPPORT_URL = "http://localhost:3000";
process.env.SUPPORT_ALERT_EMAILS = "alerts@example.org";
delete process.env.SMTP_HOST;

const store = await import("../lib/server/store");
const { stageUploads } = await import("../lib/server/uploads");
const { runBackup, verifyBackup } = await import("../lib/server/backup");
const { maybeBackup, maybeDigest, backupHealth } = await import("../lib/server/scheduler");

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
const pdfs = (count: number, tag: string) => Array.from({ length: count }, (_, index) => new File([`${PDF}% ${tag}-${index}\n`], `${tag}-${index}.pdf`, { type: "application/pdf" }));

function claims(email: string, name: string, extra: Partial<import("../lib/server/sso").Claims> = {}) {
  return { email, name, personId: email, roles: ["member"], isAdmin: false, isStaff: false, committees: [], committeeRoles: {}, passwordChangedAt: null, mustChangePassword: false, ...extra };
}

const ada = claims("ada.member@example.org", "Ada Member");
const cara = claims("cara.chair@example.org", "Cara Chair", { isStaff: true, committees: ["digital_technology"], committeeRoles: { digital_technology: "chair" } });
let number = "";

test("a request holds 5 files in all; the server refuses the sixth with a plain message", async () => {
  await store.createSession("session-ada", ada, Date.now() + 3600_000);
  await store.createSession("session-cara", cara, Date.now() + 3600_000);
  const adaActor = store.claimsToActor(ada);
  const saved = await store.createRequest(adaActor, { topicCode: "BUG", urgency: "Normal", subject: "Page will not load", description: "Invented test request.", chosenCommittee: null, clientToken: "jobs-test-token-0000000001" }, await stageUploads(pdfs(3, "first")));
  number = saved.number;
  await assert.rejects(store.addMessage(number, adaActor, "member", "Three more", await stageUploads(pdfs(3, "second"))), (error: Error) => {
    assert.match(error.message, /already has 3 files, so you can add 2 more/);
    return true;
  });
  await store.addMessage(number, adaActor, "member", "Two more", await stageUploads(pdfs(2, "third")));
  // Staff replies count toward the same 5.
  await assert.rejects(store.addMessage(number, store.claimsToActor(cara), "staff", "One from staff", await stageUploads(pdfs(1, "staff"))), /which is the most one request can hold/);
  // A message with no file still goes through.
  await store.addMessage(number, adaActor, "member", "Just words", []);
  const view = await store.getRequestView(number, adaActor);
  const total = (view?.request.files.length ?? 0) + (view?.request.conversation ?? []).reduce((sum, item) => sum + (item.kind === "message" ? item.files.length : 0), 0);
  assert.equal(total, 5);
  // Refused uploads leave nothing behind in the uploads folder.
  const onDisk = fs.readdirSync(path.join(dataDir, "uploads")).filter((name) => /^[a-f0-9]{32}$/.test(name));
  assert.equal(onDisk.length, 5);
  assert.equal(fs.readdirSync(path.join(dataDir, "uploads")).filter((name) => name.startsWith("tmp-")).length, 0);
});

test("backup writes a checked copy, links unchanged files, and keeps 14 days", async () => {
  const backups = path.join(dataDir, "backups");
  fs.mkdirSync(backups, { recursive: true });
  // Twenty older days of backups, plus a file that is not a backup.
  for (let day = 1; day <= 20; day += 1) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    fs.writeFileSync(path.join(backups, `support-${date}.db`), "old");
    fs.mkdirSync(path.join(backups, `uploads-${date}`));
  }
  fs.writeFileSync(path.join(backups, "keep-me.txt"), "not a backup");

  const first = await runBackup(Date.UTC(2026, 10, 3, 7, 5)); // 2:05 AM EST on 11/03
  assert.equal(first.ok, true, first.error ?? "");
  assert.equal(first.integrity, "ok");
  assert.equal(first.requestCount, 1);
  assert.equal(first.uploadFiles, 5);
  assert.equal(first.uploadFilesCopied, 5);

  await store.addMessage(number, store.claimsToActor(ada), "member", "No files", []);
  const second = await runBackup(Date.UTC(2026, 10, 4, 7, 5));
  assert.equal(second.ok, true, second.error ?? "");
  assert.equal(second.uploadFilesCopied, 0, "unchanged files are hard-linked, not copied again");
  const key = fs.readdirSync(path.join(backups, "uploads-2026-11-04"))[0];
  assert.equal(fs.statSync(path.join(backups, "uploads-2026-11-04", key)).ino, fs.statSync(path.join(backups, "uploads-2026-11-03", key)).ino);

  const names = fs.readdirSync(backups).sort();
  const dbDays = names.filter((name) => /^support-\d{4}-\d{2}-\d{2}\.db$/.test(name));
  assert.equal(dbDays.length, 14);
  assert.equal(dbDays[0], "support-2026-09-09.db");
  assert.ok(names.includes("keep-me.txt"), "files that are not backups are left alone");
  assert.ok(fs.existsSync(path.join(dataDir, "support.db")), "live data is never removed");

  const check = verifyBackup(path.join(backups, "support-2026-11-04.db"), path.join(backups, "uploads-2026-11-04"));
  assert.deepEqual(check, { integrity: "ok", requestCount: 1, missingFiles: 0, ok: true });
  const recorded = await store.recentBackups(5);
  assert.equal(recorded[0].status, "OK");
  assert.equal(recorded[0].requestCount, 1);
  assert.equal((await backupHealth()).ok, true);
});

test("a damaged backup copy fails its check", () => {
  const bad = path.join(dataDir, "damaged.db");
  fs.writeFileSync(bad, "this is not a database");
  const check = verifyBackup(bad, path.join(dataDir, "uploads"));
  assert.equal(check.ok, false);
});

test("the scheduler claims each day once", async () => {
  const at = Date.UTC(2026, 10, 5, 13, 30); // Thu 11/05/2026 8:30 AM EST
  const firstBackup = await maybeBackup(at);
  assert.equal(firstBackup?.ok, true);
  assert.equal(await maybeBackup(at + 60_000), null, "second tick the same day does nothing");

  const queued = await maybeDigest(at);
  assert.equal(queued, 1, "one digest, to the D&T chair");
  assert.equal(await maybeDigest(at + 60_000), null);
  assert.equal(await maybeDigest(Date.UTC(2026, 10, 11, 13, 30)), null, "no digest on Veterans Day");
});

// --- the alert list from the portal (Jack, 11/06/2026) ----------------------------------------

const { getAlertRecipients, refreshAlertRecipients } = await import("../lib/server/alert-recipients");
const { default: Database } = await import("better-sqlite3");

function alertRows(subject: string) {
  const db = new Database(path.join(dataDir, "support.db"), { readonly: true });
  try {
    return db.prepare("select to_address as toAddress, created_at as createdAt from outbox where kind = 'alert' and subject like ? order by id").all(`%${subject}%`) as { toAddress: string }[];
  } finally {
    db.close();
  }
}

type PortalAnswer = { status: number; body: unknown } | "unreachable";
let portalAnswer: PortalAnswer = "unreachable";
const realFetch = globalThis.fetch;
const signedCalls: { url: string; body: string; signature: string }[] = [];

test("alert list: SUPPORT_ALERT_EMAILS, then the default, before any fetch; the portal's list after", async () => {
  process.env.PORTAL_URL = "http://portal.invalid";
  process.env.SUPPORT_SSO_CLIENT_SECRET = "test-secret-for-the-settings-call";
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    signedCalls.push({ url: String(url), body: String(init?.body), signature: headers["x-kp-sso-signature"] });
    if (portalAnswer === "unreachable") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(portalAnswer.body), { status: portalAnswer.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  assert.equal((await getAlertRecipients()).source, "env");
  assert.deepEqual((await getAlertRecipients()).emails, ["alerts@example.org"]);
  delete process.env.SUPPORT_ALERT_EMAILS;
  assert.deepEqual(await getAlertRecipients(), { emails: ["cto@orderofkpi.org"], source: "default", fetchedAt: null, portalUpdatedAt: null });

  const t0 = Date.UTC(2026, 10, 6, 15, 0);
  portalAnswer = { status: 200, body: { alertEmails: ["Ops.Lead@example.org", "cto@orderofkpi.org"], updatedAt: "2026-11-06T14:59:00.000Z" } };
  const result = await refreshAlertRecipients(t0);
  assert.equal(result.ok, true);
  const call = signedCalls.at(-1)!;
  assert.equal(call.url, "http://portal.invalid/api/support-sso/settings");
  assert.equal(call.body, "{}");
  assert.match(call.signature, /^[0-9a-f]{64}$/);
  assert.deepEqual(await getAlertRecipients(), { emails: ["ops.lead@example.org", "cto@orderofkpi.org"], source: "portal", fetchedAt: t0, portalUpdatedAt: "2026-11-06T14:59:00.000Z" });
  process.env.SUPPORT_ALERT_EMAILS = "alerts@example.org";
  assert.equal((await getAlertRecipients()).source, "portal", "the portal's list beats SUPPORT_ALERT_EMAILS once fetched");
});

test("alert list: a failed or invalid fetch keeps the last good list; alerts go to it", async () => {
  const t0 = Date.UTC(2026, 10, 6, 15, 0);
  for (const answer of [
    "unreachable" as const,
    { status: 503, body: { error: "SUPPORT_SSO_NOT_CONFIGURED" } },
    { status: 401, body: { error: "BAD_SIGNATURE" } },
    { status: 200, body: { alertEmails: [] } },
    { status: 200, body: { alertEmails: ["not-an-email"], updatedAt: null } },
    { status: 200, body: { alertEmails: Array.from({ length: 11 }, (_, index) => `p${index}@example.org`) } },
  ]) {
    portalAnswer = answer;
    const result = await refreshAlertRecipients(t0 + 10 * 60_000);
    assert.equal(result.ok, false, JSON.stringify(answer));
    assert.equal(result.ok === false && result.staleAlertSent, false, "a failed fetch is not itself an alert");
    const now = await getAlertRecipients();
    assert.equal(now.source, "portal");
    assert.deepEqual(now.emails, ["ops.lead@example.org", "cto@orderofkpi.org"]);
    assert.equal(now.fetchedAt, t0);
  }
  const { sendAlert } = await import("../lib/server/alert-recipients");
  await sendAlert("The nightly backup failed", ["Invented test failure."]);
  assert.deepEqual(alertRows("The nightly backup failed").map((row) => row.toAddress), ["ops.lead@example.org", "cto@orderofkpi.org"]);
  const { getAlertListStatus } = await import("../lib/server/alert-recipients");
  const status = await getAlertListStatus();
  assert.ok(status?.lastFailureAt && status.lastFailure, "the failure is recorded");
});

test("alert list: no good fetch for 24 hours sends one alert to the current list, at most every 6 hours", async () => {
  const t0 = Date.UTC(2026, 10, 6, 15, 0);
  const hour = 3_600_000;
  portalAnswer = "unreachable";
  const sent: boolean[] = [];
  for (const at of [t0 + 23 * hour, t0 + 24 * hour, t0 + 25 * hour, t0 + 29.9 * hour, t0 + 30 * hour, t0 + 31 * hour]) {
    const result = await refreshAlertRecipients(at);
    sent.push(result.ok === false && result.staleAlertSent);
  }
  assert.deepEqual(sent, [false, true, false, false, true, false]);
  const rows = alertRows("The alert list could not be refreshed");
  assert.equal(rows.length, 4, "two alerts, each to the two addresses on the last good list");
  assert.deepEqual([...new Set(rows.map((row) => row.toAddress))], ["ops.lead@example.org", "cto@orderofkpi.org"]);

  // A good fetch starts the 24 hours again.
  portalAnswer = { status: 200, body: { alertEmails: ["cto@orderofkpi.org"], updatedAt: null } };
  assert.equal((await refreshAlertRecipients(t0 + 32 * hour)).ok, true);
  assert.deepEqual((await getAlertRecipients()).emails, ["cto@orderofkpi.org"]);
  portalAnswer = "unreachable";
  const later = await refreshAlertRecipients(t0 + 40 * hour);
  assert.equal(later.ok === false && later.staleAlertSent, false);
  globalThis.fetch = realFetch;
});
