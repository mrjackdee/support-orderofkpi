"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/app/components/client-api";

export default function WithdrawButton({ number, csrf }: { number: string; csrf: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function withdraw() {
    setBusy(true);
    setError("");
    const result = await postJson(`/api/requests/${encodeURIComponent(number)}/actions`, { action: "withdraw" }, csrf);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return <button type="button" className="text-button withdraw-link" onClick={() => setConfirming(true)}>I no longer need this request</button>;
  }
  return (
    <div className="confirm-box" role="group" aria-label="Withdraw this request">
      <p>Withdraw this request? The team will stop working on it. You can always send a new one.</p>
      <div className="confirm-actions">
        <button type="button" className="button button-secondary" onClick={() => setConfirming(false)} disabled={busy}>Keep it open</button>
        <button type="button" className="button button-danger" onClick={withdraw} disabled={busy}>{busy ? "Withdrawing..." : "Withdraw request"}</button>
      </div>
      {error && <p className="form-message error" role="alert">{error}</p>}
    </div>
  );
}
