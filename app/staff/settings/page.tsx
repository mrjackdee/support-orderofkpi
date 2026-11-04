import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/app/components/site-chrome";
import { requireStaff } from "@/lib/server/page-session";
import { ALL_ROUTES, getSettings, listTopics } from "@/lib/server/store";
import { TargetsForm, TopicForm } from "./settings-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings | KP Support Center", robots: { index: false } };

export default async function SettingsPage() {
  const session = await requireStaff("/staff/settings", "settings");
  const [settings, topics] = await Promise.all([getSettings(), listTopics()]);
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
        <h2 id="targets-heading" className="settings-heading">Response targets and notifications</h2>
        <TargetsForm csrf={session.csrf} responseTargetDays={settings.responseTargetDays} urgentTargetDays={settings.urgentTargetDays} notifyEmails={settings.notifyEmails} />
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
