import type { SeasonWindow } from "./seasonCalendar";
import type { MatchFormat } from "./types";
export type OverviewMatch = { number: number; teeTime: string | null; state: string; started: boolean };
export type OverviewSession = { number: number; date: string | null; course: string | null; format: string | null; courseLocked: boolean; matchupsLocked: boolean; started: boolean; teeTimes: (string | null)[]; matches: OverviewMatch[] };
export type OverviewYear = SeasonWindow & { timezone: string; beginDate: string | null; endDate: string | null; datesLocked: boolean; count: number | null; countLocked: boolean; sessions: OverviewSession[]; historical: boolean; test: boolean };
export type SeasonOverviewData = { years: OverviewYear[]; activeYear: number; calendarAvailable: boolean; checkedAt: string };
export function overviewDays(year: OverviewYear) {
  const dates = new Set(year.sessions.flatMap(row => row.date ? [row.date] : []));
  if (year.beginDate && year.endDate) {
    const start = Date.parse(year.beginDate), end = Date.parse(year.endDate);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 31 * 86400000) {
      for (let time = start; time <= end; time += 86400000) dates.add(new Date(time).toISOString().slice(0,10));
    }
  }
  const groups: { date: string | null; sessions: OverviewSession[] }[] = [...dates].sort().map(date => ({ date, sessions: year.sessions.filter(row => row.date === date) }));
  const undated = year.sessions.filter(row => !row.date);
  if (undated.length) groups.push({ date: null, sessions: undated });
  return groups;
}
export function overviewMatchCount(format: string | null): number {
  return format === "Singles" ? 6 : (["Fourball", "Foursome", "Alternate Shot", "Scramble"] as (MatchFormat | string)[]).includes(format ?? "") ? 3 : 0;
}
