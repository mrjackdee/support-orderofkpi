import type { Metadata } from "next";
import { dateLabel, statusClass } from "@/app/components/format";
import { SiteFooter, SiteHeader } from "@/app/components/site-chrome";
import { requireStaff } from "@/lib/server/page-session";
import { canGlobal, staffRoutes } from "@/lib/server/permissions";
import { ALL_ROUTES, listTopics, queue, staffPeople, type QueueFilters } from "@/lib/server/store";
import { STATUS_CODES, STATUS_LABELS, URGENCIES } from "@/lib/shared/statuses";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff queue | KP Support Center", robots: { index: false } };

type Params = { q?: string; status?: string; topic?: string; urgency?: string; committee?: string; assignee?: string; age?: string };

export default async function StaffQueuePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const session = await requireStaff("/staff");
  const filters: QueueFilters = {
    q: params.q?.slice(0, 100),
    status: params.status || "open",
    topic: params.topic,
    urgency: params.urgency,
    committee: params.committee,
    assignee: params.assignee,
    age: params.age,
  };
  const [rows, topics, people] = await Promise.all([queue(session.actor, filters), listTopics(), staffPeople()]);
  const seeAll = canGlobal(session.actor, "view_all");
  const myRoutes = staffRoutes(session.actor);
  const routes = seeAll ? ALL_ROUTES : ALL_ROUTES.filter((route) => myRoutes.includes(route.code));
  const pastTarget = rows.filter((row) => row.pastTarget).length;

  return (
    <main className="site-shell dashboard-shell">
      <SiteHeader actor={session.actor} csrf={session.csrf} active="staff" />
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Staff workspace</p>
          <h1>Request queue</h1>
          <p>{seeAll ? "You can see every request." : `Requests routed to ${routes.map((route) => route.name).join(", ")}.`} Open a request to reply, assign or change its status.</p>
        </div>
        <div className="dashboard-actions">
          {canGlobal(session.actor, "reports") && <a className="button button-secondary" href="/staff/reports">Reports</a>}
          {canGlobal(session.actor, "export_csv") && <a className="button button-secondary" href="/api/staff/export">Download CSV</a>}
        </div>
      </section>

      <section className="queue-section" aria-labelledby="queue-heading">
        <div className="queue-heading">
          <div><h2 id="queue-heading">{rows.length} {rows.length === 1 ? "request" : "requests"}</h2><p>{pastTarget ? `${pastTarget} past the response target.` : "None past the response target."}</p></div>
        </div>
        <form className="queue-filters" action="/staff" method="get" aria-label="Filter the queue">
          <label className="wide">Search<input name="q" defaultValue={params.q ?? ""} placeholder="Number, title, member name or email" /></label>
          <label>Status
            <select name="status" defaultValue={filters.status}>
              <option value="open">All open</option>
              <option value="all">Everything</option>
              {STATUS_CODES.map((code) => <option key={code} value={code}>{STATUS_LABELS[code]}</option>)}
            </select>
          </label>
          <label>Topic
            <select name="topic" defaultValue={params.topic ?? ""}>
              <option value="">Any topic</option>
              {topics.map((topic) => <option key={topic.code} value={topic.code}>{topic.label}</option>)}
            </select>
          </label>
          <label>Urgency
            <select name="urgency" defaultValue={params.urgency ?? ""}>
              <option value="">Any urgency</option>
              {URGENCIES.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}
            </select>
          </label>
          <label>KPI committee
            <select name="committee" defaultValue={params.committee ?? ""}>
              <option value="">{seeAll ? "Any committee" : "All of mine"}</option>
              {routes.map((route) => <option key={route.code} value={route.code}>{route.name}</option>)}
            </select>
          </label>
          <label>Assigned to
            <select name="assignee" defaultValue={params.assignee ?? ""}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="none">Nobody yet</option>
              {people.map((person) => <option key={person.email} value={person.email}>{person.name}</option>)}
            </select>
          </label>
          <label>Age
            <select name="age" defaultValue={params.age ?? ""}>
              <option value="">Any age</option>
              <option value="1">Older than 1 day</option>
              <option value="2">Older than 2 days</option>
              <option value="7">Older than a week</option>
              <option value="30">Older than 30 days</option>
            </select>
          </label>
          <div className="filter-actions"><button className="button button-primary" type="submit">Apply filters</button><a className="text-link" href="/staff">Clear</a></div>
        </form>

        {rows.length === 0 ? (
          <p className="queue-empty">No requests match these filters.</p>
        ) : (
          <>
            <div className="queue-table-wrap">
              <table className="queue-table">
                <caption className="sr-only">Requests</caption>
                <thead><tr><th scope="col">Request</th><th scope="col">Member</th><th scope="col">KPI committee</th><th scope="col">Assigned to</th><th scope="col">Urgency</th><th scope="col">Status</th><th scope="col">Sent</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.number} className={row.pastTarget ? "late" : ""}>
                      <td><a className="row-link" href={`/requests/${encodeURIComponent(row.number)}`}><strong>{row.number}</strong></a><span>{row.subject}</span><small>{row.topicLabel}</small></td>
                      <td><strong>{row.requesterName}</strong><small>{row.requesterEmail}</small></td>
                      <td>{row.committeeName}</td>
                      <td>{row.assigneeName ?? <em className="unassigned">Nobody yet</em>}</td>
                      <td><em className={`priority ${row.urgency.toLowerCase()}`}>{row.urgency}</em></td>
                      <td><em className={statusClass(row.status)}>{row.statusLabel}</em>{row.pastTarget && <small className="past-target">Past target</small>}</td>
                      <td>{dateLabel(row.createdAt)}<small>{row.ageDays === 0 ? "Today" : `${row.ageDays} ${row.ageDays === 1 ? "day" : "days"} old`}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="queue-cards" aria-label="Requests">
              {rows.map((row) => (
                <li key={row.number} className={row.pastTarget ? "late" : ""}>
                  <a href={`/requests/${encodeURIComponent(row.number)}`}>
                    <span className="card-top"><strong>{row.number}</strong><em className={statusClass(row.status)}>{row.statusLabel}</em></span>
                    <span className="card-subject">{row.subject}</span>
                    <span className="card-meta">{row.requesterName} · {row.committeeName}</span>
                    <span className="card-meta">{row.assigneeName ? `Assigned to ${row.assigneeName}` : "Nobody assigned yet"} · <em className={`priority ${row.urgency.toLowerCase()}`}>{row.urgency}</em></span>
                    <span className="card-meta">Sent {dateLabel(row.createdAt)}{row.pastTarget ? " · Past target" : ""}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <SiteFooter csrf={session.csrf} actor={session.actor} />
    </main>
  );
}
