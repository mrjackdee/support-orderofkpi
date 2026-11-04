import type { Metadata } from "next";

export const metadata: Metadata = { title: "Not found | KP Support Center", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="admin-login-page">
      <section className="admin-login-card not-found-card">
        <a className="brand" href="/" aria-label="KP Support Center home"><span className="brand-mark" aria-hidden="true">KP</span><span className="brand-copy"><strong>Member support</strong><small>Order of KP</small></span></a>
        <div className="admin-login-heading">
          <p className="eyebrow">Not found</p>
          <h1>We could not find that page</h1>
          <p>The request or page does not exist, or it is not one you can open. Check the request number and try again.</p>
        </div>
        <a className="button button-primary" href="/requests">Go to my requests</a>
      </section>
    </main>
  );
}
