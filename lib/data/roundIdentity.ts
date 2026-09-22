import type { RealMatch, Tournament } from "./types";
import { tournamentRoundSequence } from "./tournamentRoundSequence";

/** All runtime round IDs include shared-ball sessions. Zero is Danzante's INDI event. */
export function matchRound(tournament: Pick<Tournament, "matches">, match: Pick<RealMatch, "day" | "session">): number | null {
  const index = tournamentRoundSequence(tournament).findIndex((entry) => entry.day === match.day && entry.session === match.session);
  return index < 0 ? null : index + 1;
}

/** Only use at the ORIGINAL scorecards-YYYY import boundary, never on database rows. */
export function legacyScorecardRound(year: number, round: number): number {
  const maps: Record<number, Record<number, number>> = {
    2025: { 1: 1, 2: 0, 3: 3, 4: 5, 5: 6 },
    2026: { 1: 1, 2: 3, 3: 4, 4: 5, 5: 7, 6: 8 },
  };
  if (!maps[year]) return round;
  const mapped = maps[year][round];
  if (mapped == null) throw new Error(`Unknown original scorecard round ${year}/${round}`);
  return mapped;
}

/** Generated career data uses a separate, documented 2026 day-three sequence. */
export function generatedCareerRound(year: number, round: number): number {
  if (year === 2024 && round >= 3) return round + 1; // Workbook omits the Cradle session.
  return year === 2026 ? round === 5 ? 6 : round === 6 ? 5 : round : round;
}
