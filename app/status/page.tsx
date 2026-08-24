import SupportCenter from "../support-center";
import { requirePrelaunchAdmin, supportRequestsEnabled } from "../prelaunch-auth";

export const dynamic = "force-dynamic";

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const admin = await requirePrelaunchAdmin(`/status${params.id ? `?id=${encodeURIComponent(params.id)}` : ""}`);
  return <SupportCenter initialView="status" initialEmail={admin.email} initialIsCommittee initialLookup={params.id ?? ""} requestsEnabled={supportRequestsEnabled()} />;
}
