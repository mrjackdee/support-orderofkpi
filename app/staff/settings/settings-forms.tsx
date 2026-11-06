"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/app/components/client-api";

type Topic = { code: string; label: string; description: string; defaultRoute: string; enabled: boolean; sort: number };
type Route = { code: string; name: string };

function Result({ error, saved }: { error: string; saved: string }) {
  return (
    <>
      {error && <p className="form-message error" role="alert">{error}</p>}
      {saved && <p className="form-message" role="status">{saved}</p>}
    </>
  );
}

export function TargetsForm({ csrf, responseTargetDays, urgentTargetDays, notifyEmails }: { csrf: string; responseTargetDays: number; urgentTargetDays: number; notifyEmails: string[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setSaved("");
    const result = await postJson("/api/staff/settings", { kind: "settings", responseTargetDays: Number(form.get("target")), urgentTargetDays: Number(form.get("urgent")), notifyEmails: String(form.get("emails") ?? "") }, csrf);
    if (!result.ok) return setError(result.error);
    setSaved("Your changes are saved.");
    router.refresh();
  }
  return (
    <form className="settings-form" onSubmit={submit}>
      <label>Reply to normal and high requests within (working days)<input name="target" type="number" min={1} max={10} defaultValue={responseTargetDays} required /></label>
      <label>Reply to urgent requests within (working days)<input name="urgent" type="number" min={1} max={10} defaultValue={urgentTargetDays} required /></label>
      <p className="field-hint full">Working days are Monday to Friday, not counting federal holidays.</p>
      <label className="full">Also email these people about every new request
        <textarea name="emails" rows={3} defaultValue={notifyEmails.join("\n")} placeholder="One email address per line" aria-describedby="new-request-hint" />
        <span className="field-hint" id="new-request-hint">One email address per line. This is only for new requests. Problem alerts are a separate list, shown below.</span>
      </label>
      <Result error={error} saved={saved} />
      <button className="button button-primary" type="submit">Save changes</button>
    </form>
  );
}

export function TopicForm({ csrf, topic, routes, isNew }: { csrf: string; topic: Topic; routes: Route[]; isNew?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setSaved("");
    const result = await postJson(
      "/api/staff/settings",
      { kind: "topic", code: isNew ? form.get("code") : topic.code, label: form.get("label"), description: form.get("description"), defaultRoute: form.get("route"), enabled: form.get("enabled") === "on", sort: Number(form.get("sort")) },
      csrf,
    );
    if (!result.ok) return setError(result.error);
    setSaved(isNew ? "Topic added." : "Your changes are saved.");
    if (isNew) event.currentTarget?.reset();
    router.refresh();
  }
  return (
    <form className="settings-form topic-form" onSubmit={submit} aria-label={isNew ? "Add a topic" : `Topic ${topic.label}`}>
      {isNew ? (
        <label>Short code, 2 to 5 letters (used in request numbers, like KP-DUE-2026-0001)<input name="code" required maxLength={5} pattern="[A-Za-z]{2,5}" placeholder="DUE" /></label>
      ) : (
        <p className="topic-code"><span>Short code</span><strong>{topic.code}</strong></p>
      )}
      <label>Topic name<input name="label" required maxLength={80} defaultValue={topic.label} /></label>
      <label className="full">One-line description members see<input name="description" maxLength={200} defaultValue={topic.description} /></label>
      <label>Who handles these requests
        <select name="route" defaultValue={topic.defaultRoute}>
          <option value="member_choice">The KPI committee the member chooses (Digital &amp; Technology if they don't choose)</option>
          {routes.map((route) => <option key={route.code} value={route.code}>{route.name}</option>)}
        </select>
      </label>
      <label>Position in the list<input name="sort" type="number" min={0} max={99} defaultValue={topic.sort} /></label>
      <label className="check"><input name="enabled" type="checkbox" defaultChecked={topic.enabled} /> Show this topic to members</label>
      <Result error={error} saved={saved} />
      <button className="button button-secondary" type="submit">{isNew ? "Add topic" : "Save changes"}</button>
    </form>
  );
}
