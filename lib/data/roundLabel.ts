/**
 * "Round N" for display — except the individual-champion round sentinel
 * (round 0; 2025-danzante's extra round that decided the individual
 * champion, unrelated to the Maroon-vs-White match play — see
 * scripts/rebuild-2025-round-numbering.ts), which shows as "Round INDI"
 * since it isn't part of a tournament's numbered match-play sequence.
 */
export function formatRoundLabel(round: number): string {
  return round === 0 ? "Round INDI" : `Round ${round}`;
}
