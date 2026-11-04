// Header and footer for signed-in pages (BR-55, BR-56, BR-64).

import { canGlobal, type Actor } from "@/lib/server/permissions";
import { releaseStamp } from "@/lib/server/release";

type Tab = "new" | "status" | "staff" | "reports" | "settings" | "none";

export function SiteHeader({ actor, active }: { actor: Actor; active: Tab }) {
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
      <div className="member-badge"><span aria-hidden="true" /> {actor.name}</div>
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
        {csrf ? (
          <form action="/api/auth/sign-out" method="post">
            <input type="hidden" name="csrf" value={csrf} />
            <button type="submit">Sign out</button>
          </form>
        ) : (
          <a href="/sign-in">Sign in</a>
        )}
      </span>
      <span className="footer-stamp">{releaseStamp()}</span>
    </footer>
  );
}
