import type { Market } from "./marketKeys";
import { fairAmericanOdds } from "./teamWinnerFuture";

/**
 * Hole in One future — will anyone make a hole in one during the event?
 * The Career Archive has no aces to learn from, so this uses the generic
 * amateur rate per par-3 tee shot and counts every tee shot left to play.
 *
 * Pure: no database access. holeInOnePricing.ts supplies rounds and scores.
 */

/** Ace odds per par-3 tee shot: 1 in 5,000, the rate commonly quoted for low-handicap amateurs. */
export const ACE_PROBABILITY_PER_TEE_SHOT = 1 / 5_000;

export type AceRound = { round: number; format: "Singles" | "Fourball" | "Foursome"; par3Holes: number[] };
/** Whether this player has a confirmed score on this hole. */
export type HolePlayed = (player: string, round: number, hole: number) => boolean;

export function holeInOneMarketKey(seasonYear: number): string {
  return `hole-in-one:${seasonYear}`;
}

/**
 * Par-3 tee shots still to be hit. Singles and Fourball: every player tees
 * off. Foursome (Alternate Shot): one tee shot per two-player side, so each
 * player who hasn't played the hole counts as half a tee shot.
 */
export function teeShotsRemaining(rounds: AceRound[], players: string[], played: HolePlayed): number {
  let shots = 0;
  for (const round of rounds) {
    const perPlayer = round.format === "Foursome" ? 0.5 : 1;
    for (const hole of round.par3Holes) for (const player of players) if (!played(player, round.round, hole)) shots += perPlayer;
  }
  return shots;
}

/** Chance of at least one ace in `shots` independent par-3 tee shots. */
export function holeInOneProbability(shots: number, perShot = ACE_PROBABILITY_PER_TEE_SHOT): number {
  return 1 - (1 - perShot) ** shots;
}

export function holeInOneMarket(seasonYear: number, probability: number): Market {
  const selections = [
    { key: "yes", label: `Someone makes a hole in one in ${seasonYear}`, odds: fairAmericanOdds(probability) },
    { key: "no", label: `No hole in one in ${seasonYear}`, odds: fairAmericanOdds(1 - probability) },
  ];
  return {
    marketKey: holeInOneMarketKey(seasonYear),
    groupLabel: "Hole in One",
    selections: selections.filter((selection): selection is { key: string; label: string; odds: number } => selection.odds !== null),
  };
}
