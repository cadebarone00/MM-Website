/**
 * Score determines placement. Holes completed only order players within the
 * same score group, placing the player farther through first.
 */
export function compareLeaderboardOrder<T extends { toPar: number; thru?: number | null; played?: number | null; gross?: number | null; player?: string }>(a: T, b: T) {
  const aThru = a.thru ?? a.played ?? 0;
  const bThru = b.thru ?? b.played ?? 0;
  return a.toPar - b.toPar
    || bThru - aThru
    || (a.gross ?? 0) - (b.gross ?? 0)
    || (a.player ?? "").localeCompare(b.player ?? "");
}
