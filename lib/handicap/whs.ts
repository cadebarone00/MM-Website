// lib/handicap/whs.ts
/**
 * USGA World Handicap System math: differential per round, and Handicap
 * Index as the (adjusted) average of the best differentials from a player's
 * most recent rounds. Deliberately excludes the Playing Conditions
 * Calculation (PCC) and the official soft-cap/hard-cap rules that limit how
 * fast a real GHIN index can rise — see the design spec's "Out of scope".
 */

interface RoundsUsedRow {
  use: number;
  adjustment: number;
}

// Index 0 = 1 round used, index 19 = 20 rounds used. Official WHS table.
const ROUNDS_USED_TABLE: RoundsUsedRow[] = [
  { use: 1, adjustment: -2.0 }, // 1 round
  { use: 1, adjustment: -1.0 }, // 2
  { use: 1, adjustment: 0 },    // 3
  { use: 1, adjustment: 1.0 },  // 4
  { use: 1, adjustment: 2.0 },  // 5
  { use: 2, adjustment: -1.0 }, // 6
  { use: 2, adjustment: 0 },    // 7
  { use: 2, adjustment: 0 },    // 8
  { use: 3, adjustment: 0 },    // 9
  { use: 3, adjustment: 0 },    // 10
  { use: 3, adjustment: 0 },    // 11
  { use: 4, adjustment: 0 },    // 12
  { use: 4, adjustment: 0 },    // 13
  { use: 4, adjustment: 0 },    // 14
  { use: 5, adjustment: 0 },    // 15
  { use: 5, adjustment: 0 },    // 16
  { use: 6, adjustment: 0 },    // 17
  { use: 6, adjustment: 0 },    // 18
  { use: 7, adjustment: 0 },    // 19
  { use: 8, adjustment: 0 },    // 20
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculateDifferential(totalScore: number, rating: number, slope: number): number {
  return round1(((totalScore - rating) * 113) / slope);
}

/**
 * `differentials` must already be limited by the caller to the rounds that
 * should count (most recent ones) — this function only knows counts and
 * values, never dates. Any extra entries past 20 are dropped defensively.
 */
export function calculateHandicapIndex(differentials: number[]): number | null {
  if (differentials.length === 0) return null;
  const considered = differentials.slice(0, 20);
  const row = ROUNDS_USED_TABLE[considered.length - 1];
  const lowest = [...considered].sort((a, b) => a - b).slice(0, row.use);
  const average = lowest.reduce((sum, d) => sum + d, 0) / lowest.length;
  return round1(average + row.adjustment);
}

/**
 * `differentialsChronological` must be ALL of a player's differentials,
 * oldest first. Replays what the Handicap Index would have been after each
 * round (using only that round and the ones before it, capped at the most
 * recent 20 as of that point) and returns the lowest index ever reached.
 */
export function calculateLowIndex(differentialsChronological: number[]): number | null {
  let low: number | null = null;
  for (let i = 0; i < differentialsChronological.length; i++) {
    const windowStart = Math.max(0, i + 1 - 20);
    const asOfThisRound = differentialsChronological.slice(windowStart, i + 1);
    const index = calculateHandicapIndex(asOfThisRound);
    if (index !== null && (low === null || index < low)) low = index;
  }
  return low;
}
