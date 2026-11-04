"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postForm } from "@/app/components/client-api";
import { FILE_ACCEPT, FILE_MAX_BYTES, FILES_PER_SUBMISSION, MESSAGE_MAX, formatBytes } from "@/lib/shared/limits";

export default function MessageForm({
  number,
  csrf,
  kind,
  label,
  placeholder,
  buttonLabel,
  allowFiles,
  done,
  id,
}: {
  number: string;
  csrf: string;
  kind: "member" | "staff" | "note";
  label: string;
  placeholder: string;
  buttonLabel: string;
  allowFiles: boolean;
  done: string;
  id: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    const files = Array.from(fileInput.current?.files ?? []);
    if (files.length > FILES_PER_SUBMISSION) return setError(`You can attach up to ${FILES_PER_SUBMISSION} files at a time.`);
    const tooBig = files.find((file) => file.size > FILE_MAX_BYTES);
    if (tooBig) return setError(`"${tooBig.name}" is ${formatBytes(tooBig.size)}. Each file can be up to 10 MB.`);
    if (!body.trim() && !files.length) return setError("Write a message first.");
    const form = new FormData();
    form.set("kind", kind);
    form.set("body", body);
    for (const file of files) form.append("files", file);
    setBusy(true);
    const result = await postForm(`/api/requests/${encodeURIComponent(number)}/messages`, form, csrf);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setBody("");
    if (fileInput.current) fileInput.current.value = "";
    setMessage(done);
    router.refresh();
  }

  return (
    <form className="message-form" onSubmit={submit}>
      <label id={`${id}-label`} htmlFor={`${id}-body`}>{label}</label>
      <textarea id={`${id}-body`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={MESSAGE_MAX} rows={4} placeholder={placeholder} />
      {allowFiles && (
        <label className="file-field">Add files (optional)
          <input ref={fileInput} type="file" multiple accept={FILE_ACCEPT} />
          <small>Up to {FILES_PER_SUBMISSION} files, 10 MB each: JPG, PNG, WebP, PDF, Word or Excel.</small>
        </label>
      )}
      {error && <p className="form-message error" role="alert">{error}</p>}
      {message && <p className="form-message" role="status">{message}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Sending..." : buttonLabel}</button>
    </form>
  );
}
