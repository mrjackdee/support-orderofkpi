// Unit tests that need no network and no server: permissions, numbering, file checks, the
// portal signature, business time and the outbox back-off.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { isStaleAlertDue, resolveAlertRecipients, validatePortalSettings } from "../lib/server/alert-recipients";
import { backupsToRemove } from "../lib/server/backup";
import { addBusinessDays, businessDaysBetween, businessMsBetween, easternYear, isBusinessDay } from "../lib/server/business-time";
import { csvCell } from "../lib/server/csv";
import { ageText, selectDigest, selectDigestFor, type DigestPerson, type DigestRequest } from "../lib/server/digest";
import { digestEmails } from "../lib/server/config";
import { safeFileName, sniffFile, zipEntryNames } from "../lib/server/file-check";
import { federalHolidays } from "../lib/server/holidays";
import { formatRequestNumber, normalizeRequestNumber } from "../lib/server/numbering";
import { can, canBeAssigned, canGlobal, isSupportLead, staffRoutes, type Actor, type RequestAccessFacts } from "../lib/server/permissions";
import { dayNumber, isJobDue } from "../lib/server/scheduler";
import { buildSignature, normalizeClaims, signedHeaders } from "../lib/server/sso";
import { FILES_PER_REQUEST, filesCapMessage, filesLeft } from "../lib/shared/limits";
import { DEFAULT_TOPICS, routeForTopic } from "../lib/shared/topics";

function actor(overrides: Partial<Actor>): Actor {
  return { personId: null, email: "someone@orderofkpi.org", name: "Someone", roles: ["member"], isAdmin: false, isStaff: false, committees: [], committeeRoles: {}, ...overrides };
}

const member = actor({ personId: "P1", email: "ada@orderofkpi.org" });
const other = actor({ personId: "P2", email: "ben@orderofkpi.org" });
const dtChair = actor({ personId: "P3", email: "cara@orderofkpi.org", committees: ["digital_technology"], committeeRoles: { digital_technology: "chair" } });
const dtMember = actor({ personId: "P4", email: "dan@orderofkpi.org", committees: ["digital_technology"], committeeRoles: { digital_technology: "member" } });
const treasurer = actor({ personId: "P5", email: "tia@orderofkpi.org", roles: ["officer", "Treasurer"] });
const admin = actor({ personId: "P6", email: "amy@orderofkpi.org", isAdmin: true, roles: ["admin"] });
const scholarshipChair = actor({ personId: "P7", email: "sam@orderofkpi.org", committees: ["scholarship"], committeeRoles: { scholarship: "chair" } });

function req(overrides: Partial<RequestAccessFacts> = {}): RequestAccessFacts {
  return { requesterPersonId: "P1", requesterEmail: "ada@orderofkpi.org", status: "RECEIVED", routedCommittee: "digital_technology", completedAt: null, ...overrides };
}

test("members see only their own requests", () => {
  assert.equal(can(member, "view", req()), true);
  assert.equal(can(other, "view", req()), false);
  assert.equal(can(treasurer, "view", req()), false);
  assert.equal(can(scholarshipChair, "view", req()), false);
});

test("ownership matches by person id or by email", () => {
  assert.equal(can(actor({ personId: null, email: "ADA@orderofkpi.org" }), "view", req()), true);
  assert.equal(can(actor({ personId: "P1", email: "renamed@orderofkpi.org" }), "view", req()), true);
});

test("members never see internal notes or staff tools", () => {
  for (const action of ["view_internal", "note", "staff_reply", "set_status", "assign", "reroute"] as const) {
    assert.equal(can(member, action, req()), false, action);
  }
});

test("staff on the routed committee work the request; only the chair or a lead assigns", () => {
  assert.equal(can(dtMember, "view_internal", req()), true);
  assert.equal(can(dtMember, "staff_reply", req()), true);
  assert.equal(can(dtMember, "assign", req()), false);
  assert.equal(can(dtMember, "reroute", req()), false);
  assert.equal(can(dtChair, "assign", req()), true);
  assert.equal(can(scholarshipChair, "assign", req({ routedCommittee: "scholarship" })), true);
  assert.equal(can(scholarshipChair, "assign", req()), false);
});

test("the Treasurer route belongs to people with the Treasurer role", () => {
  const acc = req({ routedCommittee: "treasurer" });
  assert.equal(can(treasurer, "view", acc), true);
  assert.equal(can(treasurer, "assign", acc), true);
  assert.equal(can(dtMember, "view", acc), false);
  assert.deepEqual(staffRoutes(treasurer), ["treasurer"]);
});

test("support lead is the D&T chair plus administrators (Q4)", () => {
  assert.equal(isSupportLead(dtChair), true);
  assert.equal(isSupportLead(admin), true);
  assert.equal(isSupportLead(dtMember), false);
  assert.equal(isSupportLead(scholarshipChair), false);
  assert.equal(can(dtChair, "view", req({ routedCommittee: "treasurer" })), true);
  assert.equal(can(admin, "reroute", req({ routedCommittee: "scholarship" })), true);
});

test("global pages: queue for staff, reports for leads, CSV for administrators only", () => {
  assert.equal(canGlobal(member, "view_queue"), false);
  assert.equal(canGlobal(dtMember, "view_queue"), true);
  assert.equal(canGlobal(dtMember, "reports"), false);
  assert.equal(canGlobal(dtChair, "reports"), true);
  assert.equal(canGlobal(dtChair, "export_csv"), false);
  assert.equal(canGlobal(admin, "export_csv"), true);
});

test("withdraw and reply on open requests; reopen only within 14 days of completion", () => {
  const now = Date.UTC(2026, 10, 20);
  assert.equal(can(member, "withdraw", req()), true);
  assert.equal(can(member, "withdraw", req({ status: "COMPLETED", completedAt: now })), false);
  assert.equal(can(other, "withdraw", req()), false);
  const recent = req({ status: "COMPLETED", completedAt: now - 13 * 86400000 });
  const old = req({ status: "COMPLETED", completedAt: now - 15 * 86400000 });
  assert.equal(can(member, "reopen", recent, now), true);
  assert.equal(can(member, "member_reply", recent, now), true);
  assert.equal(can(member, "reopen", old, now), false);
  assert.equal(can(member, "member_reply", old, now), false);
  assert.equal(can(member, "member_reply", req({ status: "WITHDRAWN" }), now), false);
});

test("assignees: people on the route, or a support lead as fallback", () => {
  assert.equal(canBeAssigned(dtMember, "digital_technology"), true);
  assert.equal(canBeAssigned(member, "digital_technology"), false);
  assert.equal(canBeAssigned(dtMember, "scholarship"), false);
  assert.equal(canBeAssigned(dtChair, "scholarship"), true);
});

test("routing defaults (Q3)", () => {
  const byCode = Object.fromEntries(DEFAULT_TOPICS.map((topic) => [topic.code, topic]));
  assert.equal(routeForTopic(byCode.COM, "scholarship"), "scholarship");
  assert.equal(routeForTopic(byCode.COM, null), "digital_technology");
  assert.equal(routeForTopic(byCode.COM, "not_a_committee"), "digital_technology");
  assert.equal(routeForTopic(byCode.ACC, "scholarship"), "treasurer");
  assert.equal(routeForTopic(byCode.BUG), "digital_technology");
  assert.equal(routeForTopic(byCode.ENH), "digital_technology");
});

test("request numbers read KP-<TOPIC>-<YEAR>-<NNNN>", () => {
  assert.equal(formatRequestNumber("COM", 2026, 42), "KP-COM-2026-0042");
  assert.equal(formatRequestNumber("ACC", 2026, 12345), "KP-ACC-2026-12345");
  assert.throws(() => formatRequestNumber("com", 2026, 1));
  assert.throws(() => formatRequestNumber("COM", 2026, 0));
  assert.equal(normalizeRequestNumber(" kp-bug-2026-0007 "), "KP-BUG-2026-0007");
  assert.equal(normalizeRequestNumber("ada@orderofkpi.org"), null);
  assert.equal(normalizeRequestNumber("KP-BUG-2026-7"), null);
});

test("the request year is the US Eastern year", () => {
  assert.equal(easternYear(Date.UTC(2027, 0, 1, 3, 0)), 2026); // 10 PM Dec 31 in New York
  assert.equal(easternYear(Date.UTC(2027, 0, 1, 6, 0)), 2027);
});

test("numbering is sequential and never reused, in one transaction", async () => {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(":memory:");
  db.exec("create table request_counters (topic_code text, year integer, next_value integer, primary key (topic_code, year))");
  const next = db.transaction((topic: string, year: number) => {
    const row = db
      .prepare("insert into request_counters values (?, ?, 2) on conflict(topic_code, year) do update set next_value = next_value + 1 returning next_value")
      .get(topic, year) as { next_value: number };
    return formatRequestNumber(topic, year, row.next_value - 1);
  });
  const numbers = Array.from({ length: 50 }, () => next.immediate("BUG", 2026));
  assert.equal(new Set(numbers).size, 50);
  assert.equal(numbers[0], "KP-BUG-2026-0001");
  assert.equal(numbers[49], "KP-BUG-2026-0050");
  assert.equal(next.immediate("COM", 2026), "KP-COM-2026-0001");
  assert.equal(next.immediate("BUG", 2027), "KP-BUG-2027-0001");
});

// --- file checks -----------------------------------------------------------------------------

function zip(names: string[]) {
  // A stored (uncompressed) ZIP with empty entries: local headers, central directory, end record.
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

test("files are judged by their bytes", () => {
  assert.equal(sniffFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0]))?.ext, "jpg");
  assert.equal(sniffFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext, "png");
  assert.equal(sniffFile(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1"))?.ext, "webp");
  assert.equal(sniffFile(Buffer.from("%PDF-1.7\n%..."))?.ext, "pdf");
  assert.equal(sniffFile(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffFile(Buffer.from("GIF89a........")), null);
  assert.equal(sniffFile(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), null, "old .doc is not accepted");
});

test("Word and Excel are ZIPs with [Content_Types].xml and a word/ or xl/ folder", () => {
  const docx = zip(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  const xlsx = zip(["[Content_Types].xml", "xl/workbook.xml"]);
  assert.deepEqual(zipEntryNames(docx), ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  assert.equal(sniffFile(docx)?.ext, "docx");
  assert.equal(sniffFile(xlsx)?.ext, "xlsx");
  assert.equal(sniffFile(zip(["[Content_Types].xml", "ppt/presentation.xml"])), null, "PowerPoint is not accepted");
  assert.equal(sniffFile(zip(["word/document.xml"])), null, "a plain ZIP without content types");
  assert.equal(sniffFile(zip(["readme.txt"])), null);
  const truncated = docx.subarray(0, docx.length - 10);
  assert.equal(sniffFile(truncated), null);
});

test("stored file names are safe and carry the real extension", () => {
  const pdf = sniffFile(Buffer.from("%PDF-1.4 x"))!;
  assert.equal(safeFileName("report.pdf", pdf), "report.pdf");
  assert.equal(safeFileName("../../etc/passwd", pdf), "passwd.pdf");
  assert.equal(safeFileName('evil".html', pdf), "evil.pdf");
  assert.equal(safeFileName("", pdf), "attachment.pdf");
});

// --- portal signature ------------------------------------------------------------------------

test("signature is lowercase hex HMAC-SHA256 over `${timestamp}.${body}`", () => {
  const body = JSON.stringify({ code: "abc" });
  const expected = createHmac("sha256", "s3cret").update(`1700000000000.${body}`).digest("hex");
  assert.equal(buildSignature("s3cret", "1700000000000", body), expected);
  assert.match(expected, /^[0-9a-f]{64}$/);
  const headers = signedHeaders("s3cret", body, 1700000000000);
  assert.equal(headers["x-kp-sso-timestamp"], "1700000000000");
  assert.equal(headers["x-kp-sso-signature"], expected);
  assert.notEqual(buildSignature("s3cret", "1700000000001", body), expected);
  assert.notEqual(buildSignature("s3cret", "1700000000000", `${body} `), expected);
});

test("claims are reduced to the documented fields", () => {
  const claims = normalizeClaims({ email: " Ada@OrderofKPI.org ", name: "Ada", personId: 17, roles: ["member", 5], isAdmin: "yes", committees: ["digital_technology"], committeeRoles: { digital_technology: "chair", scholarship: "boss" }, passwordChangedAt: 123, mustChangePassword: true, phone: "555" });
  assert.deepEqual(claims, { email: "ada@orderofkpi.org", name: "Ada", personId: "17", roles: ["member"], isAdmin: false, isStaff: false, committees: ["digital_technology"], committeeRoles: { digital_technology: "chair", scholarship: "member" }, passwordChangedAt: 123, mustChangePassword: true });
  assert.equal(normalizeClaims({ name: "No email" }), null);
});

// --- business time and outbox ----------------------------------------------------------------

test("response targets count Monday to Friday in US Eastern", () => {
  const friday9am = Date.UTC(2026, 10, 6, 14, 0); // Fri 11/06/2026 9:00 AM EST
  assert.equal(addBusinessDays(friday9am, 1), Date.UTC(2026, 10, 9, 14, 0)); // Monday 9:00 AM
  assert.equal(addBusinessDays(friday9am, 2), Date.UTC(2026, 10, 10, 14, 0));
  const saturday = Date.UTC(2026, 10, 7, 17, 0);
  assert.equal(addBusinessDays(saturday, 1), Date.UTC(2026, 10, 10, 5, 0)); // Tuesday 00:00 EST
  assert.equal(businessMsBetween(friday9am, Date.UTC(2026, 10, 9, 14, 0)), 24 * 3600000);
});

test("outbox back-off is 1 m, 5 m, 30 m, 2 h, 6 h, then gives up", async () => {
  const { nextAttemptDelay } = await import("../lib/server/outbox");
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(nextAttemptDelay), [60000, 300000, 1800000, 7200000, 21600000, null]);
});

test("CSV cells cannot start a formula", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell('He said "hi", then left'), '"He said ""hi"", then left"');
  assert.equal(csvCell("plain"), "plain");
});

// --- federal holidays ------------------------------------------------------------------------

test("2026 federal holidays on their observed dates", () => {
  assert.deepEqual(
    federalHolidays(2026).map((holiday) => holiday.date),
    ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"],
  );
  // July 4, 2026 is a Saturday: observed Friday July 3.
  assert.equal(federalHolidays(2026).find((holiday) => holiday.name === "Independence Day")?.date, "2026-07-03");
});

test("2027 federal holidays, including New Year's Day 2028 observed on Friday December 31", () => {
  assert.deepEqual(
    federalHolidays(2027).map((holiday) => holiday.date),
    ["2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24", "2027-12-31"],
  );
  // Juneteenth on a Saturday moves to Friday; July 4 on a Sunday moves to Monday.
  assert.equal(federalHolidays(2027).find((holiday) => holiday.name.startsWith("Juneteenth"))?.date, "2027-06-18");
  assert.equal(federalHolidays(2027).find((holiday) => holiday.name === "Independence Day")?.date, "2027-07-05");
  // ...and 2028 does not list January 1 twice.
  assert.equal(federalHolidays(2028).filter((holiday) => holiday.name === "New Year's Day").length, 0);
  assert.equal(federalHolidays(2028).length, 10);
});

test("business days skip federal holidays", () => {
  assert.equal(isBusinessDay(Date.UTC(2026, 10, 11, 15, 0)), false); // Veterans Day, Wed 11/11/2026
  assert.equal(isBusinessDay(Date.UTC(2026, 10, 26, 15, 0)), false); // Thanksgiving
  assert.equal(isBusinessDay(Date.UTC(2026, 10, 27, 15, 0)), true); // the Friday after is a business day
  assert.equal(isBusinessDay(Date.UTC(2026, 6, 3, 15, 0)), false); // July 4 observed
  // Tue 11/10/2026 9:00 AM EST + 1 business day skips Veterans Day: Thursday 9:00 AM.
  const tuesday9am = Date.UTC(2026, 10, 10, 14, 0);
  assert.equal(addBusinessDays(tuesday9am, 1), Date.UTC(2026, 10, 12, 14, 0));
  // Wed 11/25 9:00 AM + 2 business days: past Thanksgiving and the weekend to Monday 11/30.
  assert.equal(addBusinessDays(Date.UTC(2026, 10, 25, 14, 0), 2), Date.UTC(2026, 10, 30, 14, 0));
  // Thu 12/24 to Mon 12/28 is one business day (Christmas Friday, then the weekend).
  assert.equal(businessDaysBetween(Date.UTC(2026, 11, 24, 14, 0), Date.UTC(2026, 11, 28, 14, 0)), 1);
});

// --- scheduling ------------------------------------------------------------------------------

test("jobs fall due at their Eastern time, the digest only on business days", () => {
  const wed745 = Date.UTC(2026, 10, 4, 12, 45); // Wed 11/04/2026 7:45 AM EST
  const wed801 = Date.UTC(2026, 10, 4, 13, 1);
  assert.equal(isJobDue(wed745, 8 * 60, true), false);
  assert.equal(isJobDue(wed801, 8 * 60, true), true);
  assert.equal(isJobDue(Date.UTC(2026, 10, 11, 13, 1), 8 * 60, true), false); // Veterans Day
  assert.equal(isJobDue(Date.UTC(2026, 10, 7, 13, 1), 8 * 60, true), false); // Saturday
  assert.equal(isJobDue(Date.UTC(2026, 10, 7, 7, 1), 2 * 60, false), true); // backup runs every day, 2:01 AM EST
  assert.equal(isJobDue(Date.UTC(2026, 10, 7, 6, 59), 2 * 60, false), false); // 1:59 AM EST
  assert.equal(isJobDue(Date.UTC(2026, 10, 4, 16, 59), 8 * 60, true, 240), true); // 11:59 AM: still catches up
  assert.equal(isJobDue(Date.UTC(2026, 10, 4, 17, 0), 8 * 60, true, 240), false); // noon: too late for a morning digest
  assert.equal(dayNumber(Date.UTC(2027, 0, 1, 3, 0)), 20261231); // 10 PM Dec 31 in New York
});

// --- daily digest ----------------------------------------------------------------------------

function digestRequest(overrides: Partial<DigestRequest>): DigestRequest {
  return { number: "KP-BUG-2026-0001", topicLabel: "Website & Display Troubleshooting", urgency: "Normal", status: "RECEIVED", statusLabel: "Request Received", createdAt: 1000, routedCommittee: "digital_technology", assigneeEmail: null, pastTarget: false, ...overrides };
}

const person = (who: Actor): DigestPerson => ({ email: who.email, name: who.name, actor: who });

test("digest lists open requests with nobody assigned or past target, to the route's chair", () => {
  const requests = [
    digestRequest({ number: "KP-BUG-2026-0001" }),
    digestRequest({ number: "KP-BUG-2026-0002", assigneeEmail: "dan@orderofkpi.org" }), // assigned, on time: left out
    digestRequest({ number: "KP-BUG-2026-0003", assigneeEmail: "dan@orderofkpi.org", pastTarget: true }),
    digestRequest({ number: "KP-BUG-2026-0004", status: "COMPLETED" }), // closed: left out
    digestRequest({ number: "KP-COM-2026-0001", routedCommittee: "scholarship", createdAt: 500 }),
    digestRequest({ number: "KP-ACC-2026-0001", routedCommittee: "treasurer" }),
    digestRequest({ number: "KP-COM-2026-0002", routedCommittee: "annual_event" }), // no chair known
  ];
  const people = [dtChair, dtMember, treasurer, admin, scholarshipChair, member].map(person);
  const result = selectDigest(requests, people, ["alerts@example.org"]);
  const byEmail = Object.fromEntries(result.map((entry) => [entry.email, entry.items.map((item) => item.number)]));
  assert.deepEqual(byEmail, {
    // Admin and the D&T chair are the support leads: they get the route with no chair.
    "amy@orderofkpi.org": ["KP-COM-2026-0002"],
    "cara@orderofkpi.org": ["KP-BUG-2026-0001", "KP-BUG-2026-0003", "KP-COM-2026-0002"],
    "sam@orderofkpi.org": ["KP-COM-2026-0001"],
    "tia@orderofkpi.org": ["KP-ACC-2026-0001"],
  });
  const third = result.find((entry) => entry.email === "cara@orderofkpi.org")?.items.find((item) => item.number === "KP-BUG-2026-0003");
  assert.deepEqual(third?.reasons, ["past_target"]);
  assert.equal(result.some((entry) => entry.email === "dan@orderofkpi.org"), false, "committee members who are not chair get no digest");
});

test("digest sends nothing when nothing needs attention, and falls back to the alert list with no leads", () => {
  assert.deepEqual(selectDigest([digestRequest({ assigneeEmail: "dan@orderofkpi.org" })], [person(dtChair)]), []);
  assert.deepEqual(selectDigest([], [person(dtChair)]), []);
  const orphan = selectDigest([digestRequest({ routedCommittee: "annual_event" })], [person(member)], ["alerts@example.org"]);
  assert.deepEqual(orphan.map((entry) => entry.email), ["alerts@example.org"]);
});

test("digest goes only to the fixed digest address, with every request that needs attention (ruling 11-05-2026)", () => {
  const requests = [
    digestRequest({ number: "KP-BUG-2026-0001" }),
    digestRequest({ number: "KP-BUG-2026-0002", assigneeEmail: "dan@orderofkpi.org" }),
    digestRequest({ number: "KP-ACC-2026-0001", routedCommittee: "treasurer", createdAt: 500 }),
    digestRequest({ number: "KP-COM-2026-0001", routedCommittee: "scholarship", pastTarget: true, assigneeEmail: "sam@orderofkpi.org" }),
    digestRequest({ number: "KP-BUG-2026-0004", status: "COMPLETED" }),
  ];
  const result = selectDigestFor(requests, ["CTO@orderofkpi.org"]);
  assert.deepEqual(result.map((entry) => entry.email), ["cto@orderofkpi.org"]);
  assert.deepEqual(result[0].items.map((item) => item.number), ["KP-ACC-2026-0001", "KP-BUG-2026-0001", "KP-COM-2026-0001"]);
  assert.deepEqual(selectDigestFor([digestRequest({ assigneeEmail: "dan@orderofkpi.org" })], ["cto@orderofkpi.org"]), []);
  assert.deepEqual(selectDigestFor(requests, []), []);
});

test("digest address comes from SUPPORT_DIGEST_EMAILS, else SUPPORT_ALERT_EMAILS", () => {
  const saved = { d: process.env.SUPPORT_DIGEST_EMAILS, a: process.env.SUPPORT_ALERT_EMAILS };
  try {
    process.env.SUPPORT_ALERT_EMAILS = "alerts@example.org";
    process.env.SUPPORT_DIGEST_EMAILS = " cto@orderofkpi.org ";
    assert.deepEqual(digestEmails(), ["cto@orderofkpi.org"]);
    delete process.env.SUPPORT_DIGEST_EMAILS;
    assert.deepEqual(digestEmails(), ["alerts@example.org"]);
  } finally {
    if (saved.d === undefined) delete process.env.SUPPORT_DIGEST_EMAILS; else process.env.SUPPORT_DIGEST_EMAILS = saved.d;
    if (saved.a === undefined) delete process.env.SUPPORT_ALERT_EMAILS; else process.env.SUPPORT_ALERT_EMAILS = saved.a;
  }
});

test("digest email carries number, topic, urgency, age, status and link only", async () => {
  const { digestEmail } = await import("../lib/server/email");
  const { digestLines } = await import("../lib/server/digest");
  const now = Date.UTC(2026, 10, 4, 13, 0);
  const items = [{ ...digestRequest({ createdAt: now - 3 * 86_400_000, urgency: "High" }), reasons: ["unassigned" as const, "past_target" as const] }];
  const email = digestEmail("Cara Chair", digestLines(items, now));
  assert.equal(email.subject, "1 support request needs attention");
  for (const part of ["KP-BUG-2026-0001", "Website &amp; Display Troubleshooting", "Urgency: High", "Status: Request Received", "3 days old", "Nobody assigned · Past the response target", "/requests/KP-BUG-2026-0001"]) {
    assert.ok(email.html.includes(part), part);
  }
  assert.ok(email.text.includes("Requests that need attention"));
  assert.equal(ageText(now - 1000, now), "Sent today");
  assert.equal(ageText(now - 86_400_000, now), "1 day old");
});

// --- backups ---------------------------------------------------------------------------------

test("backup retention keeps the newest 14 days and touches only backup files", () => {
  const names: string[] = [];
  for (let day = 1; day <= 20; day += 1) {
    const date = `2026-10-${String(day).padStart(2, "0")}`;
    names.push(`support-${date}.db`, `uploads-${date}`);
  }
  names.push("support.db", "notes.txt", "support-2026-09-30.db.partial", "uploads-2026-09-30.partial", "support-latest.db");
  const removed = backupsToRemove(names);
  assert.deepEqual(
    removed.sort(),
    [
      "support-2026-09-30.db.partial", "support-2026-10-01.db", "support-2026-10-02.db", "support-2026-10-03.db", "support-2026-10-04.db", "support-2026-10-05.db", "support-2026-10-06.db",
      "uploads-2026-09-30.partial", "uploads-2026-10-01", "uploads-2026-10-02", "uploads-2026-10-03", "uploads-2026-10-04", "uploads-2026-10-05", "uploads-2026-10-06",
    ].sort(),
  );
  assert.ok(!removed.includes("support.db") && !removed.includes("notes.txt") && !removed.includes("support-latest.db"));
  assert.deepEqual(backupsToRemove(names.slice(0, 28)), []); // 14 days: nothing to remove
});

// --- file cap --------------------------------------------------------------------------------

test("5 files per request in all, across the first submission and follow-ups (BR-13)", () => {
  assert.equal(FILES_PER_REQUEST, 5);
  assert.equal(filesCapMessage(0, 5), null);
  assert.equal(filesCapMessage(3, 2), null);
  assert.equal(filesCapMessage(5, 0), null);
  assert.match(filesCapMessage(3, 3) ?? "", /already has 3 files, so you can add 2 more/);
  assert.match(filesCapMessage(5, 1) ?? "", /already has 5 files, which is the most one request can hold/);
  assert.equal(filesLeft(4), 1);
  assert.equal(filesLeft(7), 0);
});

// --- alert recipients (Jack, 11/06/2026) ----------------------------------------------------

test("alert recipients: the portal list, else SUPPORT_ALERT_EMAILS, else cto@orderofkpi.org", () => {
  const stored = { emails: ["ops@orderofkpi.org", "cto@orderofkpi.org"], fetchedAt: 1_000, portalUpdatedAt: "2026-11-06T15:00:00.000Z" };
  assert.deepEqual(resolveAlertRecipients(stored, ["alerts@example.org"]), { emails: ["ops@orderofkpi.org", "cto@orderofkpi.org"], source: "portal", fetchedAt: 1_000, portalUpdatedAt: "2026-11-06T15:00:00.000Z" });
  assert.deepEqual(resolveAlertRecipients(null, ["alerts@example.org"]), { emails: ["alerts@example.org"], source: "env", fetchedAt: null, portalUpdatedAt: null });
  assert.deepEqual(resolveAlertRecipients(null, []), { emails: ["cto@orderofkpi.org"], source: "default", fetchedAt: null, portalUpdatedAt: null });
  // A damaged stored row is treated as never fetched.
  assert.equal(resolveAlertRecipients({ emails: [], fetchedAt: 5, portalUpdatedAt: null }, []).source, "default");
  assert.equal(resolveAlertRecipients({ emails: ["not-an-email"], fetchedAt: 5, portalUpdatedAt: null }, ["alerts@example.org"]).source, "env");
});

test("the portal's alert list is used only when it is 1 to 10 valid addresses", () => {
  assert.deepEqual(validatePortalSettings({ alertEmails: [" CTO@orderofkpi.org ", "ops@orderofkpi.org", "cto@orderofkpi.org"], updatedAt: "2026-11-06T15:00:00Z" }), { ok: true, emails: ["cto@orderofkpi.org", "ops@orderofkpi.org"], updatedAt: "2026-11-06T15:00:00Z" });
  assert.deepEqual(validatePortalSettings({ alertEmails: ["cto@orderofkpi.org"], updatedAt: null }), { ok: true, emails: ["cto@orderofkpi.org"], updatedAt: null });
  const ten = Array.from({ length: 10 }, (_, index) => `person${index}@orderofkpi.org`);
  assert.equal(validatePortalSettings({ alertEmails: ten, updatedAt: null }).ok, true);
  for (const bad of [
    null,
    "cto@orderofkpi.org",
    [],
    {},
    { alertEmails: [] },
    { alertEmails: "cto@orderofkpi.org" },
    { alertEmails: [...ten, "eleven@orderofkpi.org"] },
    { alertEmails: ["cto@orderofkpi.org", "not an email"] },
    { alertEmails: ["cto@orderofkpi.org", 42] },
    { alertEmails: [""] },
    { alertEmails: ["cto@orderofkpi.org"], updatedAt: 12345 },
  ]) {
    assert.equal(validatePortalSettings(bad).ok, false, JSON.stringify(bad));
  }
});

test("the 'alert list could not be refreshed' alert: after 24 hours without a good fetch, at most every 6 hours", () => {
  const hour = 3_600_000;
  const t0 = Date.UTC(2026, 10, 6, 12, 0);
  // Recent good fetch: never.
  assert.equal(isStaleAlertDue({ lastSuccessAt: t0, watchStart: t0 - 100 * hour, lastStaleAlertAt: null }, t0 + 23.9 * hour), false);
  assert.equal(isStaleAlertDue({ lastSuccessAt: t0, watchStart: t0, lastStaleAlertAt: null }, t0 + 24 * hour), true);
  // Within 6 hours of the last one: no; 6 hours on: yes.
  assert.equal(isStaleAlertDue({ lastSuccessAt: t0, watchStart: t0, lastStaleAlertAt: t0 + 24 * hour }, t0 + 29.9 * hour), false);
  assert.equal(isStaleAlertDue({ lastSuccessAt: t0, watchStart: t0, lastStaleAlertAt: t0 + 24 * hour }, t0 + 30 * hour), true);
  // Never fetched: counts from the first try.
  assert.equal(isStaleAlertDue({ lastSuccessAt: null, watchStart: t0, lastStaleAlertAt: null }, t0 + 12 * hour), false);
  assert.equal(isStaleAlertDue({ lastSuccessAt: null, watchStart: t0, lastStaleAlertAt: null }, t0 + 24 * hour), true);
});

test("digest falls back to the resolved alert list, then cto@orderofkpi.org", () => {
  const saved = { d: process.env.SUPPORT_DIGEST_EMAILS, a: process.env.SUPPORT_ALERT_EMAILS };
  try {
    delete process.env.SUPPORT_DIGEST_EMAILS;
    process.env.SUPPORT_ALERT_EMAILS = "alerts@example.org";
    assert.deepEqual(digestEmails(["ops@orderofkpi.org"]), ["ops@orderofkpi.org"], "the portal's alert list beats the env");
    delete process.env.SUPPORT_ALERT_EMAILS;
    assert.deepEqual(digestEmails(), ["cto@orderofkpi.org"]);
    process.env.SUPPORT_DIGEST_EMAILS = "digest@example.org";
    assert.deepEqual(digestEmails(["ops@orderofkpi.org"]), ["digest@example.org"], "SUPPORT_DIGEST_EMAILS still decides when set");
  } finally {
    if (saved.d === undefined) delete process.env.SUPPORT_DIGEST_EMAILS; else process.env.SUPPORT_DIGEST_EMAILS = saved.d;
    if (saved.a === undefined) delete process.env.SUPPORT_ALERT_EMAILS; else process.env.SUPPORT_ALERT_EMAILS = saved.a;
  }
});
