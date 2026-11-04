// Retired: the prelaunch D&T dashboard read Cloudflare D1, which does not exist on Hostinger.
// The staff queue at /staff replaces it.
function gone() {
  return Response.json({ error: "This address is retired. Use the staff queue at /staff." }, { status: 410 });
}

export const GET = gone;
export const POST = gone;
export const PATCH = gone;
