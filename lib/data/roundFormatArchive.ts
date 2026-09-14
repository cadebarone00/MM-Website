import type { Tournament } from "./types";
import { tournamentRoundSequence } from "./tournamentRoundSequence";

export interface RoundFormatMatchup {
  side: string[]; // player slugs — the lone player for Singles, both partners for Fourball/Alt Shot
  opponent: string[];
}

export interface RoundFormatEntry {
  round: number; // true round-of-the-trip number (Alt Shot included in the count) — matches tournamentRoundSequence order
  day: number;
  session: "Morning" | "Afternoon";
  format: string;
  matchups: RoundFormatMatchup[];
}

/**
 * Every round of a tournament's Maroon-vs-White match play schedule, in
 * true round order, with every matchup that was actually played that
 * round (a round can have several simultaneous matches — e.g. three
 * Fourball pairings going out at once). Pure — no I/O — derived entirely
 * from the tournament's own `matches` array, so it's always exactly what
 * the schedule says, nothing hand-reconciled.
 */
export function roundFormatArchive(tournament: Pick<Tournament, "matches">): RoundFormatEntry[] {
  return tournamentRoundSequence(tournament).map((representative, index) => ({
    round: index + 1,
    day: representative.day,
    session: representative.session,
    format: representative.format,
    matchups: tournament.matches
      .filter((match) => match.day === representative.day && match.session === representative.session)
      .map((match) => ({ side: match.maroonPlayers, opponent: match.whitePlayers })),
  }));
}
