// Runs once when the Node server starts: opens the database (applying migrations) and starts the
// outbox worker.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("./lib/server/db/client");
  const { startBackgroundWorker } = await import("./lib/server/outbox");
  try {
    getDb();
  } catch (error) {
    console.error("[support] database could not be opened", error instanceof Error ? error.message : "unknown");
  }
  startBackgroundWorker();
}
