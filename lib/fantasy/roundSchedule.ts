// Groups the season's live round schedule (Tiger Center's round setup, see
// getUpcomingRoundSchedule in lib/data/activeSeasonOverlay.ts — imported
// here as a type only, so this file stays safe to import from a Client
// Component) into calendar days for the Fantasy "My Roster" round strip:
// one "Day N" per distinct scheduled date, in order, holding however many
// rounds are actually slated for that day (never a fixed count).
import type { UpcomingRoundScheduleItem } from "@/lib/data/activeSeasonOverlay";

export interface ScheduleDay {
  day: number;
  date: string;
  rounds: UpcomingRoundScheduleItem[];
}

/** A round with no date assigned yet can't be placed on a day — it's left out until Tiger Center gives it one. */
export function groupScheduleByDay(schedule: UpcomingRoundScheduleItem[]): ScheduleDay[] {
  const dated = schedule.filter((item): item is UpcomingRoundScheduleItem & { date: string } => item.date !== null);
  const dates = [...new Set(dated.map((item) => item.date))].sort();

  return dates.map((date, index) => ({
    day: index + 1,
    date,
    rounds: dated.filter((item) => item.date === date).sort((a, b) => a.round - b.round),
  }));
}
