import type { ArchivedHandicapRound, HandicapRoundSummary } from "./types";
import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "./whs";

// Only formats where a player posts their own individual score count toward
// a handicap (real WHS rule). Alternate Shot/Foursomes never has one — the
// player doesn't play their own ball the whole round — so it's deliberately
// excluded; there's no archived per-player scorecard for it in the first
// place (confirmed with Cade, 2026-09-11). Shared with the one-off
// scripts/backfill-archived-round-format.ts so both agree on what counts.
const INDIVIDUAL_SCORE_FORMATS = ["singles", "fourball", "individual", "strokeplay", "individualstrokeplay", "matchplay", "individualmatchplay", "fourballmatchplay", "fourballstrokeplay"];

export function isIndividualScoreFormat(format: string | null | undefined): boolean {
  return INDIVIDUAL_SCORE_FORMATS.includes((format ?? "").toLowerCase().replace(/[^a-z]/g, ""));
}

export function archivedDifferential(round: ArchivedHandicapRound): number | null {
  const tee = round.teeSetup;
  if (!isIndividualScoreFormat(round.format)) return null;
  if (round.holesPlayed !== 18 || !round.totalScore || !round.datePlayed || !tee || !Number.isFinite(tee.rating) || !tee.rating || !Number.isInteger(tee.slope) || !tee.slope || tee.slope < 55 || tee.slope > 155) return null;
  // A mixed-tee layout needs its own verified composite rating, not the base tee's rating.
  if (Object.values(tee.holeTeeSetIds ?? {}).some((id) => id !== tee.teeSetId)) return null;
  return calculateDifferential(round.totalScore, tee.rating, tee.slope);
}

export function combinedHandicapIndexes(submitted: HandicapRoundSummary[], archived: ArchivedHandicapRound[]) {
  const eligible = archived.flatMap((round) => {
    const differential = archivedDifferential(round);
    return differential == null ? [] : [{ date: round.datePlayed!, differential, round: round.round }];
  }).sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round);
  const all = [...submitted.map((r) => ({ date: r.datePlayed, differential: calculateDifferential(r.totalScore, r.rating, r.slope), round: 0 })), ...eligible].sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round);
  return {
    index: calculateHandicapIndex(all.map((r) => r.differential)),
    maroonMastersIndex: calculateHandicapIndex(eligible.map((r) => r.differential)),
    lowIndex: calculateLowIndex([...all].reverse().map((r) => r.differential)),
  };
}
