import CommitteeDashboard from "./committee-dashboard";
import { requirePrelaunchAdmin } from "../prelaunch-auth";

export const dynamic = "force-dynamic";

export default async function CommitteePage() {
  const admin = await requirePrelaunchAdmin("/committee");
  return <CommitteeDashboard viewerEmail={admin.email} />;
}
