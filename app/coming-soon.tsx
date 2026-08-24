const features = [
  { number: "01", title: "Submit once", copy: "Choose the right topic and send the details in one guided request." },
  { number: "02", title: "Track every update", copy: "Use one request number to see progress from receipt through resolution." },
  { number: "03", title: "Stay connected", copy: "Add follow-up information without sending separate messages or starting over." },
];

export default function ComingSoon() {
  return (
    <main className="coming-soon-page">
      <header className="coming-header"><a className="brand" href="/"><span className="brand-mark">KP</span><span className="brand-copy"><strong>Member Support</strong><small>Order of KP</small></span></a><span className="launch-badge"><i /> In development</span></header>
      <section className="coming-hero">
        <div className="coming-copy"><p className="eyebrow">KP SUPPORT CENTER</p><h1>A clearer way to get help is coming.</h1><p>The KP Support Center will give members one place to ask for help, receive a request number, and follow progress without chasing updates.</p><a className="button button-primary" href="#preview">See what is coming <span aria-hidden="true">↓</span></a></div>
        <div className="coming-visual" aria-label="Preview of the KP Support Center"><div className="visual-glow" /><div className="browser-frame hero-frame"><div className="browser-bar"><span /><span /><span /><small>support.orderofkpi.com</small></div><img src="/screenshots/member-request.jpg" width="1348" height="926" fetchPriority="high" alt="Preview of the guided KP member support request form" /></div><div className="preview-chip"><strong>24 to 48 hours</strong><span>Typical response time</span></div></div>
      </section>
      <section className="coming-features" aria-label="What members can expect">{features.map((feature) => <article key={feature.number}><span>{feature.number}</span><h2>{feature.title}</h2><p>{feature.copy}</p></article>)}</section>
      <section className="preview-section" id="preview"><div className="preview-heading"><div><p className="eyebrow">DESIGNED FOR MEMBERS</p><h2>Simple steps. Clear ownership. Visible progress.</h2></div><p>The experience is being tested for clarity, accessibility, and mobile use before member access opens.</p></div><div className="preview-grid"><article><div className="browser-frame"><div className="browser-bar"><span /><span /><span /><small>Guided request</small></div><img src="/screenshots/member-request.jpg" width="1348" height="926" loading="lazy" alt="Guided support topic selection and request form" /></div><div><strong>Guided request submission</strong><p>Plain-language categories help each request reach the right support area.</p></div></article><article><div className="browser-frame"><div className="browser-bar"><span /><span /><span /><small>Request tracking</small></div><img src="/screenshots/status-tracker.jpg" width="1348" height="926" loading="lazy" alt="KP request status tracking experience" /></div><div><strong>Progress you can see</strong><p>Members will be able to check status, ownership, and updates from one place.</p></div></article></div></section>
      <section className="launch-panel"><span className="launch-icon">✓</span><div><p className="eyebrow">COMING SOON</p><h2>We are completing final preparation.</h2><p>Member access will open after final testing and administrator readiness are complete.</p></div></section>
      <footer className="coming-footer"><span>© {new Date().getFullYear()} THE ORDER OF KPI, INC.</span><a href="/admin-login">D&amp;T Administration</a><span>TRADITION &amp; EXCELLENCE</span></footer>
    </main>
  );
}
