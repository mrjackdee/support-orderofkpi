// Header and footer for signed-in pages (BR-55, BR-56, BR-64).

import { portalUrl } from "@/lib/server/config";
import { canGlobal, type Actor } from "@/lib/server/permissions";
import { releaseStamp } from "@/lib/server/release";

type Tab = "new" | "status" | "staff" | "reports" | "settings" | "none";

export function SiteHeader({ actor, active, csrf }: { actor: Actor; active: Tab; csrf?: string }) {
  // Home goes back to the Member Portal this site signs in through (test or live). Jack, 11/06/2026.
  const home = portalUrl() || "https://orderofkpi.com";
  const staff = canGlobal(actor, "view_queue");
  const lead = canGlobal(actor, "reports");
  return (
    <header className="topbar">
      <a className="brand" href="/requests/new" aria-label="KP Support Center home">
        <span className="brand-mark" aria-hidden="true">KP</span>
        <span className="brand-copy"><strong>Member support</strong><small>Order of KP</small></span>
      </a>
      <nav className="primary-nav" aria-label="Support navigation">
        <a className={`dashboard-link ${active === "new" ? "active" : ""}`} aria-current={active === "new" ? "page" : undefined} href="/requests/new">New request</a>
        <a className={`dashboard-link ${active === "status" ? "active" : ""}`} aria-current={active === "status" ? "page" : undefined} href="/requests">Check status</a>
        {staff && <a className={`dashboard-link ${active === "staff" ? "active" : ""}`} aria-current={active === "staff" ? "page" : undefined} href="/staff">Staff queue</a>}
        {lead && <a className={`dashboard-link ${active === "reports" ? "active" : ""}`} aria-current={active === "reports" ? "page" : undefined} href="/staff/reports">Reports</a>}
      </nav>
      <div className="topbar-actions">
        <div className="member-badge"><span aria-hidden="true" /> {actor.name}</div>
        <a className="topbar-action" href={home}>Home</a>
        {csrf && (
          <form action="/api/auth/sign-out" method="post">
            <input type="hidden" name="csrf" value={csrf} />
            <button type="submit" className="topbar-action">Sign out</button>
          </form>
        )}
      </div>
    </header>
  );
}

export function SiteFooter({ csrf, actor }: { csrf?: string; actor?: Actor }) {
  const lead = actor ? canGlobal(actor, "settings") : false;
  return (
    <footer className="site-footer">
      <span>© Order of KP, Inc.</span>
      <span className="footer-links">
        {lead && <a href="/staff/settings">Settings</a>}
        {/* Sign out lives in the top bar now (Jack, 11/06/2026); one button, not two. */}
        {!csrf && <a href="/sign-in">Sign in</a>}
      </span>
      <span className="footer-stamp">{releaseStamp()}</span>
    </footer>
  );
}
