// The release stamp shown in the footer (BR-64). The deploy writes release.json; without it the
// stamp reads "v.00".

import fs from "node:fs";
import path from "node:path";

let cached: { stamp: string; readAt: number } | null = null;

export function releaseStamp() {
  const now = Date.now();
  if (cached && now - cached.readAt < 60_000) return cached.stamp;
  let stamp = "v.00";
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "release.json"), "utf8"));
    const value = typeof raw === "string" ? raw : raw?.release ?? raw?.stamp ?? raw?.version;
    if (typeof value === "string" && value.trim()) stamp = value.trim().slice(0, 40);
  } catch {
    // No release file: keep v.00.
  }
  cached = { stamp, readAt: now };
  return stamp;
}
