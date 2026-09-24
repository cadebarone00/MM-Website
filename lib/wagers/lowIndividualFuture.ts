import { bucket } from "@/lib/odds/preRoundSingles";
import type { Market } from "./marketKeys";
import { fairAmericanOdds } from "./teamWinnerFuture";

/**
 * Low Individual future — the player with the fewest total strokes across
 * every individual-ball round (Singles and Fourball; Foursome/Alternate Shot
 * rounds don't count). Every player is assumed to finish every hole. Ties
 * for first settle dead heat: the payout is split by the number tied.
 *
 * Pure: no database access. lowIndividualPricing.ts supplies the rounds,
 * the field, each player's Career Archive holes, and confirmed live scores.
 */

export type HoleSetup = { hole: number; par: number; yards: number };
export type IndividualRound = { round: number; holes: HoleSetup[] };
export type HistoryRow = { score: number; par: number; yards: number };
/** A confirmed score for a hole already played, or null if it's still to play. */
export type PlayedScore = (player: string, round: number, hole: number) => number | null;

export const LOW_INDIVIDUAL_SIMULATIONS = 10_000;
export const LOW_INDIVIDUAL_MODEL_VERSION = "low-individual-monte-carlo-v1";

export function lowIndividualMarketKey(seasonYear: number): string {
  return `low-individual:${seasonYear}`;
}

/**
 * The two sampling pools the match model uses for a target hole: Measure 1
 * (same par) and Measure 2 (the hole's 10-yard bucket and its neighbours).
 */
export function holePools(history: HistoryRow[], hole: HoleSetup): { one: number[]; two: number[] } {
  const target = bucket(hole.yards);
  return {
    one: history.filter((row) => row.par === hole.par).map((row) => row.score),
    two: history.filter((row) => Math.abs(bucket(row.yards) - target) <= 1).map((row) => row.score),
  };
}

export type Standing = { player: string; strokes: number; toPar: number; holesPlayed: number; holesTotal: number };

/** Strokes so far on confirmed holes, lowest first. */
export function currentStandings(players: string[], rounds: IndividualRound[], played: PlayedScore): Standing[] {
  const holesTotal = rounds.reduce((sum, round) => sum + round.holes.length, 0);
  return players
    .map((player) => {
      const standing: Standing = { player, strokes: 0, toPar: 0, holesPlayed: 0, holesTotal };
      for (const round of rounds) for (const hole of round.holes) {
        const score = played(player, round.round, hole.hole);
        if (score === null) continue;
        standing.strokes += score;
        standing.toPar += score - hole.par;
        standing.holesPlayed += 1;
      }
      return standing;
    })
    .sort((a, b) => a.toPar - b.toPar || a.player.localeCompare(b.player));
}

type PlayerPlan = { player: string; fixed: number; remaining: { one: number[]; two: number[] }[] };

/** Holes a player has no history to simulate — reported instead of guessed. */
export function missingHistory(players: string[], rounds: IndividualRound[], history: Map<string, HistoryRow[]>, played: PlayedScore): string[] {
  const missing: string[] = [];
  for (const player of players) {
    const rows = history.get(player) ?? [];
    for (const round of rounds) for (const hole of round.holes) {
      if (played(player, round.round, hole.hole) !== null) continue;
      const pools = holePools(rows, hole);
      if (!pools.one.length && !pools.two.length) missing.push(`${player}:${round.round}:${hole.hole}`);
    }
  }
  return missing;
}

/**
 * Plays every unplayed individual-ball hole `simulations` times. Each hole
 * draws one score from Measure 1 or Measure 2 (50/50, as in the match model;
 * whichever pool has history if only one does). Confirmed holes are fixed.
 * Returns dead-heat win shares — a two-way tie credits each player ½ — which
 * sum to 1 and price fairly under dead-heat settlement. Check
 * missingHistory() first.
 */
export function simulateLowIndividual({
  players,
  rounds,
  history,
  played,
  simulations = LOW_INDIVIDUAL_SIMULATIONS,
  random = Math.random,
}: {
  players: string[];
  rounds: IndividualRound[];
  history: Map<string, HistoryRow[]>;
  played: PlayedScore;
  simulations?: number;
  random?: () => number;
}): Record<string, number> {
  const plans: PlayerPlan[] = players.map((player) => {
    const rows = history.get(player) ?? [];
    const plan: PlayerPlan = { player, fixed: 0, remaining: [] };
    for (const round of rounds) for (const hole of round.holes) {
      const score = played(player, round.round, hole.hole);
      if (score !== null) plan.fixed += score;
      else plan.remaining.push(holePools(rows, hole));
    }
    return plan;
  });

  const shares = new Array<number>(plans.length).fill(0);
  const totals = new Array<number>(plans.length).fill(0);
  const pick = (pool: number[]) => pool[Math.floor(random() * pool.length)];
  for (let run = 0; run < simulations; run += 1) {
    let best = Infinity;
    for (let index = 0; index < plans.length; index += 1) {
      let total = plans[index].fixed;
      for (const { one, two } of plans[index].remaining) total += pick(!two.length || (one.length && random() < 0.5) ? one : two);
      totals[index] = total;
      if (total < best) best = total;
    }
    let tied = 0;
    for (const total of totals) if (total === best) tied += 1;
    for (let index = 0; index < plans.length; index += 1) if (totals[index] === best) shares[index] += 1 / tied;
  }
  return Object.fromEntries(plans.map((plan, index) => [plan.player, shares[index] / simulations]));
}

export function lowIndividualMarket(seasonYear: number, odds: Record<string, number | null>, displayName: (player: string) => string): Market {
  return {
    marketKey: lowIndividualMarketKey(seasonYear),
    groupLabel: "Low Individual",
    selections: Object.entries(odds)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .map(([player, price]) => ({ key: player, label: `${displayName(player)} has the lowest individual total in ${seasonYear}`, odds: price })),
  };
}

/** Fair American odds for each player's dead-heat win share. */
export function lowIndividualOdds(probabilities: Record<string, number>): Record<string, number | null> {
  return Object.fromEntries(Object.entries(probabilities).map(([player, probability]) => [player, fairAmericanOdds(probability)]));
}
