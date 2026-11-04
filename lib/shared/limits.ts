// Limits shared by the page and the server (BR-12, BR-13). The server enforces every one.

export const SUBJECT_MAX = 140;
export const DESCRIPTION_MAX = 2500;
export const MESSAGE_MAX = 2500;
export const RESOLUTION_MIN = 5;
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FILES_PER_SUBMISSION = 5;
export const REOPEN_DAYS = 14;

export const FILE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const FILE_HELP = "Optional. Up to 5 files: JPG, PNG, WebP, PDF, Word or Excel, 10 MB each. For a screen recording, paste a shared-drive link in the description.";

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}
