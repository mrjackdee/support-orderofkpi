import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_CONTACT, portalUrl } from "@/lib/server/config";
import { flashMessage, pageSession, safeNext } from "@/lib/server/page-session";
import { releaseStamp } from "@/lib/server/release";
import SignInForm from "./sign-in-form";

export const dynamic = "force-dynamic";

const SEAL_URL = "https://assets.orderofkpi.org/images/logos/kpi_seal_silver.png";
export const metadata: Metadata = { title: "Sign in | KP Support Center", robots: { index: false } };

const NOTICES: Record<string, string> = {
  unavailable: "The sign-in service is not answering right now. Please try again in a few minutes.",
  revoked: "Your Support Center session has ended because your Member Portal access changed. Sign in again if you still have access.",
  signed_out: "You are signed out.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const state = await pageSession();
  if (state.kind === "ok") redirect(next);
  const flash = await flashMessage();
  const notice = flash || (params.reason ? NOTICES[params.reason] ?? "" : "");
  const resetUrl = `${portalUrl() || "https://orderofkpi.com"}/reset-password`;
  return (
    <main className="signin-page">
      <section className="signin-card" aria-labelledby="signin-title">
        <div className="signin-head">
          {/* The Order's silver seal, as on the Member Portal's sign-in card. */}
          <img className="signin-seal" src={SEAL_URL} alt="Order of KP, Inc. seal" width={56} height={56} referrerPolicy="no-referrer" />
          <div>
            <p className="signin-org">Order of KP, Inc.</p>
            <h1 id="signin-title">Sign in</h1>
          </div>
        </div>
        <p className="signin-lead">KP Support Center. Use the same email address and password you use on the Member Portal.</p>
        {notice && <div className="signin-notice" role="status">{notice}</div>}
        <SignInForm next={next} resetUrl={resetUrl} />
        <p className="signin-help">Can&apos;t sign in? Use Forgot Password, or email <a href={`mailto:${ADMIN_CONTACT}`}>{ADMIN_CONTACT}</a>.</p>
      </section>
      <p className="signin-stamp"><span>© Order of KP, Inc.</span><span>{releaseStamp()}</span></p>
    </main>
  );
}
