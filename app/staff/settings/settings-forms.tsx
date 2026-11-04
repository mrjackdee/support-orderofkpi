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
    setSaved("Saved.");
    router.refresh();
  }
  return (
    <form className="settings-form" onSubmit={submit}>
      <label>Response target, business days<input name="target" type="number" min={1} max={10} defaultValue={responseTargetDays} required /></label>
      <label>Urgent requests, business days<input name="urgent" type="number" min={1} max={10} defaultValue={urgentTargetDays} required /></label>
      <label className="full">Also tell these addresses about every new request
        <textarea name="emails" rows={3} defaultValue={notifyEmails.join("\n")} placeholder="One email address per line" />
      </label>
      <Result error={error} saved={saved} />
      <button className="button button-primary" type="submit">Save settings</button>
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
    setSaved(isNew ? "Topic added." : "Saved.");
    if (isNew) event.currentTarget?.reset();
    router.refresh();
  }
  return (
    <form className="settings-form topic-form" onSubmit={submit} aria-label={isNew ? "Add a topic" : `Topic ${topic.label}`}>
      {isNew ? (
        <label>Code<input name="code" required maxLength={5} pattern="[A-Za-z]{2,5}" placeholder="DUE" /></label>
      ) : (
        <p className="topic-code"><span>Code</span><strong>{topic.code}</strong></p>
      )}
      <label>Name<input name="label" required maxLength={80} defaultValue={topic.label} /></label>
      <label className="full">Description<input name="description" maxLength={200} defaultValue={topic.description} /></label>
      <label>Routed to
        <select name="route" defaultValue={topic.defaultRoute}>
          <option value="member_choice">The KPI committee the member picks, else Digital &amp; Technology</option>
          {routes.map((route) => <option key={route.code} value={route.code}>{route.name}</option>)}
        </select>
      </label>
      <label>Order<input name="sort" type="number" min={0} max={99} defaultValue={topic.sort} /></label>
      <label className="check"><input name="enabled" type="checkbox" defaultChecked={topic.enabled} /> Members can choose this topic</label>
      <Result error={error} saved={saved} />
      <button className="button button-secondary" type="submit">{isNew ? "Add topic" : "Save topic"}</button>
    </form>
  );
}
