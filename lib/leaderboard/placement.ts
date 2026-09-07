/**
 * Competition-style placement for an already score-sorted leaderboard.
 * Equal scores share a tied label (T4); the following player skips the
 * occupied places (T4, T4, then 6).
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
  const tied = ranked.filter((candidate) => candidate.toPar === entry.toPar).length > 1;
  return `${tied ? "T" : ""}${placement}`;
}
