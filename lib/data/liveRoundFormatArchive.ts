import type { LiveTournamentSnapshot } from "@/lib/live/types";
import { formatTeeTimeInZone } from "@/lib/live/sessionTeeTimes";
import type { RoundFormatEntry } from "./roundFormatArchive";
import type { RoundFormatSetup } from "./roundFormatSetups";

export function liveRoundFormatArchive(snapshot: LiveTournamentSnapshot, slug: string, year: number, setups: RoundFormatSetup[], timezone: string) {
  const rounds = [...new Set(snapshot.matchBoxes.map(box => box.session))].sort((a, b) => a - b);
  const dateFor = (round: number) => setups.find(setup => setup.seasonYear === year && setup.round === round)?.datePlayed ??
    snapshot.matchBoxes.find(box => box.session === round)?.teeTime.toLocaleDateString("en-CA", { timeZone: timezone }) ?? "";
  const dates = [...new Set(rounds.map(dateFor))].sort();
  const entries: RoundFormatEntry[] = rounds.map(round => {
    const boxes = snapshot.matchBoxes.filter(box => box.session === round);
    const sameDay = rounds.filter(number => dateFor(number) === dateFor(round));
    return { round, day: dates.indexOf(dateFor(round)) + 1, session: sameDay.indexOf(round) === 0 ? "Morning" : "Afternoon",
      format: boxes[0].format, setup: setups.find(setup => setup.seasonYear === year && setup.round === round),
      matchups: boxes.map(box => ({ side: box.maroonPlayers, opponent: box.whitePlayers,
        href: box.id ? `/leaderboard/${slug}/matches/${box.id}` : undefined,
        teeTime: formatTeeTimeInZone(box.teeTime, timezone) })) };
  });
  return { entries, dayDates: Object.fromEntries(dates.map((date, index) => [index + 1, date])) };
}
