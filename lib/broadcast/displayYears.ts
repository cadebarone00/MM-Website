// lib/broadcast/displayYears.ts
//
// Pure constants only — safe to import from a Client Component. The
// server-only DB read lives in lib/broadcast/displayYear.ts, same split as
// lib/live/seasonYears.ts / lib/live/activeSeason.ts.

/** Years selectable in Broadcast Controls today. 2026 has real (archived) data to preview the look against; 2027 is the live one. Widen this later as more years get real data behind them — the database column itself already allows 2024-2034. */
export const DISPLAY_YEARS = [2026, 2027] as const;

export function isValidDisplayYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && (DISPLAY_YEARS as readonly number[]).includes(value);
}
