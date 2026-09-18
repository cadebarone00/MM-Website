/** Which way a fairway or green shot missed, for the Round Recap card. Matches lib/handicap/types.ts's ShotDirection. */
export type RecapShotDirection = "left" | "right" | "short" | "long" | "penalty";

/** One hole's worth of data for the Round Recap card, shared by the handicap "Submit a score" flow and live scoring — null fields mean "not entered yet". */
export interface RecapHoleRow {
  hole: number;
  par: number;
  yards: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null; // null = not applicable (par 3, or a format that doesn't track it) or not entered
  firDirection: RecapShotDirection | null;
  gir: boolean | null;
  girDirection: RecapShotDirection | null;
}

/** A round is complete once every hole has a recorded score. */
export function isRoundComplete(rows: RecapHoleRow[]): boolean {
  return rows.every((row) => row.score != null);
}

/** The first hole still missing a score, or null once the round is complete. */
export function firstIncompleteHole(rows: RecapHoleRow[]): number | null {
  return rows.find((row) => row.score == null)?.hole ?? null;
}
