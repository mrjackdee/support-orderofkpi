// New requests (BR-11 to BR-17) and the member's own list (BR-20).

import { requestsEnabled } from "@/lib/server/config";
import { errorJson, guardMutation, json, sessionProblem, storeErrorResponse } from "@/lib/server/http";
import { kickOutbox } from "@/lib/server/outbox";
import { NEW_REQUESTS_PER_DAY } from "@/lib/server/rate-limit";
import { sessionFromRequest } from "@/lib/server/session";
import { countRequestsSince, createRequest, listMyRequests } from "@/lib/server/store";
import { stageUploads, UploadError } from "@/lib/server/uploads";
import { DESCRIPTION_MAX, FILE_MAX_BYTES, FILES_PER_SUBMISSION, SUBJECT_MAX } from "@/lib/shared/limits";
import { isUrgency } from "@/lib/shared/statuses";
import { isCommitteeSlug } from "@/lib/shared/topics";

export const dynamic = "force-dynamic";

const MAX_BODY = FILE_MAX_BYTES * FILES_PER_SUBMISSION + 1024 * 1024;

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

export async function GET(request: Request) {
  const state = await sessionFromRequest(request);
  if (state.kind !== "ok") return sessionProblem(state);
  return json({ requests: await listMyRequests(state.actor) });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return errorJson("The files are too large. Each file can be up to 10 MB.", 413);
  const guard = await guardMutation(request);
  if (!guard.ok) return guard.response;
  if (!requestsEnabled()) return errorJson("Request submission will open when the KP Support Center launches.", 503);
  const actor = guard.actor;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorJson("We could not read the form. Please try again.", 400);
  }
  const topicCode = text(form.get("topicCode")).toUpperCase();
  const urgency = text(form.get("urgency"));
  const subject = text(form.get("subject"));
  const description = text(form.get("description"));
  const chosen = text(form.get("chosenCommittee"));
  const clientToken = text(form.get("clientToken"));

  if (!/^[A-Z]{2,5}$/.test(topicCode)) return errorJson("Please choose what you need help with.", 400);
  if (!isUrgency(urgency)) return errorJson("Please choose how soon you need this resolved.", 400);
  if (!subject) return errorJson("Please give your request a short title.", 400);
  if (subject.length > SUBJECT_MAX) return errorJson(`The title can be up to ${SUBJECT_MAX} characters.`, 400);
  if (!description) return errorJson("Please tell us what you need.", 400);
  if (description.length > DESCRIPTION_MAX) return errorJson(`The description can be up to ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.`, 400);
  if (chosen && !isCommitteeSlug(chosen)) return errorJson("Please choose a KPI committee from the list.", 400);
  if (!/^[A-Za-z0-9-]{16,64}$/.test(clientToken)) return errorJson("Please refresh the page and try again.", 400);

  if ((await countRequestsSince(actor, Date.now() - 24 * 60 * 60 * 1000)) >= NEW_REQUESTS_PER_DAY) {
    return errorJson(`You have sent ${NEW_REQUESTS_PER_DAY} requests today. Please add details to an existing request, or try again tomorrow.`, 429);
  }

  try {
    const staged = await stageUploads(form.getAll("files"));
    const saved = await createRequest(actor, { topicCode, urgency, subject, description, chosenCommittee: chosen || null, clientToken }, staged);
    kickOutbox();
    return json({ number: saved.number, duplicate: saved.duplicate, dueAt: saved.dueAt }, saved.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof UploadError) return errorJson(error.message, 400);
    return storeErrorResponse(error);
  }
}
