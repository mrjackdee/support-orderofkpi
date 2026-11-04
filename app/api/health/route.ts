// For the uptime monitor (BR-61, TECH_SPEC 5.1). Degraded answers HTTP 503 so the monitor pages
// a person.

import { releaseStamp } from "@/lib/server/release";
import { portalAnswers } from "@/lib/server/sso";
import { databaseHealthy, outboxOldestPendingMinutes } from "@/lib/server/store";
import { uploadsWritable } from "@/lib/server/uploads";

export const dynamic = "force-dynamic";

let portalCache: { value: boolean; at: number } | null = null;

async function portalReachable() {
  const now = Date.now();
  if (portalCache && now - portalCache.at < 60_000) return portalCache.value;
  const value = await portalAnswers();
  portalCache = { value, at: now };
  return value;
}

export async function GET() {
  const db = databaseHealthy();
  const uploads = uploadsWritable();
  let outboxMinutes = 0;
  try {
    outboxMinutes = db ? await outboxOldestPendingMinutes() : 0;
  } catch {
    outboxMinutes = 0;
  }
  const portal = await portalReachable();
  const ok = db && uploads && portal && outboxMinutes <= 30;
  return Response.json(
    { ok, db, uploads, outboxOldestPendingMinutes: outboxMinutes, portalReachable: portal, release: releaseStamp() },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
