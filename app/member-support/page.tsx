import SupportCenter from "../support-center";
import { requirePrelaunchAdmin, supportRequestsEnabled } from "../prelaunch-auth";

export const dynamic = "force-dynamic";

export default async function MemberSupportPage() {
  const admin = await requirePrelaunchAdmin("/member-support");
  return <SupportCenter initialEmail={admin.email} initialIsCommittee requestsEnabled={supportRequestsEnabled()} />;
}
