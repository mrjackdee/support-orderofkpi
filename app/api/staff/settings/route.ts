// Settings for support leads and administrators: topics, response targets, notification list.

import { errorJson, guardMutation, json, storeErrorResponse } from "@/lib/server/http";
import { canGlobal } from "@/lib/server/permissions";
import { saveTopic, updateSettings } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await guardMutation(request);
  if (!guard.ok) return guard.response;
  if (!canGlobal(guard.actor, "settings")) return errorJson("Not found", 404);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorJson("We could not read that change.", 400);
  try {
    if (body.kind === "settings") {
      const target = Number(body.responseTargetDays);
      const urgent = Number(body.urgentTargetDays);
      if (!Number.isInteger(target) || target < 1 || target > 10) return errorJson("The response target is 1 to 10 business days.", 400);
      if (!Number.isInteger(urgent) || urgent < 1 || urgent > target) return errorJson("The urgent target is 1 business day or more, and no longer than the normal target.", 400);
      const emails = String(body.notifyEmails ?? "")
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      const bad = emails.find((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
      if (bad) return errorJson(`"${bad}" is not an email address.`, 400);
      if (emails.length > 20) return errorJson("List up to 20 addresses.", 400);
      return json({ settings: await updateSettings(guard.actor, { responseTargetDays: target, urgentTargetDays: urgent, notifyEmails: [...new Set(emails)] }) });
    }
    if (body.kind === "topic") {
      const topics = await saveTopic(guard.actor, {
        code: String(body.code ?? ""),
        label: String(body.label ?? ""),
        description: String(body.description ?? ""),
        defaultRoute: String(body.defaultRoute ?? ""),
        enabled: body.enabled === true,
        sort: Number(body.sort) || 0,
      });
      return json({ topics });
    }
    return errorJson("Choose a change to make.", 400);
  } catch (error) {
    return storeErrorResponse(error);
  }
}
