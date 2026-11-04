#!/usr/bin/env node
// Restores one nightly backup into a NEW, empty data folder and checks it. It never writes to the
// live data folder or to the backups themselves: it only reads them.
//
// Usage:
//   node scripts/restore-backup.mjs --list   [--backups <folder>]
//   node scripts/restore-backup.mjs --date YYYY-MM-DD --to <new empty folder> [--backups <folder>]
//
// --backups defaults to ${SUPPORT_DATA_DIR}/backups. The new folder must not exist yet, or be
// empty, and must not be the live SUPPORT_DATA_DIR. When the check passes, point the site at it
// by setting SUPPORT_DATA_DIR to the new folder and restarting (see README.md, "Restore drill").
// Exit code 0 means the restored copy passed every check.

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function usage(message) {
  if (message) console.error(`\n${message}\n`);
  console.error(
    [
      "Usage:",
      "  node scripts/restore-backup.mjs --list [--backups <folder>]",
      "  node scripts/restore-backup.mjs --date YYYY-MM-DD --to <new empty folder> [--backups <folder>]",
      "",
      "--backups defaults to $SUPPORT_DATA_DIR/backups. The --to folder must be new or empty and",
      "must not be the live SUPPORT_DATA_DIR. Nothing is ever written to the live data or the backups.",
    ].join("\n"),
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) usage(`${name} needs a value.`);
  return value;
};
if (args.includes("--help") || args.includes("-h")) usage();

const liveDir = process.env.SUPPORT_DATA_DIR ? path.resolve(process.env.SUPPORT_DATA_DIR) : null;
const backupsArg = option("--backups");
const backupsDir = backupsArg ? path.resolve(backupsArg) : liveDir ? path.join(liveDir, "backups") : null;
if (!backupsDir) usage("Set SUPPORT_DATA_DIR or pass --backups <folder>.");
if (!fs.existsSync(backupsDir)) usage(`There is no backups folder at ${backupsDir}.`);

const DB_NAME = /^support-(\d{4}-\d{2}-\d{2})\.db$/;

if (args.includes("--list")) {
  const dates = fs.readdirSync(backupsDir).map((name) => DB_NAME.exec(name)?.[1]).filter(Boolean).sort();
  console.log(`Backups in ${backupsDir}:`);
  for (const date of dates) {
    const size = fs.statSync(path.join(backupsDir, `support-${date}.db`)).size;
    const uploads = path.join(backupsDir, `uploads-${date}`);
    const files = fs.existsSync(uploads) ? fs.readdirSync(uploads).length : 0;
    console.log(`  ${date}  database ${size} bytes, ${files} attached files`);
  }
  if (!dates.length) console.log("  (none)");
  process.exit(0);
}

const date = option("--date");
const target = option("--to");
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) usage("Give the backup date as --date YYYY-MM-DD (see --list).");
if (!target) usage("Give a new, empty folder to restore into with --to <folder>.");

const targetDir = path.resolve(target);
const sourceDb = path.join(backupsDir, `support-${date}.db`);
const sourceUploads = path.join(backupsDir, `uploads-${date}`);
if (!fs.existsSync(sourceDb)) usage(`There is no backup for ${date} in ${backupsDir}. Run with --list to see the dates.`);

// Never restore over live data or into the backups.
const inside = (child, parent) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
if (liveDir && (inside(targetDir, liveDir) || inside(liveDir, targetDir))) usage(`Refusing: ${targetDir} is the live data folder or overlaps it. Choose a new folder.`);
if (inside(targetDir, backupsDir) || inside(backupsDir, targetDir)) usage(`Refusing: ${targetDir} overlaps the backups folder. Choose a new folder.`);
if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) usage(`Refusing: ${targetDir} is not empty. Restore into a new folder.`);

fs.mkdirSync(path.join(targetDir, "uploads"), { recursive: true, mode: 0o700 });
const restoredDb = path.join(targetDir, "support.db");
fs.copyFileSync(sourceDb, restoredDb, fs.constants.COPYFILE_EXCL);
let copied = 0;
if (fs.existsSync(sourceUploads)) {
  for (const name of fs.readdirSync(sourceUploads)) {
    // Copied, not linked, so the restored folder does not share files with the backups.
    fs.copyFileSync(path.join(sourceUploads, name), path.join(targetDir, "uploads", name), fs.constants.COPYFILE_EXCL);
    copied += 1;
  }
}

console.log(`Restored backup ${date}`);
console.log(`  from     ${sourceDb}`);
console.log(`  into     ${targetDir}`);
console.log(`  files    ${copied} attached files copied`);

const db = new Database(restoredDb, { readonly: true, fileMustExist: true });
const integrity = db.pragma("integrity_check").map((row) => row.integrity_check).join("; ");
const count = (table) => db.prepare(`select count(*) as n from ${table}`).get().n;
const counts = Object.fromEntries(["requests", "messages", "internal_notes", "files", "history", "outbox", "backups"].map((table) => [table, count(table)]));
const keys = db.prepare("select storage_key as key from files").all().map((row) => row.key);
const missing = keys.filter((key) => !fs.existsSync(path.join(targetDir, "uploads", key)));
const sha = db.prepare("select storage_key as key, sha256 from files").all();
const changed = sha.filter((row) => !missing.includes(row.key) && createHash("sha256").update(fs.readFileSync(path.join(targetDir, "uploads", row.key))).digest("hex") !== row.sha256);
const latest = db.prepare("select max(created_at) as at from requests").get().at;
db.close();

console.log("");
console.log("Checks");
console.log(`  integrity_check        ${integrity}`);
for (const [table, n] of Object.entries(counts)) console.log(`  ${`${table} rows`.padEnd(22)} ${n}`);
console.log(`  attached files missing ${missing.length}`);
console.log(`  files not matching     ${changed.length} (SHA-256 against the database)`);
console.log(`  newest request         ${latest ? new Date(latest).toISOString() : "none"}`);

const ok = integrity === "ok" && missing.length === 0 && changed.length === 0;
console.log("");
if (ok) {
  console.log("RESULT: PASSED. To use this copy, set SUPPORT_DATA_DIR to");
  console.log(`  ${targetDir}`);
  console.log("and restart the Support Center. The old data folder is unchanged.");
} else {
  console.log("RESULT: FAILED. Do not use this copy. Try the backup from the day before.");
}
process.exit(ok ? 0 : 1);
