/** Which way a fairway or green shot missed, for the Scorecard grid. Matches lib/handicap/types.ts's ShotDirection. */
export type ScorecardShotDirection = "left" | "right" | "short" | "long" | "penalty";

/** One hole's worth of data for the Scorecard grid, shared by the handicap "Submit a score" flow and live scoring — null fields mean "not entered yet". */
export interface ScorecardHoleRow {
  hole: number;
  par: number;
  yards: number;
  score: number | null;
  opponentScore?: number | null; // live scoring only: the score you entered for the person you scored
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

export interface ScorecardTotals {
  score: number | null;
  /** Strokes over/under par across the holes entered. */
  toPar: number | null;
  putts: number | null;
  /** Par-3s (and formats that don't track it) don't count toward the total. */
  fairways: { hit: number; total: number };
  greens: { hit: number; total: number };
}

/** Round totals for the Scorecard's summary box, over the holes entered so far. */
export function scorecardTotals(rows: ScorecardHoleRow[]): ScorecardTotals {
  const entered = rows.filter((row) => row.score != null);
  const puttRows = entered.filter((row) => row.putts != null);
  const fairwayRows = entered.filter((row) => row.fir != null);
  const greenRows = entered.filter((row) => row.gir != null);
  return {
    score: entered.length > 0 ? entered.reduce((sum, row) => sum + (row.score ?? 0), 0) : null,
    toPar: entered.length > 0 ? entered.reduce((sum, row) => sum + (row.score ?? 0) - row.par, 0) : null,
    putts: puttRows.length > 0 ? puttRows.reduce((sum, row) => sum + (row.putts ?? 0), 0) : null,
    fairways: { hit: fairwayRows.filter((row) => row.fir).length, total: fairwayRows.length },
    greens: { hit: greenRows.filter((row) => row.gir).length, total: greenRows.length },
  };
}
