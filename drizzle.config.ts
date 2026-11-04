import { defineConfig } from "drizzle-kit";

// The Support Center's SQLite schema. The older Cloudflare D1 migrations in drizzle/ belong to the
// retired Workers path and are no longer applied.
export default defineConfig({
  out: "./lib/server/db/migrations",
  schema: "./lib/server/db/schema.ts",
  dialect: "sqlite",
});
