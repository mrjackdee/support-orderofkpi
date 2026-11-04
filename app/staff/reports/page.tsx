import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/app/components/site-chrome";
import { requireStaff } from "@/lib/server/page-session";
import { canGlobal } from "@/lib/server/permissions";
import { getSettings, report } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports | KP Support Center", robots: { index: false } };

function Bars({ items, label }: { items: { label: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  if (!items.length) return <p className="activity-empty">No requests yet.</p>;
  return (
    <div className="bar-list" role="list" aria-label={label}>
      {items.map((item) => (
        <div key={item.label} role="listitem">
          <span>{item.label}</span>
          <i aria-hidden="true"><b style={{ width: `${Math.round((item.count / max) * 100)}%` }} /></i>
          <strong>{item.count}</strong>
        </div>
      ))}
    </div>
  );
}

export default async function ReportsPage() {
  const session = await requireStaff("/staff/reports", "reports");
  const [data, settings] = await Promise.all([report(session.actor), getSettings()]);
  const weeklyMax = Math.max(1, ...data.weekly.map((week) => week.count));
  return (
    <main className="site-shell dashboard-shell">
      <SiteHeader actor={session.actor} active="reports" />
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>How member support is doing</h1>
          <p>Response target: {settings.responseTargetDays} business days, Urgent {settings.urgentTargetDays}. Business days are Monday to Friday, US Eastern.</p>
        </div>
        <div className="dashboard-actions">
          <a className="button button-secondary" href="/staff">Staff queue</a>
          {canGlobal(session.actor, "export_csv") && <a className="button button-primary" href="/api/staff/export">Download CSV</a>}
        </div>
      </section>
      <section className="metric-grid" aria-label="Key numbers">
        <article className="metric-card green"><p>Open requests</p><strong>{data.openBacklog}</strong><span>Not yet completed or withdrawn</span></article>
        <article className="metric-card gold"><p>Urgent and open</p><strong>{data.urgentOpen}</strong><span>Marked Urgent by the member</span></article>
        <article className="metric-card"><p>Past the response target</p><strong>{data.pastTarget}</strong><span>No first response in time</span></article>
        <article className="metric-card"><p>Average age</p><strong>{data.averageAgeDays}</strong><span>Days, open requests</span></article>
        <article className="metric-card"><p>First response</p><strong>{data.firstResponseBusinessHours ?? "–"}</strong><span>Average business hours{data.firstResponseWithinTargetPercent !== null ? `, ${data.firstResponseWithinTargetPercent}% on time` : ""}</span></article>
        <article className="metric-card"><p>Time to resolve</p><strong>{data.resolutionDays ?? "–"}</strong><span>Average days to completed</span></article>
      </section>
      <section className="dashboard-grid">
        <article className="report-card"><div className="report-heading"><h2>By topic</h2><span>{data.totalRequests} in all</span></div><Bars items={data.byTopic} label="Requests by topic" /></article>
        <article className="report-card"><div className="report-heading"><h2>By KPI committee</h2></div><Bars items={data.byCommittee} label="Requests by KPI committee" /></article>
        <article className="report-card"><div className="report-heading"><h2>By status</h2></div><Bars items={data.byStatus} label="Requests by status" /></article>
        <article className="report-card">
          <div className="report-heading"><h2>Weekly trend</h2><span>New requests, last 8 weeks</span></div>
          <div className="weekly-chart weekly-8" role="list" aria-label="New requests per week">
            {data.weekly.map((week) => (
              <div key={week.label} role="listitem" aria-label={`Week of ${week.label}: ${week.count}`}>
                <i aria-hidden="true"><b style={{ height: `${Math.max(4, Math.round((week.count / weeklyMax) * 100))}%` }} /></i>
                <strong>{week.count}</strong>
                <span>{week.label}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="report-card activity-card">
          <div className="report-heading"><h2>Answered by a quick tip</h2><span>&ldquo;This solved my question&rdquo;</span></div>
          <p className="big-number">{data.deflections}</p>
          <p className="panel-copy">Members who found their answer before sending a request.</p>
        </article>
      </section>
      <SiteFooter csrf={session.csrf} actor={session.actor} />
    </main>
  );
}
