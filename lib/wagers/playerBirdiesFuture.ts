import type { Market } from "./marketKeys";
import type { HistoryRow, IndividualRound, PlayedScore } from "./lowIndividualFuture";
import { fairAmericanOdds } from "./teamWinnerFuture";
import { isBirdie, isDoubleOrWorse, outcomeChance, outcomesSoFar, type HoleOutcome } from "./totalBirdiesFuture";

/**
 * Per-player hole-stat futures: how many times each player makes a given
 * score across every individual-ball round (Singles and Fourball), as
 * Over/Under with alternate lines. Two stats share this engine:
 *
 * - Player Birdies: exactly one under par (an eagle isn't a birdie).
 * - Player Doubles: double bogey or worse (two or more over par).
 *
 * The public card shows a slider of lines per player, defaulting to the line
 * nearest 50/50. Every line is its own selection ("cam-latto:over:12.5"), so
 * a bet keeps the line it was placed at.
 *
 * Pure: no database access. playerBirdiesPricing.ts supplies the inputs.
 */

export type PlayerStat = "birdies" | "doubles";

export const PLAYER_STATS: Record<PlayerStat, { outcome: HoleOutcome; noun: string; marketPrefix: string; title: string }> = {
  birdies: { outcome: isBirdie, noun: "birdies", marketPrefix: "player-birdies", title: "Player Birdies" },
  doubles: { outcome: isDoubleOrWorse, noun: "doubles or worse", marketPrefix: "player-doubles", title: "Player Doubles" },
};

export const PLAYER_BIRDIES_SIMULATIONS = 10_000;
export const PLAYER_BIRDIES_MODEL_VERSION = "player-birdies-monte-carlo-v1";
/** Alternate lines stop where either side falls below this chance (about +3,200 at the extreme). */
export const MIN_SIDE_PROBABILITY = 0.03;

export function playerStatMarketKey(stat: PlayerStat, seasonYear: number): string {
  return `${PLAYER_STATS[stat].marketPrefix}:${seasonYear}`;
}

export function playerBirdiesMarketKey(seasonYear: number): string {
  return playerStatMarketKey("birdies", seasonYear);
}

/** Simulated final counts for one player, as a histogram: histogram[t] = runs ending on t. */
export function simulatePlayerBirdies({
  player,
  rounds,
  history,
  played,
  outcome = isBirdie,
  simulations = PLAYER_BIRDIES_SIMULATIONS,
  random = Math.random,
}: {
  player: string;
  rounds: IndividualRound[];
  history: HistoryRow[];
  played: PlayedScore;
  outcome?: HoleOutcome;
  simulations?: number;
  random?: () => number;
}): number[] {
  const fixed = outcomesSoFar([player], rounds, played, outcome);
  const chances: number[] = [];
  for (const round of rounds) for (const hole of round.holes) {
    if (played(player, round.round, hole.hole) !== null) continue;
    const chance = outcomeChance(history, hole, outcome);
    if (chance) chances.push(chance);
  }
  const histogram: number[] = [];
  for (let run = 0; run < simulations; run += 1) {
    let total = fixed;
    for (const chance of chances) if (random() < chance) total += 1;
    histogram[total] = (histogram[total] ?? 0) + 1;
  }
  return Array.from(histogram, (count) => count ?? 0);
}

export type BirdieLine = { line: number; over: number; under: number; overOdds: number | null; underOdds: number | null };

/** Every half-point line where both Over and Under keep at least MIN_SIDE_PROBABILITY. */
export function birdieLines(histogram: number[]): BirdieLine[] {
  const runs = histogram.reduce((sum, count) => sum + count, 0);
  const lines: BirdieLine[] = [];
  let atOrBelow = 0;
  for (let total = 0; total < histogram.length; total += 1) {
    atOrBelow += histogram[total];
    const under = atOrBelow / runs;
    const over = 1 - under;
    if (over < MIN_SIDE_PROBABILITY) break;
    if (under < MIN_SIDE_PROBABILITY) continue;
    lines.push({ line: total + 0.5, over, under, overOdds: fairAmericanOdds(over), underOdds: fairAmericanOdds(under) });
  }
  return lines;
}

/** The line whose Over is closest to 50/50 — where the slider starts. */
export function featuredLineIndex(lines: BirdieLine[]): number {
  let best = 0;
  lines.forEach((line, index) => { if (Math.abs(line.over - 0.5) < Math.abs(lines[best].over - 0.5)) best = index; });
  return best;
}

export function expectedBirdies(histogram: number[]): number {
  const runs = histogram.reduce((sum, count) => sum + count, 0);
  return histogram.reduce((sum, count, total) => sum + count * total, 0) / runs;
}

export type PlayerBirdiesEntry = { player: string; soFar: number; expected: number; featured: number; lines: BirdieLine[] };

export function playerBirdieSelectionKey(player: string, side: "over" | "under", line: number): string {
  return `${player}:${side}:${line}`;
}

export function parsePlayerBirdieSelection(key: string): { player: string; side: "over" | "under"; line: number } | null {
  const [player, side, line] = key.split(":");
  const value = Number(line);
  return player && (side === "over" || side === "under") && Number.isFinite(value) ? { player, side, line: value } : null;
}

export function playerStatMarket(stat: PlayerStat, seasonYear: number, entries: PlayerBirdiesEntry[], displayName: (player: string) => string): Market {
  const { noun, title } = PLAYER_STATS[stat];
  const selections = entries.flatMap((entry) =>
    entry.lines.flatMap((line) => [
      { key: playerBirdieSelectionKey(entry.player, "over", line.line), label: `${displayName(entry.player)} over ${line.line} ${noun} in ${seasonYear}`, odds: line.overOdds },
      { key: playerBirdieSelectionKey(entry.player, "under", line.line), label: `${displayName(entry.player)} under ${line.line} ${noun} in ${seasonYear}`, odds: line.underOdds },
    ]),
  );
  return {
    marketKey: playerStatMarketKey(stat, seasonYear),
    groupLabel: title,
    selections: selections.filter((selection): selection is { key: string; label: string; odds: number } => selection.odds !== null),
  };
}

export function playerBirdiesMarket(seasonYear: number, entries: PlayerBirdiesEntry[], displayName: (player: string) => string): Market {
  return playerStatMarket("birdies", seasonYear, entries, displayName);
}
