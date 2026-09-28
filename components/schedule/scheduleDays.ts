import type { UpcomingRoundScheduleItem } from "@/lib/data/activeSeasonOverlay";

/**
 * Every tournament day ("YYYY-MM-DD"), sorted: each round's date plus every
 * day in the start–end range (skipped when the range looks wrong, i.e. over a month).
 * Shared by the schedule landing's day picker and the day screen's arrows so both list the same days.
 */
export function tournamentDays(rounds: UpcomingRoundScheduleItem[], startDate: string, endDate: string): string[] {
  const dates = new Set(rounds.flatMap(round => round.date ? [round.date] : []));
  const first = Date.parse(startDate), last = Date.parse(endDate);
  if (Number.isFinite(first) && Number.isFinite(last) && last - first <= 31 * 86400000) {
    for (let time = first; time <= last; time += 86400000) dates.add(new Date(time).toISOString().slice(0, 10));
  }
  return [...dates].sort();
}

/**
 * The session numbers shown on a day: the rounds dated that day, or — when
 * none are dated yet — the default pairing (Day 1 = Sessions 1 & 2, Day 2 = 3 & 4, …).
 */
export function sessionsForDay(rounds: UpcomingRoundScheduleItem[], day: string, dayIndex: number): number[] {
  const dated = rounds.filter(round => round.date === day).map(round => round.session).sort((a, b) => a - b);
  return dated.length ? dated : [dayIndex * 2 + 1, dayIndex * 2 + 2];
}
