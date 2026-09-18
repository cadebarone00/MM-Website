/** Which way a fairway or green shot missed, for the Scorecard grid. Matches lib/handicap/types.ts's ShotDirection. */
export type ScorecardShotDirection = "left" | "right" | "short" | "long" | "penalty";

/** One hole's worth of data for the Scorecard grid, shared by the handicap "Submit a score" flow and live scoring — null fields mean "not entered yet". */
export interface ScorecardHoleRow {
  hole: number;
  par: number;
  yards: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null; // null = not applicable (par 3, or a format that doesn't track it) or not entered
  firDirection: ScorecardShotDirection | null;
  gir: boolean | null;
  girDirection: ScorecardShotDirection | null;
}

/** A round is complete once every hole has a recorded score. */
export function isRoundComplete(rows: ScorecardHoleRow[]): boolean {
  return rows.every((row) => row.score != null);
}

/** The first hole still missing a score, or null once the round is complete. */
export function firstIncompleteHole(rows: ScorecardHoleRow[]): number | null {
  return rows.find((row) => row.score == null)?.hole ?? null;
}
