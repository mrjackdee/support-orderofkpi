// Unit tests that need no network and no server: permissions, numbering, file checks, the
// portal signature, business time and the outbox back-off.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { addBusinessDays, businessDaysBetween, businessMsBetween, easternYear, isBusinessDay } from "../lib/server/business-time";
import { csvCell } from "../lib/server/csv";
import { federalHolidays } from "../lib/server/holidays";
import { safeFileName, sniffFile, zipEntryNames } from "../lib/server/file-check";
import { formatRequestNumber, normalizeRequestNumber } from "../lib/server/numbering";
import { can, canBeAssigned, canGlobal, isSupportLead, staffRoutes, type Actor, type RequestAccessFacts } from "../lib/server/permissions";
import { buildSignature, normalizeClaims, signedHeaders } from "../lib/server/sso";
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
