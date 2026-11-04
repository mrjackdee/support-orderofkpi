// BR-51: CSV export, administrators only, with the same privacy rules as the queue.

import { errorJson, sessionProblem } from "@/lib/server/http";
import { toCsv } from "@/lib/server/csv";
import { canGlobal } from "@/lib/server/permissions";
import { sessionFromRequest } from "@/lib/server/session";
import { exportRows } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const state = await sessionFromRequest(request);
  if (state.kind !== "ok") return sessionProblem(state);
  if (!canGlobal(state.actor, "export_csv")) return errorJson("Not found", 404);
  const rows = await exportRows(state.actor);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows, ["Request number"]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kp-support-requests-${date}.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
