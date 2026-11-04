// Small in-memory sliding-window limits (TECH_SPEC 5.2). The Support Center runs as one Node
// process, so memory is enough; a restart forgets the counts, which errs towards allowing.

const windows = new Map<string, number[]>();

export function hit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const recent = (windows.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  if (windows.size > 5000) {
    for (const [name, times] of windows) if (!times.some((time) => now - time < windowMs)) windows.delete(name);
  }
  return true;
}

export const WRITES_PER_HOUR = 60;
export const NEW_REQUESTS_PER_DAY = 10;
export const SIGN_IN_ATTEMPTS_PER_IP = 30;
