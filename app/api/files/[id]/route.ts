// BR-37: a file opens only for the member who owns the request and staff who can see it.
// Always downloaded, never shown inline, with the type the bytes were checked to be.

import fs from "node:fs";
import { errorJson, sessionProblem } from "@/lib/server/http";
import { contentDisposition } from "@/lib/server/file-check";
import { sessionFromRequest } from "@/lib/server/session";
import { fileForDownload } from "@/lib/server/store";
import { uploadPath } from "@/lib/server/uploads";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const state = await sessionFromRequest(request);
  if (state.kind !== "ok") return sessionProblem(state);
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return errorJson("Not found", 404);
  const file = await fileForDownload(id, state.actor);
  if (!file) return errorJson("Not found", 404);
  let data: Buffer;
  try {
    data = fs.readFileSync(uploadPath(file.storageKey));
  } catch {
    return errorJson("This file is not available right now.", 410);
  }
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "content-type": file.mime,
      "content-length": String(data.length),
      "content-disposition": contentDisposition(file.originalName),
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
