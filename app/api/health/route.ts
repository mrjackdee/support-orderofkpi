// For the uptime monitor (BR-61, TECH_SPEC 5.1). Degraded answers HTTP 503 so the monitor pages
// a person. alertRecipientsSource and alertListRefreshedMinutesAgo say where alerts go from
// (portal, env or default) and how fresh the portal's list is. A failed fetch of that list never
// makes health degraded on its own: portalReachable already covers the portal. The addresses
// themselves are not shown here, only on /staff/settings.

import { getAlertRecipients, minutesSince, resolveAlertRecipients, type AlertRecipientsSource } from "@/lib/server/alert-recipients";
import { alertEmails, missingRequiredSettings } from "@/lib/server/config";
import { releaseStamp } from "@/lib/server/release";
import { backupHealth } from "@/lib/server/scheduler";
import { portalStatus } from "@/lib/server/sso";
import { databaseHealthy, outboxOldestPendingMinutes } from "@/lib/server/store";
import { uploadsWritable } from "@/lib/server/uploads";

export const dynamic = "force-dynamic";

let portalCache: { value: { ok: boolean; detail: string | null }; at: number } | null = null;

async function portalReachable() {
  const now = Date.now();
  if (portalCache && now - portalCache.at < 60_000) return portalCache.value;
  const value = await portalStatus();
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
  // BR-61: no good backup in 26 hours is degraded too.
  let backup = { ok: false, lastBackupHoursAgo: null as number | null };
  try {
    if (db) backup = await backupHealth();
  } catch {
    backup = { ok: false, lastBackupHoursAgo: null };
  }
  // Without the database the stored portal list cannot be read, so it reports what the fallback would be.
  let alerts = resolveAlertRecipients(null, alertEmails());
  try {
    if (db) alerts = await getAlertRecipients();
  } catch {
    // keep the fallback answer
  }
  const alertRecipientsSource: AlertRecipientsSource = alerts.source;
  const alertListRefreshedMinutesAgo = minutesSince(alerts.fetchedAt, Date.now());
  const portal = await portalReachable();
  const missingSettings = missingRequiredSettings();
  const ok = missingSettings.length === 0 && db && uploads && portal.ok && outboxMinutes <= 30 && backup.ok;
  return Response.json(
    { ok, ...(missingSettings.length ? { missingSettings } : {}), db, uploads, outboxOldestPendingMinutes: outboxMinutes, portalReachable: portal.ok, ...(portal.ok ? {} : { portalProblem: portal.detail }), backup: backup.ok, lastBackupHoursAgo: backup.lastBackupHoursAgo, release: releaseStamp(), alertRecipientsSource, alertListRefreshedMinutesAgo },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
