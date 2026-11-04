// BR-14: "This solved my question" is counted, with no personal details.

import { errorJson, guardMutation, json } from "@/lib/server/http";
import { recordDeflection } from "@/lib/server/store";
import { TIPS } from "@/lib/shared/topics";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await guardMutation(request);
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => ({}))) as { topic?: unknown; tipId?: unknown };
  const tip = TIPS.find((item) => item.id === body.tipId);
  if (!tip || typeof body.topic !== "string" || !/^[A-Z]{2,5}$/.test(body.topic)) return errorJson("Unknown tip", 400);
  await recordDeflection(body.topic, tip.id);
  return json({ ok: true }, 201);
}
