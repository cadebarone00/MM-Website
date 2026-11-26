import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";

/** Small pure helpers for the Profile screens (tested in profileUi.test.ts). Wording copied from the website. */

/** "Nov 24, 2026" for a "YYYY-MM-DD" day (UTC, so it never moves a day). */
export const profileDay = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`)) : null;

/** The small letter on a round: P Play, T Trip, L League, C Tourney. Past-trip and imported rounds have none. */
export const ROUND_LETTER: Partial<Record<ProfileHistoryRound["source"], { letter: string; name: string }>> = {
  personal: { letter: "P", name: "Play" }, trip: { letter: "T", name: "Golf trip" }, league: { letter: "L", name: "League" },
  tourney: { letter: "C", name: "Tourney" }, tournament: { letter: "C", name: "Tournament" },
};

/** Rounds that show their trip / league / tourney name next to the date. */
export const NAMED_SOURCES = new Set<ProfileHistoryRound["source"]>(["trip", "league", "tourney", "tournament"]);

type Pair = { differential: number } | "waiting" | undefined;

/** What's under a round's score: its differential, a 9+9 pair's, "Waiting for 9", or "Not counted". */
export function underScore(round: Pick<ProfileHistoryRound, "countsForHandicap" | "differential">, pair: Pair): string {
  if (round.countsForHandicap && round.differential !== null) return String(round.differential);
  if (pair === "waiting") return "Waiting for 9";
  if (pair) return `${pair.differential} · 9+9`;
  return "Not counted";
}

/** The differential the round sheet shows (one decimal), or "—". */
export function sheetDifferential(round: Pick<ProfileHistoryRound, "countsForHandicap" | "differential">, pair: Pair): string {
  const d = round.countsForHandicap && round.differential !== null ? round.differential : pair && pair !== "waiting" ? pair.differential : null;
  return d === null ? "—" : d.toFixed(1);
}

/** A round's +/− against par over the holes it scored: "E", "+3", "-1", or "—". */
export function roundToPar(holes: { par: number; strokes: number }[]): string {
  if (!holes.length) return "—";
  const diff = holes.reduce((t, h) => t + h.strokes - h.par, 0);
  return diff === 0 ? "E" : diff > 0 ? `+${diff}` : String(diff);
}

/** "5 rounds", "1 round" */
export const roundsLabel = (n: number) => `${n} ${n === 1 ? "round" : "rounds"}`;
