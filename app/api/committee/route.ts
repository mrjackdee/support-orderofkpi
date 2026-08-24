import { desc, eq } from "drizzle-orm";
import { env } from "runtime-env";
import { prelaunchAdminFromRequest } from "@/app/prelaunch-auth";
import { getDb } from "@/db";
import { requestActivity, requests } from "@/db/schema";

const VALID_STATUSES = new Set(["RECEIVED", "REVIEW", "WORKING", "COMPLETED"]);

function dateValue(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function weekKey(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - day);
  return start.toISOString().slice(0, 10);
}

async function authorize(request: Request) {
  const admin = await prelaunchAdminFromRequest(request);
  return { email: admin?.email ?? "", allowed: Boolean(admin) };
}

export async function GET(request: Request) {
  const identity = await authorize(request);
  if (!identity.allowed) {
    return Response.json({ error: "Committee access is required." }, { status: 403 });
  }

  try {
    const db = getDb();
    const rows = await db.select().from(requests).orderBy(desc(requests.createdAt)).limit(750);
    const recentActivity = await db
      .select()
      .from(requestActivity)
      .orderBy(desc(requestActivity.createdAt))
      .limit(12);

    const now = new Date();
    const open = rows.filter((item) => item.status !== "COMPLETED");
    const ageDays = open.map((item) => Math.max(0, (now.getTime() - dateValue(item.createdAt).getTime()) / 86400000));
    const countBy = (key: "status" | "categoryCode" | "priority") =>
      rows.reduce<Record<string, number>>((counts, item) => {
        const value = item[key] || "Unknown";
        counts[value] = (counts[value] ?? 0) + 1;
        return counts;
      }, {});

    const weeklyKeys: string[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() - offset * 7);
      weeklyKeys.push(weekKey(date));
    }
    const weeklyCounts = Object.fromEntries(weeklyKeys.map((key) => [key, 0])) as Record<string, number>;
    for (const item of rows) {
      const key = weekKey(dateValue(item.createdAt));
      if (key in weeklyCounts) weeklyCounts[key] += 1;
    }

    const endpointConfigured = Boolean(
      (env as unknown as { GOOGLE_APPS_SCRIPT_URL?: string }).GOOGLE_APPS_SCRIPT_URL,
    );

    return Response.json({
      summary: {
        total: rows.length,
        open: open.length,
        urgent: rows.filter((item) => item.priority === "Urgent" && item.status !== "COMPLETED").length,
        completed: rows.filter((item) => item.status === "COMPLETED").length,
        overdue: ageDays.filter((days) => days > 2).length,
        averageAgeDays: ageDays.length
          ? Number((ageDays.reduce((sum, days) => sum + days, 0) / ageDays.length).toFixed(1))
          : 0,
      },
      byStatus: countBy("status"),
      byCategory: countBy("categoryCode"),
      byPriority: countBy("priority"),
      weekly: weeklyKeys.map((key) => ({ week: key, count: weeklyCounts[key] })),
      integration: {
        configured: endpointConfigured,
        sheetSynced: rows.filter((item) => item.sheetSyncStatus === "SYNCED").length,
        sheetFailed: rows.filter((item) => item.sheetSyncStatus === "FAILED").length,
        emailSent: rows.filter((item) => item.emailReceiptStatus === "SENT").length,
        emailFailed: rows.filter((item) => item.emailReceiptStatus === "FAILED").length,
      },
      requests: rows,
      recentActivity,
      viewer: identity.email,
    });
  } catch {
    return Response.json({ error: "Dashboard reporting is temporarily unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const identity = await authorize(request);
  if (!identity.allowed) {
    return Response.json({ error: "Committee access is required." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as {
      requestNumber?: string;
      status?: string;
      leadContact?: string;
      committeeNotes?: string;
    };
    const requestNumber = payload.requestNumber?.trim().toUpperCase() ?? "";
    const status = payload.status?.trim().toUpperCase() ?? "";
    const leadContact = payload.leadContact?.trim() ?? "";
    const committeeNotes = payload.committeeNotes?.trim() ?? "";

    if (!requestNumber || !VALID_STATUSES.has(status)) {
      return Response.json({ error: "Choose a valid request and status." }, { status: 400 });
    }
    if (!leadContact || !committeeNotes) {
      return Response.json({ error: "Lead contact and member update are required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const db = getDb();
    const [updated] = await db
      .update(requests)
      .set({
        status,
        leadContact,
        committeeNotes,
        updatedAt: now,
        completedAt: status === "COMPLETED" ? now : null,
      })
      .where(eq(requests.requestNumber, requestNumber))
      .returning();

    if (!updated) {
      return Response.json({ error: "Request not found." }, { status: 404 });
    }

    await db.insert(requestActivity).values({
      requestNumber,
      action: "STATUS_UPDATED",
      detail: `${status}: ${committeeNotes}`,
      actorEmail: identity.email,
    });

    return Response.json({ request: updated });
  } catch {
    return Response.json({ error: "We could not save the committee update." }, { status: 500 });
  }
}
