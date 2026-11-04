// Status (BR-33, BR-35), assignment (BR-32), rerouting (BR-31) and withdrawal (BR-25).

import { errorJson, guardMutation, json, storeErrorResponse } from "@/lib/server/http";
import { normalizeRequestNumber } from "@/lib/server/numbering";
import { kickOutbox } from "@/lib/server/outbox";
import { assign, reroute, setStatus, withdraw } from "@/lib/server/store";
import { MESSAGE_MAX } from "@/lib/shared/limits";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ number: string }> }) {
  const guard = await guardMutation(request);
  if (!guard.ok) return guard.response;
  const number = normalizeRequestNumber(decodeURIComponent((await context.params).number));
  if (!number) return errorJson("Not found", 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson("We could not read that change. Please try again.", 400);
  }
  const value = (name: string) => (typeof body[name] === "string" ? (body[name] as string).trim() : "");
  try {
    switch (body.action) {
      case "status": {
        const resolution = value("resolution");
        if (resolution.length > MESSAGE_MAX) return errorJson(`The note can be up to ${MESSAGE_MAX} characters.`, 400);
        await setStatus(number, guard.actor, value("status"), resolution);
        break;
      }
      case "assign":
        await assign(number, guard.actor, value("assignee") || null);
        break;
      case "reroute":
        await reroute(number, guard.actor, value("route"));
        break;
      case "withdraw":
        await withdraw(number, guard.actor);
        break;
      default:
        return errorJson("Choose a change to make.", 400);
    }
    kickOutbox();
    return json({ ok: true });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
