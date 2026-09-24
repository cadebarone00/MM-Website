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
