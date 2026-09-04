import type { Market } from "@/lib/wagers/marketKeys";

export type LiveOddsSnapshot = {
  maroon_win_probability: number;
  tie_probability: number;
  white_win_probability: number;
  maroon_american_odds: number | null;
  tie_american_odds: number | null;
  white_american_odds: number | null;
};

export function liveMatchMarketKey(matchBoxId: string): string {
  return `live-match:${matchBoxId}`;
}

export function liveMatchMarket(match: { id: string; maroon_players: string[]; white_players: string[] }, odds: LiveOddsSnapshot): Market {
  const maroon = match.maroon_players.join(" & ");
  const white = match.white_players.join(" & ");
  return {
    marketKey: liveMatchMarketKey(match.id),
    groupLabel: `${maroon} vs ${white} — Match Winner`,
    selections: [
      { key: "maroon", label: `${maroon} wins the match`, odds: odds.maroon_american_odds ?? 0 },
      { key: "tie", label: "Match ends tied", odds: odds.tie_american_odds ?? 0 },
      { key: "white", label: `${white} wins the match`, odds: odds.white_american_odds ?? 0 },
    ].filter((selection) => selection.odds !== 0),
  };
}
