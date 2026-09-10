import type { ArchivedHandicapRound, HandicapRoundSummary } from "./types";
import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "./whs";

export function archivedDifferential(round: ArchivedHandicapRound): number | null {
  const tee = round.teeSetup;
  const format = (round.format ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!["singles", "fourball", "individual", "strokeplay", "individualstrokeplay", "matchplay", "individualmatchplay", "fourballmatchplay", "fourballstrokeplay"].includes(format)) return null;
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
