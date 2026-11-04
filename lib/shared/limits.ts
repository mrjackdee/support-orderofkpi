// Limits shared by the page and the server (BR-12, BR-13). The server enforces every one.

export const SUBJECT_MAX = 140;
export const DESCRIPTION_MAX = 2500;
export const MESSAGE_MAX = 2500;
export const RESOLUTION_MIN = 5;
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
/** BR-13: files one request can hold in all, across the first submission and every follow-up. */
export const FILES_PER_REQUEST = 5;
/** Files one form can send. Never more than the request can hold. */
export const FILES_PER_SUBMISSION = FILES_PER_REQUEST;
export const REOPEN_DAYS = 14;

export const FILE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const FILE_HELP = "Optional. Up to 5 files per request, including any you add later: JPG, PNG, WebP, PDF, Word or Excel, 10 MB each. For a screen recording, paste a shared-drive link in the description.";

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function filesWord(count: number) {
  return count === 1 ? "1 file" : `${count} files`;
}

/** How many more files a request can take. */
export function filesLeft(already: number) {
  return Math.max(0, FILES_PER_REQUEST - already);
}

/** Null when `adding` more files fit on a request that has `already`; otherwise what to tell the person. */
export function filesCapMessage(already: number, adding: number) {
  if (adding <= 0 || already + adding <= FILES_PER_REQUEST) return null;
  const left = filesLeft(already);
  if (left === 0) {
    return `This request already has ${filesWord(already)}, which is the most one request can hold. Paste a shared-drive link in your message instead.`;
  }
  return `A request can hold ${FILES_PER_REQUEST} files in all. This one already has ${filesWord(already)}, so you can add ${left} more. Please choose fewer files, or paste a shared-drive link instead.`;
}
