// Request statuses (BR-33). Stored as these codes; members see the labels.

export const STATUS_CODES = ["RECEIVED", "REVIEW", "WORKING", "WAITING", "COMPLETED", "WITHDRAWN"] as const;
export type StatusCode = (typeof STATUS_CODES)[number];

export const STATUS_LABELS: Record<StatusCode, string> = {
  RECEIVED: "Request Received",
  REVIEW: "Under Review",
  WORKING: "Working On It",
  WAITING: "Waiting on You",
  COMPLETED: "Completed",
  WITHDRAWN: "Withdrawn",
};

/** Statuses staff may choose. Withdrawn is the member's own choice. */
export const STAFF_STATUS_CHOICES: StatusCode[] = ["RECEIVED", "REVIEW", "WORKING", "WAITING", "COMPLETED"];

export const OPEN_STATUSES: StatusCode[] = ["RECEIVED", "REVIEW", "WORKING", "WAITING"];
export const CLOSED_STATUSES: StatusCode[] = ["COMPLETED", "WITHDRAWN"];

export function isStatusCode(value: unknown): value is StatusCode {
  return typeof value === "string" && (STATUS_CODES as readonly string[]).includes(value);
}

export function isOpenStatus(status: string) {
  return (OPEN_STATUSES as string[]).includes(status);
}

/** The four-stage progress trail (BR-22). Waiting on You sits on the "Working On It" stage. */
export const PROGRESS_STAGES = [
  { key: "RECEIVED", title: "Request Received", icon: "✓" },
  { key: "REVIEW", title: "Under Review", icon: "◷" },
  { key: "WORKING", title: "Working On It", icon: "⚒" },
  { key: "COMPLETED", title: "Completed", icon: "◆" },
] as const;

export function progressIndex(status: string) {
  switch (status) {
    case "REVIEW":
      return 1;
    case "WORKING":
    case "WAITING":
      return 2;
    case "COMPLETED":
      return 3;
    default:
      return 0;
  }
}

export const URGENCIES = [
  { value: "Normal", label: "Normal, no immediate deadline" },
  { value: "High", label: "High, affecting current work" },
  { value: "Urgent", label: "Urgent, blocking an immediate need" },
] as const;
export type Urgency = (typeof URGENCIES)[number]["value"];

export function isUrgency(value: unknown): value is Urgency {
  return typeof value === "string" && URGENCIES.some((item) => item.value === value);
}
