// Direct sign-in (BR-2, BR-5). The password is passed to the portal for this one call and is
// never logged, stored or sent back. The portal's own error message reaches the member unchanged.

import { clientIp, errorJson, json, originAllowed } from "@/lib/server/http";
import { safeNext } from "@/lib/server/page-session";
import { hit, SIGN_IN_ATTEMPTS_PER_IP } from "@/lib/server/rate-limit";
import { isRefusedOnThisSite, MUST_CHANGE_PASSWORD_MESSAGE, sessionCookieHeader, startSession } from "@/lib/server/session";
import { PortalUnavailableError, passwordSignIn } from "@/lib/server/sso";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!originAllowed(request)) return errorJson("This request did not come from the Support Center.", 403);
  const ip = clientIp(request);
  if (!hit(`sign-in:${ip || "unknown"}`, SIGN_IN_ATTEMPTS_PER_IP, 15 * 60 * 1000)) {
    return errorJson("Too many sign-in attempts. Please wait 15 minutes and try again.", 429);
  }
  let email = "";
  let password = "";
  let next = "/requests/new";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown; next?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
    password = typeof body.password === "string" ? body.password.slice(0, 500) : "";
    next = safeNext(typeof body.next === "string" ? body.next : null);
  } catch {
    return errorJson("Enter your KPI email address and password.", 400);
  }
  if (!email || !password) return errorJson("Enter your KPI email address and password.", 400);
  if (isRefusedOnThisSite(email)) return errorJson("Invalid email or password", 401);

  try {
    const result = await passwordSignIn(email, password, ip);
    password = "";
    if (!result.ok) {
      const status = [400, 401, 403, 423, 429].includes(result.status) ? result.status : 400;
      return json(result.code ? { error: result.message, code: result.code } : { error: result.message }, status);
    }
    if (result.claims.mustChangePassword) return json({ error: MUST_CHANGE_PASSWORD_MESSAGE, code: "PASSWORD_CHANGE_REQUIRED" }, 403);
    if (isRefusedOnThisSite(result.claims.email)) return errorJson("Invalid email or password", 401);
    const id = await startSession(result.claims);
    return json({ ok: true, next }, 200, { "set-cookie": sessionCookieHeader(id) });
  } catch (error) {
    password = "";
    if (error instanceof PortalUnavailableError) {
      return errorJson("The sign-in service is not answering right now. Please try again in a few minutes.", 503);
    }
    console.error("[support] sign-in failed", error instanceof Error ? error.name : "unknown");
    return errorJson("Something went wrong on our side. Please try again in a moment.", 500);
  }
}
