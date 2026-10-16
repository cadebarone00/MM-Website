import type { GolfMatchPreview } from "./golfTripPreviewFixture";

/** Count actual supplied matches in earlier rounds; undated matches belong to the source round. */
export function competitionMatchOffset(match: Pick<GolfMatchPreview, "round" | "matches">, round: number): number {
  return match.matches.filter(pairing => (pairing.round ?? match.round) < round).length;
}
