/** Small pure helpers for the Trip Builder screens (tested in tripBuilderRules.test.ts). */

export type DayRange = { start: string | null; end: string | null };

/**
 * One calendar picks both dates (website DateRangePicker, owner 2026-11-02): tap the first day, then the last. A tap
 * before the start, or after a finished range, starts again; the same day twice = a one-day trip.
 */
export function rangeTap(range: DayRange, day: string): DayRange {
  if (!range.start || range.end || day < range.start) return { start: day, end: null };
  return { start: range.start, end: day };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A month's calendar cells, weeks starting Sunday: null for the blanks before the 1st, then "YYYY-MM-DD" days. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`)];
}

/** "April 2027" */
export const monthTitle = (year: number, month: number) => new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
