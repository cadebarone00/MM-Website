import type { RoundFormatSetup } from "./roundFormatSetups";
import type { Tournament } from "./types";
import { tournamentRoundSequence } from "./tournamentRoundSequence";

export interface RoundFormatMatchup {
  side: string[]; // player slugs — the lone player for Singles, both partners for Fourball/Alt Shot
  opponent: string[]; // empty = played solo, no real match (e.g. an absent opponent) — see archiveOnlyMatches
  teeTime?: string; // RealMatch.teeTimeCst — blank for every historical match until hand-entered
}

export interface RoundFormatEntry {
  setup?: RoundFormatSetup | null;
  round: number; // true round-of-the-trip number (Alt Shot included in the count) — matches tournamentRoundSequence order
  day: number;
  session: "Morning" | "Afternoon";
  format: string;
  matchups: RoundFormatMatchup[];
}

export interface RoundFormatDayGroup {
  day: number;
  date: string | null; // from Tournament.dayDates, hand-entered separately — null until filled in
  morning: RoundFormatEntry | null; // null = no round that session ("No Rounds Played")
  afternoon: RoundFormatEntry | null;
}

/**
 * `roundFormatArchive`'s entries regrouped by day, one Morning/Afternoon
 * slot each (either can be empty — a day doesn't always have both). Pure —
 * no I/O. `dayDates` is optional and separate from the schedule itself
 * (see Tournament.dayDates); a day with no entry there just shows without
 * a date rather than guessing one.
 */
export function groupRoundFormatArchiveByDay(entries: RoundFormatEntry[], dayDates: Record<number, string> = {}): RoundFormatDayGroup[] {
  const days = [...new Set(entries.map((entry) => entry.day))].sort((a, b) => a - b);
  return days.map((day) => ({
    day,
    date: dayDates[day] ?? null,
    morning: entries.find((entry) => entry.day === day && entry.session === "Morning") ?? null,
    afternoon: entries.find((entry) => entry.day === day && entry.session === "Afternoon") ?? null,
  }));
}

/**
 * Every round of a tournament's Maroon-vs-White match play schedule, in
 * true round order, with every matchup that was actually played that
 * round (a round can have several simultaneous matches — e.g. three
 * Fourball pairings going out at once). Pure — no I/O — derived entirely
 * from the tournament's own `matches` array, so it's always exactly what
 * the schedule says, nothing hand-reconciled.
 */
export function roundFormatArchive(tournament: Pick<Tournament, "matches" | "archiveOnlyMatches">): RoundFormatEntry[] {
  // archiveOnlyMatches never affects the round sequence itself (tournamentRoundSequence
  // reads `matches` only) — it only adds extra matchups to a round that's already real.
  const allMatches = [...tournament.matches, ...(tournament.archiveOnlyMatches ?? [])];
  return tournamentRoundSequence(tournament).map((representative, index) => ({
    round: index + 1,
    day: representative.day,
    session: representative.session,
    format: representative.format,
    matchups: allMatches
      .filter((match) => match.day === representative.day && match.session === representative.session)
      .map((match) => ({ side: match.maroonPlayers, opponent: match.whitePlayers, teeTime: match.teeTimeCst })),
  }));
}
