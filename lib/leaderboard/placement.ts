/**
 * Competition-style placement for an already score-sorted leaderboard.
 * The first row in an equal-score group carries the tied label (T4); the
 * following tied rows stay blank, and the next player skips occupied places
 * (T4, blank, then 6).
 */
export function placementNumber<T extends { toPar: number }>(ranked: readonly T[], index: number): number | null {
  const entry = ranked[index];
  if (!entry) return null;
  return ranked.findIndex((candidate) => candidate.toPar === entry.toPar) + 1;
}

export function placementLabel<T extends { toPar: number }>(ranked: readonly T[], index: number): string {
  const entry = ranked[index];
  const placement = placementNumber(ranked, index);
  if (!entry || placement == null) return "-";
  const firstAtScore = ranked.findIndex((candidate) => candidate.toPar === entry.toPar);
  const tied = ranked.filter((candidate) => candidate.toPar === entry.toPar).length > 1;
  if (tied && index !== firstAtScore) return "";
  return `${tied ? "T" : ""}${placement}`;
}

/** A player's standalone placement never omits its tied marker. */
export function placementValueLabel<T extends { toPar: number }>(ranked: readonly T[], index: number): string {
  const entry = ranked[index];
  const placement = placementNumber(ranked, index);
  if (!entry || placement == null) return "-";
  const tied = ranked.filter((candidate) => candidate.toPar === entry.toPar).length > 1;
  return `${tied ? "T" : ""}${placement}`;
}
