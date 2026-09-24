export const WAGER_SCOPES = ["player", "team", "match", "tournament"] as const;
export const WAGER_MARKET_KINDS = ["yes_no", "over_under", "winner", "head_to_head"] as const;

export type WagerScope = (typeof WAGER_SCOPES)[number];
export type WagerMarketKind = (typeof WAGER_MARKET_KINDS)[number];

export type WagerType = {
  id: string;
  slug: string;
  name: string;
  scope: WagerScope;
  marketKind: WagerMarketKind;
  statKey: string;
  calculationRule: string;
  settlementRule: string;
  isActive: boolean;
  createdAt: string;
};

export const wagerScopeLabels: Record<WagerScope, string> = {
  player: "Player",
  team: "Team",
  match: "Match",
  tournament: "Tournament",
};

export const wagerMarketKindLabels: Record<WagerMarketKind, string> = {
  yes_no: "Yes / No",
  over_under: "Over / Under",
  winner: "Winner",
  head_to_head: "Head-to-head",
};
