// Request numbers (BR-17): KP-<TOPIC>-<YEAR>-<NNNN>, sequential per topic and year, never reused.

export const REQUEST_NUMBER_PATTERN = /^KP-[A-Z]{2,5}-\d{4}-\d{4,}$/;

export function formatRequestNumber(topicCode: string, year: number, sequence: number) {
  if (!/^[A-Z]{2,5}$/.test(topicCode)) throw new Error("Topic codes are 2 to 5 capital letters");
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error("Sequence must be a positive whole number");
  return `KP-${topicCode}-${year}-${String(sequence).padStart(4, "0")}`;
}

export function normalizeRequestNumber(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim().toUpperCase();
  return REQUEST_NUMBER_PATTERN.test(cleaned) ? cleaned : null;
}
