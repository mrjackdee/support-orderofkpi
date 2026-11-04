// What a file really is, judged by its bytes (BR-13). The name and the browser's claim are ignored.

export type FileKind = {
  mime: string;
  ext: string;
  label: string;
};

export const ALLOWED_KINDS: Record<string, FileKind> = {
  jpg: { mime: "image/jpeg", ext: "jpg", label: "JPG picture" },
  png: { mime: "image/png", ext: "png", label: "PNG picture" },
  webp: { mime: "image/webp", ext: "webp", label: "WebP picture" },
  pdf: { mime: "application/pdf", ext: "pdf", label: "PDF" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", label: "Word document" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx", label: "Excel workbook" },
};

function ascii(bytes: Uint8Array, start: number, end: number) {
  let out = "";
  for (let index = start; index < Math.min(end, bytes.length); index += 1) out += String.fromCharCode(bytes[index]);
  return out;
}

function u16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/**
 * Entry names in a ZIP archive, read from its central directory. Returns null when the archive is
 * not well formed. Only names are read; nothing is decompressed.
 */
export function zipEntryNames(bytes: Uint8Array): string[] | null {
  if (bytes.length < 22) return null;
  // End of central directory: signature 0x06054b50, within the last 64 KB + 22 bytes.
  const searchStart = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= searchStart; index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = u16(bytes, eocd + 10);
  const size = u32(bytes, eocd + 12);
  const offset = u32(bytes, eocd + 16);
  if (offset + size > bytes.length || entries > 20000) return null;
  const names: string[] = [];
  let cursor = offset;
  for (let count = 0; count < entries; count += 1) {
    if (cursor + 46 > bytes.length || u32(bytes, cursor) !== 0x02014b50) return null;
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    if (cursor + 46 + nameLength > bytes.length) return null;
    names.push(new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

/** The kind of file these bytes are, or null when they are not one we accept. */
export function sniffFile(bytes: Uint8Array): FileKind | null {
  if (bytes.length < 8) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ALLOWED_KINDS.jpg;
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return ALLOWED_KINDS.png;
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return ALLOWED_KINDS.webp;
  if (ascii(bytes, 0, 5) === "%PDF-") return ALLOWED_KINDS.pdf;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // Word and Excel files are ZIP containers holding [Content_Types].xml plus a word/ or xl/ folder.
    const names = zipEntryNames(bytes);
    if (!names || !names.includes("[Content_Types].xml")) return null;
    if (names.some((name) => name.startsWith("word/"))) return ALLOWED_KINDS.docx;
    if (names.some((name) => name.startsWith("xl/"))) return ALLOWED_KINDS.xlsx;
    return null;
  }
  return null;
}

/**
 * A file name that is safe to store and to send back in Content-Disposition, ending in the
 * extension that matches what the file really is.
 */
export function safeFileName(original: string, kind: FileKind) {
  const base = (original.split(/[\\/]/).pop() ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f"<>:|?*;]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const withoutExt = base.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim() || "attachment";
  const ext = kind.ext;
  const currentExt = base.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase();
  if (currentExt === ext || (ext === "jpg" && currentExt === "jpeg")) return base;
  return `${withoutExt}.${ext}`;
}

/** Content-Disposition header value for a download, ASCII fallback plus RFC 5987 UTF-8 name. */
export function contentDisposition(name: string) {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
