// Retired: follow-ups are now sent on the request itself, POST /api/requests/<number>/messages.
export function POST() {
  return Response.json({ error: "This address is retired. Add details on the request page instead." }, { status: 410 });
}
