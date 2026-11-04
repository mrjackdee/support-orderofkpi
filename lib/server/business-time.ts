// Business time in US Eastern (Q10): Monday to Friday, all day, except US federal holidays on
// the date they are observed (./holidays). Used by the response clock, the past-target counts and
// the daily digest.

import { isFederalHoliday } from "./holidays";

const ZONE = "America/New_York";
const DAY_MS = 24 * 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

type EasternParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function easternParts(ms: number): EasternParts {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(new Date(ms))) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

function offsetAt(ms: number) {
  const p = easternParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant of the next Eastern midnight after `ms`. */
export function nextEasternMidnight(ms: number) {
  const p = easternParts(ms);
  const localMidnight = Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0);
  let guess = localMidnight - offsetAt(ms);
  guess = localMidnight - offsetAt(guess);
  return guess <= ms ? ms + DAY_MS : guess;
}

export function isBusinessDay(ms: number) {
  const p = easternParts(ms);
  return p.weekday >= 1 && p.weekday <= 5 && !isFederalHoliday(p.year, p.month, p.day);
}

/** The US Eastern calendar date, "YYYY-MM-DD". */
export function easternDateKey(ms: number) {
  const p = easternParts(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minutes since Eastern midnight (0 to 1439). */
export function easternMinuteOfDay(ms: number) {
  const p = easternParts(ms);
  return p.hour * 60 + p.minute;
}

/** Business milliseconds between two instants. */
export function businessMsBetween(from: number, to: number) {
  if (to <= from) return 0;
  let total = 0;
  let cursor = from;
  while (cursor < to) {
    const end = Math.min(nextEasternMidnight(cursor), to);
    if (isBusinessDay(cursor)) total += end - cursor;
    cursor = end;
  }
  return total;
}

/** The instant `ms` business milliseconds after `start`. */
export function addBusinessMs(start: number, ms: number) {
  let cursor = start;
  let remaining = ms;
  for (let guard = 0; guard < 4000; guard += 1) {
    const midnight = nextEasternMidnight(cursor);
    if (isBusinessDay(cursor)) {
      const span = midnight - cursor;
      if (remaining <= span) return cursor + remaining;
      remaining -= span;
    }
    cursor = midnight;
  }
  return cursor;
}

export function addBusinessDays(start: number, days: number) {
  return addBusinessMs(start, days * DAY_MS);
}

export function businessDaysBetween(from: number, to: number) {
  return businessMsBetween(from, to) / DAY_MS;
}

/** The calendar year in US Eastern, used in request numbers. */
export function easternYear(ms: number) {
  return easternParts(ms).year;
}
