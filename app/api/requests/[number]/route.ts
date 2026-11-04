// One request as JSON. A member's copy never includes internal notes (BR-34); someone else's
// request is "not found" (BR-21).

import { errorJson, json, sessionProblem } from "@/lib/server/http";
import { normalizeRequestNumber } from "@/lib/server/numbering";
import { sessionFromRequest } from "@/lib/server/session";
import { getRequestView } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ number: string }> }) {
  const state = await sessionFromRequest(request);
  if (state.kind !== "ok") return sessionProblem(state);
  const number = normalizeRequestNumber(decodeURIComponent((await context.params).number));
  const view = number ? await getRequestView(number, state.actor) : null;
  if (!view) return errorJson("Not found", 404);
  return json(view);
}
