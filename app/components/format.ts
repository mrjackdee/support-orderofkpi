// Dates for people, in US Eastern, MM/DD/YYYY.

const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

export function dateLabel(ms: number | null | undefined) {
  return ms ? dateFormatter.format(new Date(ms)) : "";
}

export function dateTimeLabel(ms: number | null | undefined) {
  return ms ? dateTimeFormatter.format(new Date(ms)) : "";
}

export function statusClass(status: string) {
  return `status status-${status.toLowerCase()}`;
}
