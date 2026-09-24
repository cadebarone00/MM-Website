import type { WagerMarketKind, WagerScope } from "@/lib/wagers/wagerTypes";

type PublicWagerDefinition = {
  slug: string;
  name: string;
  description: string;
  appliesTo: string;
  publicSlot: string;
  scope: WagerScope;
  marketKind: WagerMarketKind;
  statKey: string;
  calculationRule: string;
  settlementRule: string;
  modelStatus: "ready" | "in_design";
};

const playerFutureSlot = "Players → Selected Player → Futures";

/** Every public-facing type is deliberately defined in code. `in_design`
 * items are visible to Tiger for discussion but cannot be submitted until
 * their model and readiness validation have been implemented. */
export const PUBLIC_WAGER_CATALOG: Record<string, PublicWagerDefinition> = {
  "total-tournament-birdies": {
    slug: "total-tournament-birdies",
    name: "Total Tournament Birdies",
    description: "A player future priced from confirmed individual-ball Career Archive history and every locked tournament course. Alternate Shot does not create individual birdie opportunities.",
    appliesTo: "Every active player",
    publicSlot: playerFutureSlot,
    scope: "player",
    marketKind: "over_under",
    statKey: "career.scoring.tournament_birdies",
    calculationRule: "Simulate each locked Singles/Fourball round on its scheduled 18-hole course 10,000 times; total the player’s birdies; feature the half-birdie line nearest 50/50 and expose reasonable alternate lines.",
    settlementRule: "Settle from final confirmed 18-hole individual scorecards for all scheduled tournament rounds after Tiger closeout.",
    modelStatus: "ready",
  },
  "round-score-over-under": {
    slug: "round-score-over-under",
    name: "Round Score Over / Under",
    description: "A player’s gross score for one scheduled round, on that round’s selected course.",
    appliesTo: "Every player assigned to an individual-ball round",
    publicSlot: playerFutureSlot,
    scope: "player",
    marketKind: "over_under",
    statKey: "career.scoring.round_score",
    calculationRule: "To be defined: simulate 18 individual-ball hole scores for the selected round and price a whole-stroke total with an explicit push rule.",
    settlementRule: "To be defined: settle from the player’s final confirmed 18-hole gross score for that round.",
    modelStatus: "in_design",
  },
  "tournament-score-to-par": {
    slug: "tournament-score-to-par",
    name: "Tournament Score to Par Over / Under",
    description: "A player’s cumulative score relative to par across eligible individual-ball tournament rounds—for example, Over / Under +12.5.",
    appliesTo: "Every active player",
    publicSlot: playerFutureSlot,
    scope: "player",
    marketKind: "over_under",
    statKey: "career.scoring.tournament_score_to_par",
    calculationRule: "To be defined: simulate each scheduled Singles/Fourball round, sum gross score minus course par, then price half-stroke totals across the 10,000 tournament simulations.",
    settlementRule: "To be defined: settle from final confirmed eligible individual-ball scorecards; Foursome is excluded from individual score-to-par.",
    modelStatus: "in_design",
  },
  "tournament-fairway-percentage": {
    slug: "tournament-fairway-percentage",
    name: "Tournament Fairway Percentage Over / Under",
    description: "A player’s fairways-hit percentage over the tournament’s eligible individual-ball holes.",
    appliesTo: "Every active player with fairway tracking",
    publicSlot: playerFutureSlot,
    scope: "player",
    marketKind: "over_under",
    statKey: "career.accuracy.tournament_fairway_percentage",
    calculationRule: "To be defined: simulate fairway hit/miss outcomes on eligible driving holes using Career Archive FIR data and scheduled course setup; percentage denominator excludes holes without a fairway opportunity.",
    settlementRule: "To be defined: settle from confirmed FIR entries divided by confirmed eligible fairway opportunities.",
    modelStatus: "in_design",
  },
  "tournament-green-percentage": {
    slug: "tournament-green-percentage",
    name: "Tournament Green Percentage Over / Under",
    description: "A player’s greens-in-regulation percentage over eligible individual-ball tournament holes.",
    appliesTo: "Every active player with green tracking",
    publicSlot: playerFutureSlot,
    scope: "player",
    marketKind: "over_under",
    statKey: "career.accuracy.tournament_green_percentage",
    calculationRule: "To be defined: simulate GIR hit/miss outcomes from Career Archive GIR data and scheduled course setup, then price the final percentage distribution.",
    settlementRule: "To be defined: settle from confirmed GIR entries divided by confirmed eligible individual-ball holes.",
    modelStatus: "in_design",
  },
  "tournament-points-earned": {
    slug: "tournament-points-earned",
    name: "Points Earned in Tournament Over / Under",
    description: "A player’s total match-play points earned across the tournament, shown against the maximum they can earn from their locked schedule.",
    appliesTo: "Every active player",
    publicSlot: playerFutureSlot,
    scope: "player",
    marketKind: "over_under",
    statKey: "live.points.player_tournament_total",
    calculationRule: "To be defined: simulate every scheduled match using the canonical match model, apply the tournament’s player-point allocation rule, and sum each player’s simulated points out of their scheduled maximum.",
    settlementRule: "To be defined: settle from official closed-out match results and the documented player-point allocation rule.",
    modelStatus: "in_design",
  },
};

export type PublicWagerSlug = keyof typeof PUBLIC_WAGER_CATALOG;
