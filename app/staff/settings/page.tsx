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
      <SiteHeader actor={session.actor} csrf={session.csrf} active="settings" />
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Support Center settings</h1>
          <p>Set how quickly requests should be answered, who hears about new requests, and which topics members can choose.</p>
        </div>
      </section>
      <section className="queue-section" aria-labelledby="targets-heading">
        <h2 id="targets-heading" className="settings-heading">Reply times and new-request emails</h2>
        <TargetsForm csrf={session.csrf} responseTargetDays={settings.responseTargetDays} urgentTargetDays={settings.urgentTargetDays} notifyEmails={settings.notifyEmails} />
      </section>
      <section className="queue-section" aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="settings-heading">Who is told when something goes wrong</h2>
        <AlertRecipients alerts={alerts} />
      </section>
      <section className="queue-section" aria-labelledby="topics-heading">
        <h2 id="topics-heading" className="settings-heading">Topics members can choose</h2>
        <p className="panel-copy">These are the choices on the New request page. Once a topic has been used it can't be deleted, but you can hide it from members.</p>
        {topics.map((topic) => <TopicForm key={topic.code} csrf={session.csrf} topic={topic} routes={ALL_ROUTES} />)}
        <h3 className="settings-heading">Add a new topic</h3>
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
      <p>If a nightly backup fails, an email can't be sent, or the Member Portal stops answering, we email:</p>
      <ul className="alert-list" aria-label="Current alert recipients">
        {alerts.emails.map((email) => <li key={email}>{email}</li>)}
      </ul>
      <p className="muted" data-testid="alert-source">
        {alerts.source === "portal" && <>This list comes from the Member Portal. Last checked {dateTimeLabel(alerts.fetchedAt)} ({minutesAgo(alerts.refreshedMinutesAgo)}).{changedOnPortal && <> Last changed {changedOnPortal}.</>}</>}
        {alerts.source === "env" && <>The list from the Member Portal hasn't loaded yet, so this site is using its own backup list for now.</>}
        {alerts.source === "default" && <>The list from the Member Portal hasn't loaded yet, so the standard address is being used for now.</>}
      </p>
      {alerts.failedSinceRefresh && <p className="muted">We couldn't check the Member Portal for changes at {dateTimeLabel(alerts.lastFailureAt)}. The list above is still being used.</p>}
      <p><strong>To change this list, go to the Admin Dashboard on the Member Portal.</strong></p>
    </div>
  );
}
