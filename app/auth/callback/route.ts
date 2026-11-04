// BR-1: the member arrives from the portal with a one-time code. The code is exchanged server to
// server and this site sets its own session.

import { clientIp } from "@/lib/server/http";
import { hit } from "@/lib/server/rate-limit";
import { flashCookieHeader, isRefusedOnThisSite, MUST_CHANGE_PASSWORD_MESSAGE, sessionCookieHeader, startSession } from "@/lib/server/session";
import { exchangeCode, PortalUnavailableError } from "@/lib/server/sso";

export const dynamic = "force-dynamic";

function toSignIn(message: string) {
  return new Response(null, { status: 303, headers: { location: "/sign-in", "set-cookie": flashCookieHeader(message), "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!code || code.length > 200) return toSignIn("That sign-in link is not complete. Please sign in here instead.");
  if (!hit(`callback:${clientIp(request) || "unknown"}`, 30, 15 * 60 * 1000)) return toSignIn("Too many sign-in attempts. Please wait 15 minutes and try again.");
  try {
    const result = await exchangeCode(code);
    if (!result.ok) return toSignIn(result.message);
    if (result.claims.mustChangePassword) return toSignIn(MUST_CHANGE_PASSWORD_MESSAGE);
    if (isRefusedOnThisSite(result.claims.email)) return toSignIn("Invalid email or password");
    const id = await startSession(result.claims);
    return new Response(null, { status: 303, headers: { location: "/requests/new", "set-cookie": sessionCookieHeader(id), "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof PortalUnavailableError) return toSignIn("The sign-in service is not answering right now. Please try again in a few minutes.");
    console.error("[support] callback failed", error instanceof Error ? error.name : "unknown");
    return toSignIn("Something went wrong on our side. Please try signing in here.");
  }
}
