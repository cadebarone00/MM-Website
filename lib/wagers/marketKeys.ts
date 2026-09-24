import type { RealMatch, Tournament, IndividualStanding } from "@/lib/data/types";
import { matchWinnerOdds, matchPropMarkets, tournamentWinnerLadder, teamWinnerOdds } from "./mockOdds";
import type { PropMarket } from "./types";
import { getPlayerDisplayName, playerProfiles } from "@/lib/data/players";

export interface MarketSelection {
  key: string;
  label: string;
  odds: number;
}

export interface Market {
  marketKey: string;
  groupLabel: string;
  day?: number;
  selections: MarketSelection[];
}

function sideLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

export function matchWinnerMarketKey(tournamentSlug: string, matchId: string): string {
  return `match-winner:${tournamentSlug}:${matchId}`;
}

export function matchWinnerMarket(tournamentSlug: string, match: RealMatch): Market {
  const odds = matchWinnerOdds(match);
  const maroonLabel = sideLabel(match.maroonPlayers);
  const whiteLabel = sideLabel(match.whitePlayers);
  return {
    marketKey: matchWinnerMarketKey(tournamentSlug, match.id),
    groupLabel: `${maroonLabel} vs ${whiteLabel} — Match Winner`,
    day: match.day,
    selections: [
      { key: "maroon", label: `${maroonLabel} wins the match`, odds: odds.maroon },
      { key: "white", label: `${whiteLabel} wins the match`, odds: odds.white },
    ],
  };
}

export function propMarketKey(tournamentSlug: string, propId: string): string {
  return `prop:${tournamentSlug}:${propId}`;
}

export function propMarket(tournamentSlug: string, day: number, prop: PropMarket): Market {
  const name = getPlayerDisplayName(prop.player).split(" ").pop();
  return {
    marketKey: propMarketKey(tournamentSlug, prop.id),
    groupLabel: `${name} — ${prop.statLabel}, line ${prop.line}`,
    day,
    selections: [
      { key: "over", label: `${name} over ${prop.line} ${prop.statLabel.toLowerCase()}`, odds: prop.overOdds },
      { key: "under", label: `${name} under ${prop.line} ${prop.statLabel.toLowerCase()}`, odds: prop.underOdds },
    ],
  };
}

export function futurePlayerMarketKey(tournamentSlug: string): string {
  return `future-player:${tournamentSlug}`;
}

export function futurePlayerMarket(tournamentSlug: string, standings: IndividualStanding[], fallbackPlayers: string[] = playerProfiles.map((player) => player.id)): Market {
  // Before a live leaderboard exists, use the posted field (or the current
  // player directory) to make the market visible with deterministic mock odds.
  const field = fallbackPlayers.length > 0 ? fallbackPlayers : playerProfiles.map((player) => player.id);
  const contenders = standings.length > 0 ? standings : field.map((player) => ({ player, team: "maroon" as const, toPar: 0 }));
  const ladder = tournamentWinnerLadder(contenders);
  return {
    marketKey: futurePlayerMarketKey(tournamentSlug),
    groupLabel: "Tournament Winner",
    selections: ladder.map((entry) => ({
      key: entry.player,
      label: `${getPlayerDisplayName(entry.player)} wins the tournament`,
      odds: entry.odds,
    })),
  };
}

export function futureTeamMarketKey(tournamentSlug: string): string {
  return `future-team:${tournamentSlug}`;
}

export function futureTeamMarket(tournament: Tournament): Market {
  const odds = teamWinnerOdds(tournament);
  return {
    marketKey: futureTeamMarketKey(tournament.slug),
    groupLabel: "Team Winner",
    selections: [
      { key: "maroon", label: "Maroon wins the tournament", odds: odds.maroon },
      { key: "white", label: "White wins the tournament", odds: odds.white },
    ],
  };
}

export interface PlayerFutureDefinition {
  id: string;
  title: string;
  detail: string;
  yesDescription: string;
  noDescription: string;
  yesOdds: number;
  noOdds: number;
}

/** Add new player futures here; the shared card will render each one identically. */
export const PLAYER_FUTURES: PlayerFutureDefinition[] = [
  {
    id: "total-birdies",
    title: "Total Birdies",
    detail: "Over 8.5",
    yesDescription: "records over 8.5 birdies",
    noDescription: "records 8.5 or fewer birdies",
    yesOdds: -110,
    noOdds: -110,
  },
];

/** Temporary player-futures market; live lines will replace this seeded placeholder. */
export function playerFutureMarket(tournamentSlug: string, player: string, future: PlayerFutureDefinition): Market {
  const displayName = getPlayerDisplayName(player);
  return {
    marketKey: `player-future:${future.id}:${tournamentSlug}:${player.toLowerCase()}`,
    groupLabel: `${displayName} — ${future.title}`,
    selections: [
      { key: "yes", label: `${displayName} ${future.yesDescription}`, odds: future.yesOdds },
      { key: "no", label: `${displayName} ${future.noDescription}`, odds: future.noOdds },
    ],
  };
}

/** Every currently-defined market for a tournament — used by the Tiger settlement admin page to list what can be resolved. */
export function listAllMarkets(tournament: Tournament): Market[] {
  const field = [...tournament.roster.maroon, ...tournament.roster.white];
  const playerFutures = (field.length > 0 ? field : playerProfiles.map((player) => player.id)).flatMap((player) => PLAYER_FUTURES.map((future) => playerFutureMarket(tournament.slug, player, future)));
  const matchMarkets = tournament.matches.flatMap((match) => [
    matchWinnerMarket(tournament.slug, match),
    ...matchPropMarkets(match).map((prop) => propMarket(tournament.slug, match.day, prop)),
  ]);
  return [
    ...matchMarkets,
    futurePlayerMarket(tournament.slug, tournament.individualLeaderboard, field),
    futureTeamMarket(tournament),
    ...playerFutures,
  ];
}
