// Opens the SQLite database at ${SUPPORT_DATA_DIR}/support.db and applies migrations at start-up.
// Only lib/server/store.ts should import this: the rest of the app goes through the store, so a
// MySQL store can replace it later without touching pages or routes.

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import { dataDir, uploadsDir } from "../config";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

type Holder = { db: Db; sqlite: Database.Database; file: string };

const globalHolder = globalThis as unknown as { __kpSupportDb?: Holder };

function migrationsFolder() {
  const candidates = [
    process.env.SUPPORT_MIGRATIONS_DIR,
    path.join(process.cwd(), "lib/server/db/migrations"),
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "meta", "_journal.json"))) return candidate;
  }
  throw new Error("Support database migrations were not found");
}

export function openDatabase(file = path.join(dataDir(), "support.db")): Holder {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(uploadsDir(), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return { db, sqlite, file };
}

export function getHolder(): Holder {
  const file = path.join(dataDir(), "support.db");
  const current = globalHolder.__kpSupportDb;
  if (current && current.file === file && current.sqlite.open) return current;
  const opened = openDatabase(file);
  globalHolder.__kpSupportDb = opened;
  return opened;
}

export function getDb(): Db {
  return getHolder().db;
}
