import type { Metadata } from "next";
import { dateTimeLabel } from "@/app/components/format";
import { SiteFooter, SiteHeader } from "@/app/components/site-chrome";
import { alertListView, type AlertListView } from "@/lib/server/alert-recipients";
import { requireStaff } from "@/lib/server/page-session";
import { ALL_ROUTES, getSettings, listTopics } from "@/lib/server/store";
import { TargetsForm, TopicForm } from "./settings-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings | KP Support Center", robots: { index: false } };

export default async function SettingsPage() {
  const session = await requireStaff("/staff/settings", "settings");
  const [settings, topics, alerts] = await Promise.all([getSettings(), listTopics(), alertListView()]);
  return (
    <main className="site-shell dashboard-shell">
      <SiteHeader actor={session.actor} active="settings" />
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Support Center settings</h1>
          <p>For support leads and administrators. Who holds each role comes from the Member Portal.</p>
        </div>
      </section>
      <section className="queue-section" aria-labelledby="targets-heading">
        <h2 id="targets-heading" className="settings-heading">Response targets and new-request notifications</h2>
        <TargetsForm csrf={session.csrf} responseTargetDays={settings.responseTargetDays} urgentTargetDays={settings.urgentTargetDays} notifyEmails={settings.notifyEmails} />
      </section>
      <section className="queue-section" aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="settings-heading">Who gets failure alerts</h2>
        <AlertRecipients alerts={alerts} />
      </section>
      <section className="queue-section" aria-labelledby="topics-heading">
        <h2 id="topics-heading" className="settings-heading">Topics</h2>
        <p className="panel-copy">A topic that has been used is never removed. Switch it off to stop members choosing it.</p>
        {topics.map((topic) => <TopicForm key={topic.code} csrf={session.csrf} topic={topic} routes={ALL_ROUTES} />)}
        <h3 className="settings-heading">Add a topic</h3>
        <TopicForm csrf={session.csrf} isNew routes={ALL_ROUTES} topic={{ code: "", label: "", description: "", defaultRoute: "digital_technology", enabled: true, sort: topics.length + 1 }} />
      </section>
      <SiteFooter csrf={session.csrf} actor={session.actor} />
    </main>
  );
}

function minutesAgo(minutes: number | null) {
  if (minutes === null || minutes < 1) return "just now";
  if (minutes < 120) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hours ago`;
}

/** Read-only: the list is kept on the Member Portal Admin Dashboard (Jack, 11/06/2026). */
function AlertRecipients({ alerts }: { alerts: AlertListView }) {
  const changedOnPortal = alerts.portalUpdatedAt && Number.isFinite(Date.parse(alerts.portalUpdatedAt)) ? dateTimeLabel(Date.parse(alerts.portalUpdatedAt)) : "";
  return (
    <div className="settings-readonly" data-testid="alert-recipients">
      <p>Emails about failed backups, missed backups, emails that could not be delivered and the Member Portal not answering go to:</p>
      <ul className="alert-list" aria-label="Current alert recipients">
        {alerts.emails.map((email) => <li key={email}>{email}</li>)}
      </ul>
      <p className="muted" data-testid="alert-source">
        {alerts.source === "portal" && <>From the Member Portal Admin Dashboard. Last refreshed {dateTimeLabel(alerts.fetchedAt)} ({minutesAgo(alerts.refreshedMinutesAgo)}).{changedOnPortal && <> Last changed there {changedOnPortal}.</>}</>}
        {alerts.source === "env" && <>From the fallback setting on the server (SUPPORT_ALERT_EMAILS), because the list has not yet been fetched from the Member Portal.</>}
        {alerts.source === "default" && <>The standing default, because the list has not yet been fetched from the Member Portal.</>}
      </p>
      {alerts.failedSinceRefresh && <p className="muted">The last try to refresh the list, {dateTimeLabel(alerts.lastFailureAt)}, did not work. The list above stays in use until a refresh works.</p>}
      <p><strong>Change these in the Member Portal Admin Dashboard.</strong></p>
    </div>
  );
}
