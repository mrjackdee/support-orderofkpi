import { desc, eq } from "drizzle-orm";
import { env } from "runtime-env";
import { getDb } from "@/db";
import { followUps, requestActivity, requests } from "@/db/schema";
import { prelaunchAdminFromRequest, supportRequestsEnabled } from "@/app/prelaunch-auth";

const CATEGORY_LABELS: Record<string, string> = {
  COM: "Committee Roster & Workspace Help",
  ACC: "Account, Dues & Profile Assistance",
  BUG: "Website & Display Troubleshooting",
  ENH: "Portal Idea & Feature Suggestion",
};

const ALLOWED_PRIORITIES = new Set(["Normal", "High", "Urgent"]);
const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function makeRequestNumber(category: string) {
  const year = new Date().getUTCFullYear();
  const sequence = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return `KP-${category}-${year}-${sequence.toString().padStart(4, "0")}`;
}

async function sendCommitteeCopy(payload: Record<string, string>) {
  const endpoint = (env as unknown as { GOOGLE_APPS_SCRIPT_URL?: string })
    .GOOGLE_APPS_SCRIPT_URL;
  if (!endpoint) {
    return { configured: false, sheet: "NOT_CONFIGURED", email: "NOT_CONFIGURED", error: null };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(`Connector returned ${response.status}`);
    const result = (await response.json()) as { sheet?: string; email?: string; error?: string };
    return {
      configured: true,
      sheet: result.sheet === "SYNCED" ? "SYNCED" : "FAILED",
      email: result.email === "SENT" ? "SENT" : "FAILED",
      error: result.error ?? null,
    };
  } catch (error) {
    return {
      configured: true,
      sheet: "FAILED",
      email: "FAILED",
      error: error instanceof Error ? error.message : "Google Workspace connector failed",
    };
  }
}

export async function POST(request: Request) {
  if (!(await prelaunchAdminFromRequest(request))) {
    return Response.json({ error: "Administrator access is required during prelaunch." }, { status: 403 });
  }
  if (!supportRequestsEnabled()) {
    return Response.json({ error: "Request submission will open when the KP Support Center launches." }, { status: 503 });
  }
  try {
    const form = await request.formData();
    const categoryCode = clean(form.get("categoryCode"));
    const memberName = clean(form.get("memberName"));
    const memberEmail = clean(form.get("memberEmail")).toLowerCase();
    const priority = clean(form.get("priority"));
    const subject = clean(form.get("subject"));
    const description = clean(form.get("description"));
    const attachment = form.get("attachment");

    if (!CATEGORY_LABELS[categoryCode]) {
      return Response.json({ error: "Please choose what you need help with." }, { status: 400 });
    }
    if (!memberName || !memberEmail || !subject || !description) {
      return Response.json({ error: "Please complete each required field." }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(memberEmail)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!ALLOWED_PRIORITIES.has(priority)) {
      return Response.json({ error: "Please choose how quickly you need help." }, { status: 400 });
    }

    let attachmentKey: string | null = null;
    let attachmentName: string | null = null;
    let attachmentType: string | null = null;

    if (attachment instanceof File && attachment.size > 0) {
      if (attachment.size > 5 * 1024 * 1024) {
        return Response.json({ error: "Attachments must be 5 MB or smaller." }, { status: 400 });
      }
      if (!ALLOWED_FILE_TYPES.has(attachment.type)) {
        return Response.json({ error: "Please attach a JPG, PNG, WebP, or PDF file." }, { status: 400 });
      }
      attachmentKey = `support/${crypto.randomUUID()}`;
      attachmentName = attachment.name;
      attachmentType = attachment.type;
      await env.BUCKET.put(attachmentKey, await attachment.arrayBuffer(), {
        httpMetadata: { contentType: attachment.type },
        customMetadata: { originalName: attachment.name },
      });
    }

    const db = getDb();
    let saved;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const requestNumber = makeRequestNumber(categoryCode);
      try {
        [saved] = await db
          .insert(requests)
          .values({
            requestNumber,
            categoryCode,
            categoryLabel: CATEGORY_LABELS[categoryCode],
            memberName,
            memberEmail,
            priority,
            subject,
            description,
            attachmentKey,
            attachmentName,
            attachmentType,
          })
          .returning();
        break;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }

    if (!saved) throw new Error("Unable to save request");

    await db.insert(requestActivity).values({
      requestNumber: saved.requestNumber,
      action: "REQUEST_SUBMITTED",
      detail: `${saved.categoryLabel}: ${saved.subject}`,
      actorEmail: memberEmail,
    });

    const statusLink = new URL(`/status?id=${encodeURIComponent(saved.requestNumber)}`, request.url).toString();
    const syncResult = await sendCommitteeCopy({
      ticketId: saved.requestNumber,
      timestamp: saved.createdAt,
      categoryCode,
      category: saved.categoryLabel,
      memberName,
      memberEmail,
      subject,
      description,
      priority,
      status: saved.status,
      leadContact: saved.leadContact,
      committeeNotes: saved.committeeNotes,
      statusLink,
    });

    let responseRecord = saved;
    if (syncResult.configured) {
      [responseRecord] = await db
        .update(requests)
        .set({
          sheetSyncStatus: syncResult.sheet,
          emailReceiptStatus: syncResult.email,
          syncError: syncResult.error,
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(requests.requestNumber, saved.requestNumber))
        .returning();
    }

    return Response.json({ request: responseRecord }, { status: 201 });
  } catch {
    return Response.json(
      { error: "We could not save your request. Please try again in a moment." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  if (!(await prelaunchAdminFromRequest(request))) {
    return Response.json({ error: "Administrator access is required during prelaunch." }, { status: 403 });
  }
  try {
    const url = new URL(request.url);
    const requestNumber = url.searchParams.get("id")?.trim().toUpperCase() ?? "";
    const email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
    if (!requestNumber && !email) {
      return Response.json({ error: "Enter a request number or email address." }, { status: 400 });
    }

    const db = getDb();
    const matches = await db
      .select()
      .from(requests)
      .where(requestNumber ? eq(requests.requestNumber, requestNumber) : eq(requests.memberEmail, email))
      .orderBy(desc(requests.createdAt))
      .limit(email ? 10 : 1);

    if (!matches.length) {
      return Response.json({ error: "We could not find a matching request." }, { status: 404 });
    }

    const selected = matches[0];
    const notes = await db
      .select()
      .from(followUps)
      .where(eq(followUps.requestNumber, selected.requestNumber))
      .orderBy(desc(followUps.createdAt));

    return Response.json({ requests: matches, selected, followUps: notes });
  } catch {
    return Response.json(
      { error: "Request status is temporarily unavailable. Please try again." },
      { status: 500 },
    );
  }
}
