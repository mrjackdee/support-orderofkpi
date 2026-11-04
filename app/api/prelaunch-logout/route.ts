// Retired. Signing out is POST /api/auth/sign-out, which also ends the session on the server.
export function POST() {
  return new Response(null, { status: 303, headers: { location: "/sign-in" } });
}
