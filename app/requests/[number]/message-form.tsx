"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postForm } from "@/app/components/client-api";
import { FILE_ACCEPT, FILE_MAX_BYTES, FILES_PER_REQUEST, MESSAGE_MAX, filesCapMessage, formatBytes } from "@/lib/shared/limits";

export default function MessageForm({
  number,
  csrf,
  kind,
  label,
  placeholder,
  buttonLabel,
  allowFiles,
  filesLeft = FILES_PER_REQUEST,
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
  /** How many more files the request can hold (BR-13: 5 per request in all). */
  filesLeft?: number;
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
    const tooMany = filesCapMessage(FILES_PER_REQUEST - filesLeft, files.length);
    if (tooMany) return setError(tooMany);
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
      {allowFiles && filesLeft > 0 && (
        <label className="file-field">Add files (optional)
          <input ref={fileInput} type="file" multiple accept={FILE_ACCEPT} />
          <small>
            This request can take {filesLeft === 1 ? "1 more file" : `${filesLeft} more files`} ({FILES_PER_REQUEST} in all), 10 MB each: JPG, PNG, WebP, PDF, Word or Excel.
          </small>
        </label>
      )}
      {allowFiles && filesLeft <= 0 && (
        <p className="file-field-full" data-testid="files-full">
          This request already has {FILES_PER_REQUEST} files, the most it can hold. To share more, paste a shared-drive link in your message.
        </p>
      )}
      {error && <p className="form-message error" role="alert">{error}</p>}
      {message && <p className="form-message" role="status">{message}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Sending..." : buttonLabel}</button>
    </form>
  );
}
