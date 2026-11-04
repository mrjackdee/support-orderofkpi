// Nightly backup (BR-62, BR-61, TECH_SPEC 7). Runs inside the Node process from the scheduler.
//
// Each run writes, under ${SUPPORT_DATA_DIR}/backups/:
//   support-YYYY-MM-DD.db   the database, copied with SQLite's online backup while the site runs
//   uploads-YYYY-MM-DD/     every attached file. Files never change once saved, so a file the
//                           previous backup already holds is hard-linked from it; only files
//                           added since then are copied. Each folder is complete on its own.
// The copy is then opened read-only and checked (PRAGMA integrity_check, a count of requests,
// and that every attached file is there). The result goes in the backups table. The 14 newest
// days are kept; older backup files are removed. Nothing outside the backups folder is touched.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { easternDateKey } from "./business-time";
import { backupsDir, uploadsDir } from "./config";

export const BACKUP_KEEP_DAYS = 14;

const DATED = /^(?:support-(\d{4}-\d{2}-\d{2})\.db(?:\.partial)?|uploads-(\d{4}-\d{2}-\d{2})(?:\.partial)?)$/;
const STORAGE_KEY = /^[a-f0-9]{32}$/;

function dateOf(name: string) {
  const match = DATED.exec(name);
  return match ? (match[1] ?? match[2]) : null;
}

/**
 * Which entries of the backups folder to delete so the newest `keep` days remain. Only names
 * this module writes are ever chosen; anything else in the folder is left alone.
 */
export function backupsToRemove(names: string[], keep = BACKUP_KEEP_DAYS): string[] {
  const dates = [...new Set(names.map(dateOf).filter((date): date is string => date !== null))].sort().reverse();
  const kept = new Set(dates.slice(0, Math.max(1, keep)));
  return names.filter((name) => {
    const date = dateOf(name);
    return date !== null && !kept.has(date);
  });
}

export type Verification = { integrity: string; requestCount: number | null; missingFiles: number; ok: boolean };

/** Opens a backup read-only and checks it. Never writes to it. */
export function verifyBackup(dbFile: string, uploadsFolder: string): Verification {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbFile, { readonly: true, fileMustExist: true });
    const rows = db.pragma("integrity_check") as { integrity_check: string }[];
    const integrity = rows.map((row) => row.integrity_check).join("; ").slice(0, 500) || "no answer";
    const requestCount = (db.prepare("select count(*) as n from requests").get() as { n: number }).n;
    const keys = (db.prepare("select storage_key as key from files").all() as { key: string }[]).map((row) => row.key);
    const missingFiles = keys.filter((key) => !fs.existsSync(path.join(uploadsFolder, key))).length;
    return { integrity, requestCount, missingFiles, ok: integrity === "ok" && missingFiles === 0 };
  } catch (error) {
    return { integrity: error instanceof Error ? error.message.slice(0, 300) : "could not open", requestCount: null, missingFiles: 0, ok: false };
  } finally {
    db?.close();
  }
}

function newestUploadsFolder(dir: string, names: string[]) {
  const folders = names.filter((name) => /^uploads-\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse();
  return folders.length ? path.join(dir, folders[0]) : null;
}

/** Fills `target` with every live file: hard-linked from `previous` when it already has it, else copied. */
export function copyUploads(liveFolder: string, previous: string | null, target: string) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  let names: string[] = [];
  try {
    names = fs.readdirSync(liveFolder);
  } catch {
    names = [];
  }
  let total = 0;
  let copied = 0;
  for (const name of names) {
    if (!STORAGE_KEY.test(name)) continue; // skips half-written tmp- files and probes
    const source = path.join(liveFolder, name);
    const stat = fs.statSync(source, { throwIfNoEntry: false });
    if (!stat?.isFile()) continue;
    const destination = path.join(target, name);
    const earlier = previous ? path.join(previous, name) : null;
    const earlierStat = earlier ? fs.statSync(earlier, { throwIfNoEntry: false }) : undefined;
    let linked = false;
    if (earlier && earlierStat?.isFile() && earlierStat.size === stat.size) {
      try {
        fs.linkSync(earlier, destination);
        linked = true;
      } catch {
        linked = false;
      }
    }
    if (!linked) {
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      copied += 1;
    }
    total += 1;
  }
  return { total, copied };
}

export type BackupResult = {
  ok: boolean;
  date: string;
  fileName: string;
  integrity: string;
  requestCount: number | null;
  uploadFiles: number;
  uploadFilesCopied: number;
  missingFiles: number;
  bytes: number;
  error: string | null;
  removed: string[];
};

/** Runs one backup now and records it. Never throws: a failure comes back as ok: false. */
export async function runBackup(now = Date.now()): Promise<BackupResult> {
  const { backupDatabaseTo, recordBackup } = await import("./store");
  const startedAt = Date.now();
  const date = easternDateKey(now);
  const dir = backupsDir();
  const fileName = `support-${date}.db`;
  const dbFile = path.join(dir, fileName);
  const uploadsFolder = path.join(dir, `uploads-${date}`);
  const result: BackupResult = { ok: false, date, fileName, integrity: "", requestCount: null, uploadFiles: 0, uploadFilesCopied: 0, missingFiles: 0, bytes: 0, error: null, removed: [] };
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const partialDb = `${dbFile}.partial`;
    fs.rmSync(partialDb, { force: true });
    await backupDatabaseTo(partialDb);
    // The copy keeps the live file's WAL setting; switch it to a single self-contained file so it
    // can be opened read-only and moved anywhere.
    const fix = new Database(partialDb);
    fix.pragma("journal_mode = DELETE");
    fix.close();
    fs.renameSync(partialDb, dbFile);
    result.bytes = fs.statSync(dbFile).size;

    const before = fs.readdirSync(dir);
    const partialUploads = `${uploadsFolder}.partial`;
    const copied = copyUploads(uploadsDir(), newestUploadsFolder(dir, before), partialUploads);
    fs.rmSync(uploadsFolder, { recursive: true, force: true });
    fs.renameSync(partialUploads, uploadsFolder);
    result.uploadFiles = copied.total;
    result.uploadFilesCopied = copied.copied;

    const check = verifyBackup(dbFile, uploadsFolder);
    result.integrity = check.integrity;
    result.requestCount = check.requestCount;
    result.missingFiles = check.missingFiles;
    result.ok = check.ok;
    if (!check.ok) {
      result.error = check.integrity !== "ok" ? `The backup copy failed its check: ${check.integrity}` : `${check.missingFiles} attached file(s) are missing from the backup`;
    }
  } catch (error) {
    result.ok = false;
    result.error = error instanceof Error ? error.message.slice(0, 300) : "backup failed";
  }
  if (result.ok) {
    // Only after a good backup, so a run of failures never eats into the good ones.
    for (const name of backupsToRemove(fs.readdirSync(dir))) {
      try {
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
        result.removed.push(name);
      } catch {
        // Tried again after the next backup.
      }
    }
  }
  try {
    await recordBackup({
      backupDate: date,
      fileName,
      status: result.ok ? "OK" : "FAILED",
      integrity: result.integrity || null,
      requestCount: result.requestCount,
      uploadFiles: result.uploadFiles,
      uploadFilesCopied: result.uploadFilesCopied,
      missingFiles: result.missingFiles,
      bytes: result.bytes,
      error: result.error,
      startedAt,
      finishedAt: Date.now(),
    });
  } catch (error) {
    result.ok = false;
    result.error = result.error ?? (error instanceof Error ? `The backup result could not be saved: ${error.message.slice(0, 200)}` : "record failed");
  }
  return result;
}
