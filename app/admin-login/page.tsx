import { redirect } from "next/navigation";
import { getPrelaunchAdmin, prelaunchAuthConfigured, safeReturnTo } from "../prelaunch-auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  if (await getPrelaunchAdmin()) redirect(returnTo);
  const configured = prelaunchAuthConfigured();
  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <a className="brand" href="/" aria-label="Return to KP Support Center coming soon page"><span className="brand-mark">KP</span><span className="brand-copy"><strong>D&amp;T Administration</strong><small>Order of KP Support Center</small></span></a>
        <div className="admin-login-heading"><p className="eyebrow">RESTRICTED ACCESS</p><h1>Administrator sign in</h1><p>This area is available only to approved Digital &amp; Technology administrators while the Support Center is being prepared.</p></div>
        {!configured ? <div className="login-notice">Administrator access has not been configured on this host. Add the required environment settings before signing in.</div> : (
          <form action="/api/prelaunch-login" method="post">
            <input type="hidden" name="returnTo" value={returnTo} />
            <label>Email address<input type="email" name="email" autoComplete="username" required placeholder="name@orderofkpi.com" /></label>
            <label>Access password<input type="password" name="password" autoComplete="current-password" required placeholder="Enter your administrator password" /></label>
            {params.error && <p className="form-message error" role="alert">The email or password was not recognized.</p>}
            <button className="button button-primary" type="submit">Sign In</button>
          </form>
        )}
        <a className="back-link" href="/">Return to coming soon page</a>
      </section>
    </main>
  );
}
