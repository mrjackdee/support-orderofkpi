// CSV cells for the export (BR-51).

/** A cell that starts like a formula is prefixed so a spreadsheet shows it as text. */
export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, string>[], fallbackHeaders: string[]) {
  const headers = rows.length ? Object.keys(rows[0]) : fallbackHeaders;
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((key) => csvCell(String(row[key] ?? ""))).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
