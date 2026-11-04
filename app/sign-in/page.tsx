import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_CONTACT, portalUrl } from "@/lib/server/config";
import { flashMessage, pageSession, safeNext } from "@/lib/server/page-session";
import { releaseStamp } from "@/lib/server/release";
import SignInForm from "./sign-in-form";

export const dynamic = "force-dynamic";
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
    <main className="admin-login-page">
      <section className="admin-login-card">
        <a className="brand" href="/" aria-label="KP Support Center home"><span className="brand-mark" aria-hidden="true">KP</span><span className="brand-copy"><strong>Member support</strong><small>Order of KP</small></span></a>
        <div className="admin-login-heading">
          <p className="eyebrow">KP Support Center</p>
          <h1>Sign in</h1>
          <p>Use the same KPI email address and password you use on the Member Portal.</p>
        </div>
        {notice && <div className="login-notice" role="status">{notice}</div>}
        <SignInForm next={next} resetUrl={resetUrl} />
        <p className="sign-in-help">Can&apos;t sign in? Use Forgot password, or email <a href={`mailto:${ADMIN_CONTACT}`}>{ADMIN_CONTACT}</a>.</p>
        <p className="sign-in-stamp"><span>© Order of KP, Inc.</span><span>{releaseStamp()}</span></p>
      </section>
    </main>
  );
}
