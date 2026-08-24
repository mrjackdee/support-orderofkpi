import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { followUps, requestActivity, requests } from "@/db/schema";
import { prelaunchAdminFromRequest, supportRequestsEnabled } from "@/app/prelaunch-auth";

export async function POST(request: Request) {
  if (!(await prelaunchAdminFromRequest(request))) {
    return Response.json({ error: "Administrator access is required during prelaunch." }, { status: 403 });
  }
  if (!supportRequestsEnabled()) {
    return Response.json({ error: "Follow-up messages will open when the KP Support Center launches." }, { status: 503 });
  }
  try {
    const payload = (await request.json()) as { requestNumber?: string; message?: string };
    const requestNumber = payload.requestNumber?.trim().toUpperCase() ?? "";
    const message = payload.message?.trim() ?? "";
    if (!requestNumber || !message) {
      return Response.json({ error: "Please enter your follow-up message." }, { status: 400 });
    }
    if (message.length > 1500) {
      return Response.json({ error: "Please keep your note under 1,500 characters." }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select({ requestNumber: requests.requestNumber })
      .from(requests)
      .where(eq(requests.requestNumber, requestNumber))
      .limit(1);
    if (!existing) {
      return Response.json({ error: "We could not find that request." }, { status: 404 });
    }

    const [note] = await db
      .insert(followUps)
      .values({ requestNumber, message })
      .returning();
    await db.insert(requestActivity).values({
      requestNumber,
      action: "MEMBER_FOLLOW_UP",
      detail: message,
      actorEmail: "member",
    });
    return Response.json({ followUp: note }, { status: 201 });
  } catch {
    return Response.json({ error: "We could not add your note. Please try again." }, { status: 500 });
  }
}
