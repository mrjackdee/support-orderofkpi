import { redirect } from "next/navigation";
import { requestsEnabled } from "@/lib/server/config";
import { pageSession } from "@/lib/server/page-session";
import { releaseStamp } from "@/lib/server/release";
import ComingSoon from "./coming-soon";

export const dynamic = "force-dynamic";

// BR-7: the public coming-soon page until requests are switched on; then sign-in for visitors and
// the request form for members.
export default async function Home() {
  if (!requestsEnabled()) return <ComingSoon release={releaseStamp()} />;
  const state = await pageSession();
  redirect(state.kind === "ok" ? "/requests/new" : "/sign-in");
}
