// Attachment storage on the server's disk at ${SUPPORT_DATA_DIR}/uploads/<storage key>, outside
// the web root. Files are staged under a temporary name, the database row is committed, and only
// then is the file moved into place, so a failed save leaves no row pointing at nothing.

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { uploadsDir } from "./config";
import { FILE_MAX_BYTES, FILES_PER_SUBMISSION, formatBytes } from "../shared/limits";
import { safeFileName, sniffFile, type FileKind } from "./file-check";

export type StagedFile = {
  storageKey: string;
  tempPath: string;
  originalName: string;
  mime: string;
  bytes: number;
  sha256: string;
};

export class UploadError extends Error {}

const KEY_PATTERN = /^[a-f0-9]{32}$/;

export function uploadPath(storageKey: string) {
  if (!KEY_PATTERN.test(storageKey)) throw new Error("Bad storage key");
  return path.join(uploadsDir(), storageKey);
}

/** Checks each file's size and bytes, then writes it under a temporary name. */
export async function stageUploads(entries: FormDataEntryValue[]): Promise<StagedFile[]> {
  const uploads = entries.filter((entry): entry is File => typeof entry !== "string" && entry.size > 0);
  if (uploads.length > FILES_PER_SUBMISSION) throw new UploadError(`A request can hold up to ${FILES_PER_SUBMISSION} files. Please choose fewer files.`);
  const checked: { file: File; bytes: Buffer; kind: FileKind }[] = [];
  for (const file of uploads) {
    if (file.size > FILE_MAX_BYTES) {
      throw new UploadError(`"${file.name}" is ${formatBytes(file.size)}. Each file can be up to 10 MB. For anything larger, paste a shared-drive link instead.`);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = sniffFile(bytes);
    if (!kind) {
      throw new UploadError(`"${file.name}" cannot be attached. You can attach JPG, PNG, WebP, PDF, Word or Excel files.`);
    }
    checked.push({ file, bytes, kind });
  }
  fs.mkdirSync(uploadsDir(), { recursive: true });
  const staged: StagedFile[] = [];
  try {
    for (const item of checked) {
      const storageKey = randomBytes(16).toString("hex");
      const tempPath = path.join(uploadsDir(), `tmp-${storageKey}`);
      fs.writeFileSync(tempPath, item.bytes, { mode: 0o600 });
      staged.push({
        storageKey,
        tempPath,
        originalName: safeFileName(item.file.name, item.kind),
        mime: item.kind.mime,
        bytes: item.bytes.length,
        sha256: createHash("sha256").update(item.bytes).digest("hex"),
      });
    }
  } catch (error) {
    discardStaged(staged);
    throw error;
  }
  return staged;
}

export function commitStaged(staged: StagedFile[]) {
  for (const file of staged) fs.renameSync(file.tempPath, uploadPath(file.storageKey));
}

export function discardStaged(staged: StagedFile[]) {
  for (const file of staged) {
    try {
      fs.rmSync(file.tempPath, { force: true });
    } catch {
      // Swept later.
    }
  }
}

/** Removes files no row refers to, once they are a day old (TECH_SPEC 4: nightly sweep). */
export function sweepOrphans(knownKeys: Set<string>, now = Date.now()) {
  let removed = 0;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(uploadsDir());
  } catch {
    return 0;
  }
  for (const name of entries) {
    const key = name.startsWith("tmp-") ? name.slice(4) : name;
    if (!name.startsWith("tmp-") && knownKeys.has(key)) continue;
    const full = path.join(uploadsDir(), name);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile() && now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.rmSync(full, { force: true });
        removed += 1;
      }
    } catch {
      // Ignore and try again next time.
    }
  }
  return removed;
}

export function uploadsWritable() {
  try {
    fs.mkdirSync(uploadsDir(), { recursive: true });
    const probe = path.join(uploadsDir(), `.probe-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
