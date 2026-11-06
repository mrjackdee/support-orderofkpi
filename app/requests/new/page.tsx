import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/app/components/site-chrome";
import { requestsEnabled } from "@/lib/server/config";
import { requireSignedIn } from "@/lib/server/page-session";
import { getSettings, listTopics } from "@/lib/server/store";
import { COMMITTEES } from "@/lib/shared/topics";
import NewRequestForm from "./new-request-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New request | KP Support Center", robots: { index: false } };

export default async function NewRequestPage() {
  const session = await requireSignedIn("/requests/new");
  const [topics, settings] = await Promise.all([listTopics({ enabledOnly: true }), getSettings()]);
  const days = settings.responseTargetDays;
  return (
    <main className="site-shell">
      <SiteHeader actor={session.actor} csrf={session.csrf} active="new" />
      <section className="intro">
        <div>
          <p className="eyebrow">Member support</p>
          <h1>Get help without chasing an update.</h1>
          <p>Tell us once, receive a request number, and follow your progress from receipt through resolution.</p>
        </div>
        <div className="response-badge"><strong>{days === 2 ? "24 to 48 hours" : `${days} business days`}</strong><span>Typical response time, Monday to Friday</span></div>
      </section>
      <section className="benefit-strip" aria-label="Member support benefits">
        <article><span aria-hidden="true">01</span><div><strong>Get to the right person</strong><small>Your topic routes the request to the right KPI committee.</small></div></article>
        <article><span aria-hidden="true">02</span><div><strong>Save time with instant help</strong><small>A helpful tip may answer your question before you submit.</small></div></article>
        <article><span aria-hidden="true">03</span><div><strong>Stay informed</strong><small>Your request number keeps every update in one place.</small></div></article>
      </section>
      <section className="workspace request-workspace" aria-label="Send a support request">
        <aside className="support-rail">
          <p className="eyebrow">What happens next</p>
          <h2>One request. Clear ownership. Visible progress.</h2>
          <ol>
            <li><span>1</span><div><strong>Tell us once</strong><small>Share the issue, impact, and any helpful screenshot.</small></div></li>
            <li><span>2</span><div><strong>We assign ownership</strong><small>Your request reaches the person best suited to help.</small></div></li>
            <li><span>3</span><div><strong>You stay informed</strong><small>Check progress and replies at any time.</small></div></li>
          </ol>
          <div className="rail-note"><span aria-hidden="true">✓</span><p><strong>No separate follow-up messages needed</strong><small>Add details and see updates on the same request.</small></p></div>
        </aside>
        <NewRequestForm
          topics={topics.map(({ code, label, description, defaultRoute }) => ({ code, label, description, defaultRoute }))}
          committees={COMMITTEES}
          csrf={session.csrf}
          name={session.actor.name}
          email={session.actor.email}
          enabled={requestsEnabled()}
          normalDays={settings.responseTargetDays}
          urgentDays={settings.urgentTargetDays}
        />
      </section>
      <SiteFooter csrf={session.csrf} actor={session.actor} />
    </main>
  );
}
