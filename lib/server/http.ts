// Helpers for route handlers: JSON answers, the Origin check and CSRF token on every
// state-changing request (TECH_SPEC 3.2), and the per-member write limit (TECH_SPEC 5.2).

import { supportOrigin } from "./config";
import type { Actor } from "./permissions";
import { hit, WRITES_PER_HOUR } from "./rate-limit";
import { safeEqual, sessionFromRequest, type SessionState } from "./session";
import { StoreError } from "./store";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function errorJson(message: string, status: number) {
  return json({ error: message }, status);
}

/** Does this request come from a page on this site? */
export function originAllowed(request: Request) {
  const expected = supportOrigin();
  const origin = request.headers.get("origin");
  if (origin) return origin === expected;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return (request.headers.get("x-real-ip") ?? "").trim().slice(0, 64);
}

type Guarded = { ok: true; actor: Actor; session: Extract<SessionState, { kind: "ok" }> } | { ok: false; response: Response };

export function sessionProblem(state: SessionState): Response {
  if (state.kind === "unavailable") return errorJson("The sign-in service is not answering right now. Please try again in a few minutes.", 503);
  return errorJson("Please sign in again.", 401);
}

/** For POST routes: same-site Origin, a signed-in session, its CSRF token, and the write limit. */
export async function guardMutation(request: Request, formToken?: string | null): Promise<Guarded> {
  if (!originAllowed(request)) return { ok: false, response: errorJson("This request did not come from the Support Center.", 403) };
  const state = await sessionFromRequest(request);
  if (state.kind !== "ok") return { ok: false, response: sessionProblem(state) };
  const supplied = request.headers.get("x-csrf-token") ?? formToken ?? "";
  if (!supplied || !safeEqual(supplied, state.csrf)) {
    return { ok: false, response: errorJson("This page has expired. Please refresh it and try again.", 403) };
  }
  if (!hit(`write:${state.actor.email}`, WRITES_PER_HOUR, 60 * 60 * 1000)) {
    return { ok: false, response: errorJson("You have made a lot of changes in the last hour. Please wait a little and try again.", 429) };
  }
  return { ok: true, actor: state.actor, session: state };
}

export function storeErrorResponse(error: unknown) {
  if (error instanceof StoreError) return errorJson(error.message, error.status);
  console.error("[support] unexpected error", error instanceof Error ? error.message : "unknown");
  return errorJson("Something went wrong on our side. Please try again in a moment.", 500);
}
