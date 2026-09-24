import type { Market } from "./marketKeys";
import { holePools, type HistoryRow, type IndividualRound, type PlayedScore } from "./lowIndividualFuture";
import { fairAmericanOdds } from "./teamWinnerFuture";

/**
 * Total Birdies future — every birdie (exactly one under par) made by the
 * whole field across every individual-ball round (Singles and Fourball;
 * Foursome has no individual scores), as an Over/Under on a half-birdie
 * line. Eagles don't count as birdies.
 *
 * The featured line is re-centred on every refresh to the half-birdie line
 * nearest 50/50. Each bet's selection key carries the line it was placed
 * at ("over:41.5"), and settlement grades every bet against its own line.
 *
 * Pure: no database access. totalBirdiesPricing.ts supplies the inputs.
 */

export const TOTAL_BIRDIES_SIMULATIONS = 10_000;
export const TOTAL_BIRDIES_MODEL_VERSION = "total-birdies-monte-carlo-v1";

export function totalBirdiesMarketKey(seasonYear: number): string {
  return `total-birdies:${seasonYear}`;
}

/** A player's chance of a birdie on a target hole: Measure 1 and Measure 2 weighted 50/50, as in the match model. */
export function birdieChance(history: HistoryRow[], hole: { par: number; yards: number; hole: number }): number | null {
  const { one, two } = holePools(history, hole);
  const rate = (pool: number[]) => pool.filter((score) => score === hole.par - 1).length / pool.length;
  if (!one.length && !two.length) return null;
  if (!one.length) return rate(two);
  if (!two.length) return rate(one);
  return (rate(one) + rate(two)) / 2;
}

/** Birdies already made on confirmed holes. */
export function birdiesSoFar(players: string[], rounds: IndividualRound[], played: PlayedScore): number {
  let birdies = 0;
  for (const player of players) for (const round of rounds) for (const hole of round.holes) {
    if (played(player, round.round, hole.hole) === hole.par - 1) birdies += 1;
  }
  return birdies;
}

/** Simulated final field totals — confirmed birdies plus a draw for every unplayed hole. Check missingHistory() first. */
export function simulateTotalBirdies({
  players,
  rounds,
  history,
  played,
  simulations = TOTAL_BIRDIES_SIMULATIONS,
  random = Math.random,
}: {
  players: string[];
  rounds: IndividualRound[];
  history: Map<string, HistoryRow[]>;
  played: PlayedScore;
  simulations?: number;
  random?: () => number;
}): number[] {
  const fixed = birdiesSoFar(players, rounds, played);
  const chances: number[] = [];
  for (const player of players) {
    const rows = history.get(player) ?? [];
    for (const round of rounds) for (const hole of round.holes) {
      if (played(player, round.round, hole.hole) !== null) continue;
      const chance = birdieChance(rows, hole);
      if (chance) chances.push(chance);
    }
  }
  const totals: number[] = [];
  for (let run = 0; run < simulations; run += 1) {
    let total = fixed;
    for (const chance of chances) if (random() < chance) total += 1;
    totals.push(total);
  }
  return totals;
}

export type FeaturedLine = { line: number; over: number; under: number; mean: number };

/** The half-birdie line whose Over is closest to 50/50, with its fair probabilities. */
export function featuredLine(totals: number[]): FeaturedLine {
  const sorted = [...totals].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, total) => sum + total, 0) / sorted.length;
  let best: FeaturedLine | null = null;
  for (let whole = sorted[0]; whole <= sorted[sorted.length - 1]; whole += 1) {
    const line = whole + 0.5;
    const over = sorted.filter((total) => total > line).length / sorted.length;
    if (!best || Math.abs(over - 0.5) < Math.abs(best.over - 0.5)) best = { line, over, under: 1 - over, mean };
  }
  return best ?? { line: sorted[0] + 0.5, over: 0, under: 1, mean };
}

export function parseBirdieSelection(key: string): { side: "over" | "under"; line: number } | null {
  const [side, line] = key.split(":");
  const value = Number(line);
  return (side === "over" || side === "under") && Number.isFinite(value) ? { side, line: value } : null;
}

export function totalBirdiesMarket(seasonYear: number, line: FeaturedLine): Market {
  const selections = [
    { key: `over:${line.line}`, label: `Over ${line.line} total birdies in ${seasonYear}`, odds: fairAmericanOdds(line.over) },
    { key: `under:${line.line}`, label: `Under ${line.line} total birdies in ${seasonYear}`, odds: fairAmericanOdds(line.under) },
  ];
  return {
    marketKey: totalBirdiesMarketKey(seasonYear),
    groupLabel: "Total Birdies",
    selections: selections.filter((selection): selection is { key: string; label: string; odds: number } => selection.odds !== null),
  };
}
