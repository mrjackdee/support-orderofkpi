// Retired with the shared prelaunch password. Sign-in is now /sign-in, checked by the portal.
export function POST() {
  return new Response(null, { status: 303, headers: { location: "/sign-in" } });
}
