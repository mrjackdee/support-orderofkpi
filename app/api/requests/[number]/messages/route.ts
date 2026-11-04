// Member follow-ups and reopening (BR-23, BR-24), staff replies and internal notes (BR-34).

import { errorJson, guardMutation, json, storeErrorResponse } from "@/lib/server/http";
import { normalizeRequestNumber } from "@/lib/server/numbering";
import { kickOutbox } from "@/lib/server/outbox";
import { addMessage, type MessageKind } from "@/lib/server/store";
import { stageUploads, UploadError } from "@/lib/server/uploads";
import { FILE_MAX_BYTES, FILES_PER_SUBMISSION, MESSAGE_MAX } from "@/lib/shared/limits";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ number: string }> }) {
  if (Number(request.headers.get("content-length") ?? 0) > FILE_MAX_BYTES * FILES_PER_SUBMISSION + 1024 * 1024) {
    return errorJson("The files are too large. Each file can be up to 10 MB.", 413);
  }
  const guard = await guardMutation(request);
  if (!guard.ok) return guard.response;
  const number = normalizeRequestNumber(decodeURIComponent((await context.params).number));
  if (!number) return errorJson("Not found", 404);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorJson("We could not read the form. Please try again.", 400);
  }
  const kindValue = String(form.get("kind") ?? "member");
  const kind: MessageKind | null = kindValue === "member" || kindValue === "staff" || kindValue === "note" ? kindValue : null;
  if (!kind) return errorJson("Choose what to send.", 400);
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  const fileEntries = form.getAll("files");
  const hasFiles = fileEntries.some((entry) => typeof entry !== "string" && entry.size > 0);
  if (!body && !hasFiles) return errorJson("Write a message or add a file.", 400);
  if (!body && kind !== "member") return errorJson("Write a message first.", 400);
  if (body.length > MESSAGE_MAX) return errorJson(`Messages can be up to ${MESSAGE_MAX.toLocaleString("en-US")} characters.`, 400);
  try {
    const staged = kind === "note" ? [] : await stageUploads(fileEntries);
    if (kind === "note" && hasFiles) return errorJson("Internal notes cannot carry files. Attach files to a reply instead.", 400);
    await addMessage(number, guard.actor, kind, body || "Added a file.", staged);
    kickOutbox();
    return json({ ok: true }, 201);
  } catch (error) {
    if (error instanceof UploadError) return errorJson(error.message, 400);
    return storeErrorResponse(error);
  }
}
