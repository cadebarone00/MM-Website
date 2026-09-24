import { fantasyPointsForRound, type FantasyPicks } from "@/lib/fantasy/scoring";
import { groupScheduleByDay } from "@/lib/fantasy/roundSchedule";
import type { Tournament } from "@/lib/data/types";
import type { UpcomingRoundScheduleItem } from "@/lib/data/activeSeasonOverlay";

/**
 * Day 1 / Day 2 / ... labels above one evenly-spaced row of round circles —
 * one circle per round actually scheduled that day (never a fixed count per
 * day), each showing the drafted team's combined fantasy points for that
 * round once it's started, blank beforehand. Day labels and circles share
 * one CSS grid with a column per round, so a day with 2 rounds gets a label
 * spanning exactly those 2 circles.
 */
export function FantasyRoundCircles({
  tournament,
  picks,
  schedule,
}: {
  tournament: Tournament;
  picks: FantasyPicks;
  schedule: UpcomingRoundScheduleItem[];
}) {
  const days = groupScheduleByDay(schedule);
  const totalRounds = days.reduce((sum, day) => sum + day.rounds.length, 0);
  if (totalRounds === 0) return null;

  return (
    <div className="grid items-end gap-x-1 gap-y-2" style={{ gridTemplateColumns: `repeat(${totalRounds}, minmax(0, 1fr))` }}>
      {days.map((day) => (
        <div
          key={day.day}
          style={{ gridColumn: `span ${day.rounds.length}` }}
          className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-700 text-center"
        >
          Day {day.day}
        </div>
      ))}

      {days.flatMap((day) =>
        day.rounds.map((round) => {
          const points = fantasyPointsForRound(tournament, picks, round.round);
          return (
            <div key={round.round} className="flex flex-col items-center gap-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-maroon-700 bg-white font-score text-sm font-bold tabular-nums text-ink-900">
                {points === null ? "–" : points}
              </div>
              <span className="font-condensed text-3xs font-bold text-ink-600">Rd {round.round}</span>
              {round.format && <span className="max-w-full truncate font-sans text-[9px] leading-tight text-ink-400">{round.format}</span>}
            </div>
          );
        })
      )}
    </div>
  );
}
