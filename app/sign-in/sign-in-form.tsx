"use client";

import { FormEvent, useState } from "react";

export default function SignInForm({ next, resetUrl }: { next: string; resetUrl: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
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
    <form onSubmit={submit} noValidate={false}>
      <label>KPI email address<input type="email" name="email" autoComplete="username" required placeholder="name@orderofkpi.org" /></label>
      <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
      <a className="text-link" href={resetUrl}>Forgot password?</a>
    </form>
  );
}
