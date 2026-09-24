/**
 * Standard competition ranking ("1224"): ties share a rank, and the next
 * distinct score picks up right after (never skipping only one rank in a
 * way that double-counts). `scores` should include the caller's own score
 * (it can't be greater than itself, so including it never inflates the
 * rank) — the simplest correct way to rank "me" among "everyone".
 */
export function rankAmong(scores: number[], myScore: number): number {
  return 1 + scores.filter((score) => score > myScore).length;
}

/** Whether at least one other score in the list matches this one exactly. */
export function isTiedAmong(scores: number[], myScore: number): boolean {
  return scores.filter((score) => score === myScore).length > 1;
}

/** Golf-style rank label: "T3" when tied, plain "3" when alone at that rank. */
export function formatRankLabel(rank: number, tied: boolean): string {
  return tied ? `T${rank}` : `${rank}`;
}

export interface RankedEntry<T> {
  rank: number;
  rankLabel: string;
  entry: T;
}

/** Sorts `entries` by score (highest first) and attaches each one's rank/rankLabel. */
export function rankEntries<T>(entries: T[], scoreOf: (entry: T) => number): RankedEntry<T>[] {
  const scores = entries.map(scoreOf);
  return [...entries]
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .map((entry) => {
      const score = scoreOf(entry);
      const rank = rankAmong(scores, score);
      return { rank, rankLabel: formatRankLabel(rank, isTiedAmong(scores, score)), entry };
    });
}
