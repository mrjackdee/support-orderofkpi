// US federal holidays (5 U.S.C. 6103), with the observed-date rule: a holiday on a Saturday is
// observed the Friday before, one on a Sunday the Monday after. Business-day counts skip the
// observed date. Pure: works for any year with no table to keep up to date.
//
// New Year's Day on a Saturday is observed on Friday December 31 of the year before, so that
// date belongs to the earlier year's list (2027 has twelve observed dates for that reason).

export type Holiday = { date: string; name: string };

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekdayOf(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The nth given weekday (0 Sunday to 6 Saturday) of a month, e.g. the third Monday. */
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = weekdayOf(year, month, 1);
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

function lastWeekday(year: number, month: number, weekday: number) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekdayOf(year, month, days);
  return days - ((last - weekday + 7) % 7);
}

/** Moves a fixed-date holiday off the weekend. */
function observed(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** The eleven holidays of one year, on the dates they are observed (which may fall in another year). */
function holidaysOfYear(year: number): Holiday[] {
  return [
    { date: observed(year, 1, 1), name: "New Year's Day" },
    { date: iso(year, 1, nthWeekday(year, 1, 1, 3)), name: "Birthday of Martin Luther King, Jr." },
    { date: iso(year, 2, nthWeekday(year, 2, 1, 3)), name: "Washington's Birthday" },
    { date: iso(year, 5, lastWeekday(year, 5, 1)), name: "Memorial Day" },
    { date: observed(year, 6, 19), name: "Juneteenth National Independence Day" },
    { date: observed(year, 7, 4), name: "Independence Day" },
    { date: iso(year, 9, nthWeekday(year, 9, 1, 1)), name: "Labor Day" },
    { date: iso(year, 10, nthWeekday(year, 10, 1, 2)), name: "Columbus Day" },
    { date: observed(year, 11, 11), name: "Veterans Day" },
    { date: iso(year, 11, nthWeekday(year, 11, 4, 4)), name: "Thanksgiving Day" },
    { date: observed(year, 12, 25), name: "Christmas Day" },
  ];
}

const cache = new Map<number, Holiday[]>();

/** Every observed federal holiday whose observed date falls in `year`, in date order. */
export function federalHolidays(year: number): Holiday[] {
  const cached = cache.get(year);
  if (cached) return cached;
  const prefix = `${year}-`;
  const list = [...holidaysOfYear(year), ...holidaysOfYear(year + 1)]
    .filter((holiday) => holiday.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date));
  cache.set(year, list);
  return list;
}

/** Is this calendar date (as numbers, month 1 to 12) an observed federal holiday? */
export function isFederalHoliday(year: number, month: number, day: number) {
  const key = iso(year, month, day);
  return federalHolidays(year).some((holiday) => holiday.date === key);
}
