"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/app/components/client-api";
import { STAFF_STATUS_CHOICES, STATUS_LABELS } from "@/lib/shared/statuses";
import type { StaffExtras } from "@/lib/shared/views";

type Route = { code: string; name: string };

/**
 * Keeps a control's choice in step with the saved value after the page refreshes, without
 * remounting the control (a remount would wipe the "Saved" confirmation the person just got).
 */
function useSynced<T>(saved: T): [T, (value: T) => void] {
  const [value, setValue] = useState(saved);
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setValue(saved);
  }
  return [value, setValue];
}

function useAction(number: string, csrf: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setSaved("");
    const result = await postJson(`/api/requests/${encodeURIComponent(number)}/actions`, body, csrf);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setSaved(done);
    router.refresh();
    return true;
  }
  return { busy, error, saved, run };
}

export function StatusControl({ number, csrf, status }: { number: string; csrf: string; status: string }) {
  const [next, setNext] = useSynced(status === "WITHDRAWN" ? "RECEIVED" : status);
  const [resolution, setResolution] = useState("");
  const action = useAction(number, csrf);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run({ action: "status", status: next, resolution }, `Status saved: ${STATUS_LABELS[next as keyof typeof STATUS_LABELS]}.`);
    if (ok) setResolution("");
  }

  if (status === "WITHDRAWN") return <p className="panel-copy">The member withdrew this request, so its status cannot be changed.</p>;
  return (
    <form className="panel-form" onSubmit={submit}>
      <label htmlFor="status-select">Status</label>
      <select id="status-select" value={next} onChange={(event) => setNext(event.target.value)}>
        {STAFF_STATUS_CHOICES.map((code) => <option key={code} value={code}>{STATUS_LABELS[code]}</option>)}
      </select>
      {next === "COMPLETED" && next !== status && (
        <>
          <label htmlFor="resolution">Resolution note to the member (required)</label>
          <textarea id="resolution" value={resolution} onChange={(event) => setResolution(event.target.value)} rows={4} placeholder="Tell the member what was done and anything they need to do next." />
        </>
      )}
      {next === "WAITING" && next !== status && <p className="panel-copy">The member is emailed. Send a reply first saying what you need from them.</p>}
      {action.error && <p className="form-message error" role="alert">{action.error}</p>}
      {action.saved && <p className="form-message" role="status">{action.saved}</p>}
      <button className="button button-primary" type="submit" disabled={action.busy || next === status}>{action.busy ? "Saving..." : "Save status"}</button>
    </form>
  );
}

export function AssignControl({ number, csrf, staff }: { number: string; csrf: string; staff: StaffExtras }) {
  const [assignee, setAssignee] = useSynced(staff.assigneeEmail ?? "");
  const action = useAction(number, csrf);
  const options = staff.assignable;
  return (
    <form
      className="panel-form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run({ action: "assign", assignee }, assignee ? "Assigned." : "Assignment cleared.");
      }}
    >
      <label htmlFor="assignee-select">Assigned to</label>
      <select id="assignee-select" value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={!staff.canAssign}>
        <option value="">Nobody yet</option>
        {options.map((person) => <option key={person.email} value={person.email}>{person.name}</option>)}
      </select>
      {!options.length && <p className="panel-copy">Nobody on this KPI committee has signed in to the Support Center yet, so there is nobody to assign.</p>}
      {!staff.canAssign && <p className="panel-copy">The committee chair or a support lead assigns requests.</p>}
      {action.error && <p className="form-message error" role="alert">{action.error}</p>}
      {action.saved && <p className="form-message" role="status">{action.saved}</p>}
      {staff.canAssign && <button className="button button-secondary" type="submit" disabled={action.busy || assignee === (staff.assigneeEmail ?? "")}>Save assignment</button>}
    </form>
  );
}

export function RerouteControl({ number, csrf, current, routes }: { number: string; csrf: string; current: string; routes: Route[] }) {
  const [route, setRoute] = useSynced(current);
  const action = useAction(number, csrf);
  return (
    <form
      className="panel-form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run({ action: "reroute", route }, "Moved. The member can see the new KPI committee.");
      }}
    >
      <label htmlFor="route-select">KPI committee</label>
      <select id="route-select" value={route} onChange={(event) => setRoute(event.target.value)}>
        {routes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
      {action.error && <p className="form-message error" role="alert">{action.error}</p>}
      {action.saved && <p className="form-message" role="status">{action.saved}</p>}
      <button className="button button-secondary" type="submit" disabled={action.busy || route === current}>Move request</button>
    </form>
  );
}
