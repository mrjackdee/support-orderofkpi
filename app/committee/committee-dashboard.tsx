"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type RequestRecord = {
  requestNumber: string;
  categoryCode: string;
  categoryLabel: string;
  memberName: string;
  memberEmail: string;
  priority: string;
  subject: string;
  description: string;
  status: string;
  leadContact: string;
  committeeNotes: string;
  attachmentName?: string | null;
  sheetSyncStatus: string;
  emailReceiptStatus: string;
  syncError?: string | null;
  createdAt: string;
  updatedAt: string;
};

type DashboardData = {
  summary: {
    total: number;
    open: number;
    urgent: number;
    completed: number;
    overdue: number;
    averageAgeDays: number;
  };
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  weekly: Array<{ week: string; count: number }>;
  integration: {
    configured: boolean;
    sheetSynced: number;
    sheetFailed: number;
    emailSent: number;
    emailFailed: number;
  };
  requests: RequestRecord[];
  recentActivity: Array<{
    id: number;
    requestNumber: string;
    action: string;
    detail: string;
    actorEmail: string;
    createdAt: string;
  }>;
};

const statusLabels: Record<string, string> = {
  RECEIVED: "Request Received",
  REVIEW: "Under Review",
  WORKING: "Working On It",
  COMPLETED: "Completed",
};

const categoryLabels: Record<string, string> = {
  COM: "Committee & Workspace",
  ACC: "Account, Dues & Profile",
  BUG: "Website & Display",
  ENH: "Portal Ideas",
};

function parseDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parseDate(value));
}

function ageLabel(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - parseDate(value).getTime()) / 86400000));
  return days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;
}

function MetricCard({ label, value, note, tone = "light" }: { label: string; value: string | number; note: string; tone?: "light" | "green" | "gold" }) {
  return <article className={`metric-card ${tone}`}><p>{label}</p><strong>{value}</strong><span>{note}</span></article>;
}

export default function CommitteeDashboard({ viewerEmail }: { viewerEmail: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [editStatus, setEditStatus] = useState("RECEIVED");
  const [editLead, setEditLead] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/committee", { cache: "no-store" });
      const result = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Dashboard reporting is unavailable.");
      setData(result);
      if (selected) {
        const refreshed = result.requests.find((item) => item.requestNumber === selected.requestNumber) ?? null;
        setSelected(refreshed);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Dashboard reporting is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDashboard(); }, []);

  useEffect(() => {
    if (!selected) return;
    setEditStatus(selected.status);
    setEditLead(selected.leadContact);
    setEditNotes(selected.committeeNotes);
    setSaveMessage("");
  }, [selected]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.requests.filter((item) => {
      const matchesSearch = !term || [item.requestNumber, item.memberName, item.memberEmail, item.subject, item.description].some((value) => value.toLowerCase().includes(term));
      return matchesSearch &&
        (statusFilter === "ALL" || item.status === statusFilter) &&
        (categoryFilter === "ALL" || item.categoryCode === categoryFilter) &&
        (priorityFilter === "ALL" || item.priority === priorityFilter);
    });
  }, [categoryFilter, data, priorityFilter, search, statusFilter]);

  const maxWeekly = Math.max(1, ...(data?.weekly.map((item) => item.count) ?? [1]));
  const maxCategory = Math.max(1, ...Object.values(data?.byCategory ?? { all: 1 }));

  function exportCsv() {
    const headings = ["Request Number", "Submitted", "Category", "Member Name", "Member Email", "Priority", "Status", "Subject", "Description", "Lead Contact", "Committee Notes", "Sheet Sync", "Email Receipt"];
    const rows = filtered.map((item) => [item.requestNumber, item.createdAt, item.categoryLabel, item.memberName, item.memberEmail, item.priority, statusLabels[item.status] ?? item.status, item.subject, item.description, item.leadContact, item.committeeNotes, item.sheetSyncStatus, item.emailReceiptStatus]);
    const csv = [headings, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kp-support-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveUpdate(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/committee", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestNumber: selected.requestNumber, status: editStatus, leadContact: editLead, committeeNotes: editNotes }),
      });
      const result = (await response.json()) as { request?: RequestRecord; error?: string };
      if (!response.ok || !result.request) throw new Error(result.error || "Update could not be saved.");
      setSelected(result.request);
      setSaveMessage("Committee update saved and visible to the member.");
      await loadDashboard();
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : "Update could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <a className="dashboard-brand" href="/committee" aria-label="Technology dashboard home"><span className="brand-mark" aria-hidden="true">KP</span><span><strong>Technology Dashboard</strong><small>Member Support Operations</small></span></a>
        <nav><a href="/member-support">New Request</a><a href="/status">Member Status</a></nav>
        <div className="member-badge"><span /> Committee Access</div>
      </header>

      <section className="dashboard-intro">
        <div><p className="eyebrow">REQUEST OPERATIONS</p><h2>Committee workload and member support</h2><p>Monitor demand, manage response commitments, and keep members informed from one place.</p></div>
        <div className="dashboard-actions"><button className="button button-secondary" onClick={() => void loadDashboard()}>Refresh</button><button className="button button-primary" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button></div>
      </section>

      {loading && !data ? <div className="dashboard-state">Loading committee reporting...</div> : error ? <div className="dashboard-state error">{error}</div> : data && (
        <>
          <section className="metric-grid" aria-label="Support metrics">
            <MetricCard label="Total Requests" value={data.summary.total} note="All recorded requests" />
            <MetricCard label="Open Backlog" value={data.summary.open} note="Needs committee action" tone="green" />
            <MetricCard label="Urgent" value={data.summary.urgent} note="Open urgent requests" tone="gold" />
            <MetricCard label="Past 48 Hours" value={data.summary.overdue} note="Response window exceeded" />
            <MetricCard label="Average Open Age" value={`${data.summary.averageAgeDays}d`} note="Across the active backlog" />
            <MetricCard label="Completed" value={data.summary.completed} note="Requests resolved" />
          </section>

          <section className="dashboard-grid">
            <article className="report-card">
              <div className="report-heading"><div><p className="eyebrow">STATUS PIPELINE</p><h3>Requests by stage</h3></div><span>{data.summary.open} open</span></div>
              <div className="pipeline-grid">{["RECEIVED", "REVIEW", "WORKING", "COMPLETED"].map((status, index) => <div key={status}><span>{index + 1}</span><strong>{data.byStatus[status] ?? 0}</strong><small>{statusLabels[status]}</small></div>)}</div>
            </article>

            <article className="report-card">
              <div className="report-heading"><div><p className="eyebrow">DEMAND MIX</p><h3>Requests by category</h3></div></div>
              <div className="bar-list">{["COM", "ACC", "BUG", "ENH"].map((code) => <div key={code}><span>{categoryLabels[code]}</span><i><b style={{ width: `${((data.byCategory[code] ?? 0) / maxCategory) * 100}%` }} /></i><strong>{data.byCategory[code] ?? 0}</strong></div>)}</div>
            </article>

            <article className="report-card weekly-card">
              <div className="report-heading"><div><p className="eyebrow">SIX-WEEK TREND</p><h3>New request volume</h3></div></div>
              <div className="weekly-chart">{data.weekly.map((item) => <div key={item.week}><i><b style={{ height: `${Math.max(7, (item.count / maxWeekly) * 100)}%` }} /></i><strong>{item.count}</strong><span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${item.week}T00:00:00Z`))}</span></div>)}</div>
            </article>

            <article className={`report-card integration-card ${data.integration.configured ? "connected" : "setup"}`}>
              <div className="report-heading"><div><p className="eyebrow">GOOGLE WORKSPACE</p><h3>{data.integration.configured ? "Connector active" : "Connector setup required"}</h3></div><span>{data.integration.configured ? "Connected" : "Action needed"}</span></div>
              <p>{data.integration.configured ? "New requests can be written to the committee sheet and confirmation emails can be sent from Google Workspace." : "Deploy the provided Apps Script from the committee Google Sheet, then add its web app address to the site."}</p>
              {!data.integration.configured && <ol className="connector-steps"><li>Download the setup script.</li><li>Open the committee Sheet, then choose Extensions and Apps Script.</li><li>Paste the script and deploy it as a web app.</li><li>Provide the web app address to connect this site.</li></ol>}
              <div className="integration-stats"><div><strong>{data.integration.sheetSynced}</strong><span>Sheet rows synced</span></div><div><strong>{data.integration.emailSent}</strong><span>Email receipts sent</span></div><div><strong>{data.integration.sheetFailed + data.integration.emailFailed}</strong><span>Delivery failures</span></div></div>
              <a className="button button-secondary" href="/google-apps-script-connector.txt" download>Download Setup Script</a>
            </article>

            <article className="report-card activity-card">
              <div className="report-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h3>Latest request actions</h3></div></div>
              <div className="activity-list">{data.recentActivity.length ? data.recentActivity.map((item) => <div key={item.id}><i /><span><strong>{item.requestNumber}</strong><small>{item.action.replaceAll("_", " ")} by {item.actorEmail}</small><p>{item.detail}</p></span><time>{dateLabel(item.createdAt)}</time></div>) : <p className="activity-empty">Activity will appear as requests are submitted and updated.</p>}</div>
            </article>
          </section>

          <section className="queue-section">
            <div className="queue-heading"><div><p className="eyebrow">REQUEST QUEUE</p><h3>Find and manage requests</h3><p>{filtered.length} of {data.requests.length} requests shown</p></div></div>
            <div className="queue-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search request number, member, email, or subject" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="ALL">All categories</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="ALL">All priorities</option><option>Normal</option><option>High</option><option>Urgent</option></select></div>
            <div className="queue-layout">
              <div className="queue-table-wrap"><table className="queue-table"><thead><tr><th>Request</th><th>Member & Summary</th><th>Priority</th><th>Status</th><th>Age</th><th>Delivery</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.requestNumber} className={selected?.requestNumber === item.requestNumber ? "selected" : ""} onClick={() => setSelected(item)}><td><strong>{item.requestNumber}</strong><small>{dateLabel(item.createdAt)}</small></td><td><strong>{item.memberName}</strong><span>{item.subject}</span></td><td><em className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</em></td><td><em className="status">{statusLabels[item.status] ?? item.status}</em></td><td>{ageLabel(item.createdAt)}</td><td><span className={`delivery-dot ${item.sheetSyncStatus === "SYNCED" && item.emailReceiptStatus === "SENT" ? "good" : item.sheetSyncStatus === "FAILED" || item.emailReceiptStatus === "FAILED" ? "bad" : "waiting"}`} />{item.sheetSyncStatus === "SYNCED" && item.emailReceiptStatus === "SENT" ? "Delivered" : item.sheetSyncStatus === "FAILED" || item.emailReceiptStatus === "FAILED" ? "Failed" : "Pending"}</td></tr>)}</tbody></table>{!filtered.length && <div className="queue-empty">No requests match the current filters.</div>}</div>

              {selected && <aside className="request-editor"><button className="editor-close" onClick={() => setSelected(null)} aria-label="Close request details">×</button><p className="eyebrow">{selected.requestNumber}</p><h3>{selected.subject}</h3><div className="member-line"><strong>{selected.memberName}</strong><span>{selected.memberEmail}</span></div><p className="request-copy">{selected.description}</p>{selected.attachmentName && <p className="attachment-note">Attachment: {selected.attachmentName}</p>}<form onSubmit={saveUpdate}><label>Status<select value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Lead Contact<input value={editLead} onChange={(event) => setEditLead(event.target.value)} required /></label><label>Member-Facing Update<textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} rows={5} required /></label><button className="button button-primary" disabled={saving}>{saving ? "Saving..." : "Save Committee Update"}</button>{saveMessage && <p className="save-message">{saveMessage}</p>}</form></aside>}
            </div>
          </section>

          <section className="dashboard-footer"><span>Signed in as {viewerEmail}</span><form action="/api/prelaunch-logout" method="post"><button type="submit">Sign Out</button></form><span>KP Digital &amp; Technology Committee</span></section>
        </>
      )}
    </main>
  );
}
