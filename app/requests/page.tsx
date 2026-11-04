import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { dateLabel, statusClass } from "@/app/components/format";
import { SiteFooter, SiteHeader } from "@/app/components/site-chrome";
import { normalizeRequestNumber } from "@/lib/server/numbering";
import { requireSignedIn } from "@/lib/server/page-session";
import { listMyRequests } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My requests | KP Support Center", robots: { index: false } };

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<{ number?: string }> }) {
  const params = await searchParams;
  const session = await requireSignedIn("/requests");
  let lookupError = "";
  if (params.number !== undefined) {
    const number = normalizeRequestNumber(params.number);
    if (number) redirect(`/requests/${encodeURIComponent(number)}`);
    lookupError = "Request numbers look like KP-COM-2026-0042.";
  }
  const requests = await listMyRequests(session.actor);
  return (
    <main className="site-shell">
      <SiteHeader actor={session.actor} active="status" />
      <section className="intro">
        <div>
          <p className="eyebrow">Check request status</p>
          <h1>Know exactly where your request stands.</h1>
          <p>See the latest status, who is helping, and every reply. Add new details without sending another request.</p>
        </div>
      </section>
      <section className="workspace status-workspace" aria-label="My requests">
        <form className="lookup-form" action="/requests" method="get">
          <label htmlFor="lookup">Open a request by its number</label>
          <div>
            <input id="lookup" name="number" defaultValue={params.number ?? ""} placeholder="KP-COM-2026-0042" autoComplete="off" aria-describedby={lookupError ? "lookup-error" : undefined} />
            <button className="button button-primary" type="submit">Find my request</button>
          </div>
          {lookupError && <p className="form-message error" id="lookup-error" role="alert">{lookupError}</p>}
        </form>
        {requests.length ? (
          <div className="request-list">
            <h2 className="list-heading">Your requests</h2>
            <ul>
              {requests.map((item) => (
                <li key={item.number}>
                  <a href={`/requests/${encodeURIComponent(item.number)}`}>
                    <span><strong>{item.number}</strong><small>{item.subject}</small><small className="muted-line">{item.topicLabel}</small></span>
                    <span className="list-side"><em className={statusClass(item.status)}>{item.statusLabel}</em><time>{dateLabel(item.createdAt)}</time></span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">⌕</span>
            <h2>You have not sent a request yet.</h2>
            <p>When you do, it will appear here with its number, status and every reply.</p>
            <a className="button button-primary" href="/requests/new">Start a request</a>
          </div>
        )}
      </section>
      <SiteFooter csrf={session.csrf} actor={session.actor} />
    </main>
  );
}
