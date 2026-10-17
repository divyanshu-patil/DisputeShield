import type { DeadlineBand } from "@ds/schemas";

// Deadline bands (05 section 6 rule 3). Editable constants, not PayPal rules.
export const URGENT_HOURS = 24;
export const SOON_HOURS = 72;

export function hoursLeft(dueAt: string | null, now: Date): number | null {
  if (!dueAt) return null;
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return null;
  return Math.round(((due - now.getTime()) / 3_600_000) * 10) / 10;
}

export function deadlineBand(dueAt: string | null, now: Date): DeadlineBand {
  const h = hoursLeft(dueAt, now);
  if (h === null) return "OK";
  if (h <= 0) return "OVERDUE";
  if (h < URGENT_HOURS) return "URGENT";
  if (h < SOON_HOURS) return "SOON";
  return "OK";
}

export const isOverdue = (dueAt: string | null, now: Date): boolean =>
  deadlineBand(dueAt, now) === "OVERDUE";

/** Fact display for dates: YYYY-MM-DD in UTC (05 section 2.2 conventions). */
export function displayDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new RangeError(`not a date: ${iso}`);
  return new Date(t).toISOString().slice(0, 10);
}

/** "5 h 12 m", "3 d 4 h", "Overdue". */
export function formatTimeLeft(dueAt: string | null, now: Date): string {
  const h = hoursLeft(dueAt, now);
  if (h === null) return "No deadline";
  if (h <= 0) return "Overdue";
  const mins = Math.floor(h * 60);
  if (mins < 60 * 48) return `${Math.floor(mins / 60)} h ${mins % 60} m`;
  return `${Math.floor(mins / 1440)} d ${Math.floor((mins % 1440) / 60)} h`;
}
