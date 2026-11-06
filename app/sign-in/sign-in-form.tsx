"use client";

// Laid out like the Member Portal's sign-in card (Jack, 11/06/2026), in the Support Center's colors.

import { FormEvent, useEffect, useState } from "react";

const SAVED_EMAIL_KEY = "kp_support_saved_email";

function MailIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c7 0 10 8 10 8a17.6 17.6 0 0 1-3.2 4.4" />
      <path d="M6.6 6.6A17.5 17.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
      <path d="m2 2 20 20" />
    </svg>
  ) : (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export default function SignInForm({ next, resetUrl }: { next: string; resetUrl: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  // "Remember me" keeps only the email address in this browser, as on the Member Portal.
  // Passwords are never stored. Storage can be unavailable (private windows); that is fine.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SAVED_EMAIL_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      /* no saved email */
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (remember) window.localStorage.setItem(SAVED_EMAIL_KEY, String(form.get("email") ?? ""));
      else window.localStorage.removeItem(SAVED_EMAIL_KEY);
    } catch {
      /* storage unavailable */
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"), next }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; next?: string };
      if (!response.ok) {
        setError(data.error || "We could not sign you in. Please try again.");
        return;
      }
      window.location.assign(data.next || "/requests/new");
    } catch {
      setError("We could not reach the Support Center. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="signin-form" onSubmit={submit}>
      {error && <div className="signin-error" role="alert">{error}</div>}

      <div className="signin-field">
        <label htmlFor="signin-email">Email Address</label>
        <div className="signin-box">
          <MailIcon />
          <input
            id="signin-email"
            type="email"
            name="email"
            autoComplete="username"
            required
            placeholder="name@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      <div className="signin-field">
        <div className="signin-label-row">
          <label htmlFor="signin-password">Password</label>
          <a className="signin-forgot" href={resetUrl}>Forgot Password?</a>
        </div>
        <div className="signin-box signin-box-password">
          <LockIcon />
          <input
            id="signin-password"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            disabled={busy}
          />
          <button
            type="button"
            className="signin-eye"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>
      </div>

      <label className="signin-remember" htmlFor="signin-remember">
        <input id="signin-remember" type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={busy} />
        Remember me
      </label>

      <button className="signin-submit" type="submit" disabled={busy}>
        {busy ? "Verifying..." : <>Secure Login <ArrowIcon /></>}
      </button>
    </form>
  );
}
