// BR-6: signing out deletes the session on the server, not just the cookie.

import { originAllowed } from "@/lib/server/http";
import { clearSessionCookieHeader, endSession, safeEqual, sessionFromRequest } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!originAllowed(request)) return Response.json({ error: "This request did not come from the Support Center." }, { status: 403 });
  let token = request.headers.get("x-csrf-token") ?? "";
  if (!token) {
    try {
      const form = await request.formData();
      token = String(form.get("csrf") ?? "");
    } catch {
      token = "";
    }
  }
  const state = await sessionFromRequest(request);
  if (state.kind === "ok") {
    if (!safeEqual(token, state.csrf)) return Response.json({ error: "This page has expired. Please refresh it and try again." }, { status: 403 });
    await endSession(state.idHash);
  }
  return new Response(null, { status: 303, headers: { location: "/sign-in?reason=signed_out", "set-cookie": clearSessionCookieHeader(), "cache-control": "no-store" } });
}
