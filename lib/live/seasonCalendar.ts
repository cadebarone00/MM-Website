import { SEASON_YEARS } from "./seasonYears.ts";
import { TEST_SEASON_YEAR } from "./testSeason.ts";

export const OVERVIEW_YEARS = [2026, ...SEASON_YEARS];
export type SeasonWindow = { year: number; activeOn: string | null; passOn: string | null; locked: boolean };
export type SeasonCalendar = { windows: SeasonWindow[]; activeYear: number; archivedYears: number[]; scheduled: boolean };
export const CALENDAR_TIMEZONE = "America/Chicago";
export function calendarDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CALENDAR_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function validCalendarDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function resolveSeasonCalendar(windows: SeasonWindow[], fallback: number, today = calendarDate()): SeasonCalendar {
  const locked = windows.filter(row => row.locked && row.activeOn && row.passOn && row.year !== TEST_SEASON_YEAR).sort((a, b) => a.year - b.year);
  const current = locked.find(row => row.activeOn! <= today && today < row.passOn!);
  const ended = locked.filter(row => row.passOn! <= today);
  const successor = ended.at(-1)?.year;
  const activeYear = current?.year ?? (successor !== undefined && successor + 1 < TEST_SEASON_YEAR ? successor + 1 : fallback);
  return { windows, activeYear, archivedYears: [...new Set([2024, 2025, 2026, ...ended.map(row => row.year)])].filter(year => year !== activeYear), scheduled: Boolean(current || ended.length) };
}
