export const PUBLIC_WAGER_CATALOG = {
  "total-tournament-birdies": {
    slug: "total-tournament-birdies",
    name: "Total Tournament Birdies",
    description: "A player future priced from the player’s confirmed individual-ball Career Archive and every locked tournament course. Alternate Shot rounds do not create individual birdie opportunities.",
    appliesTo: "Every active player",
    publicSlot: "Players → Selected Player → Futures",
    scope: "player" as const,
    marketKind: "over_under" as const,
    statKey: "career.scoring.tournament_birdies",
    calculationRule: "Simulate each locked Singles/Fourball round on its scheduled 18-hole course 10,000 times; total the player’s birdies; feature the half-birdie line nearest 50/50 and expose reasonable alternate lines.",
    settlementRule: "Settle from the final confirmed 18-hole individual scorecards for all scheduled tournament rounds after Tiger closeout.",
  },
} as const;

export type PublicWagerSlug = keyof typeof PUBLIC_WAGER_CATALOG;
