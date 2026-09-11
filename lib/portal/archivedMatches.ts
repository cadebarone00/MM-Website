import { getPlayerProfile } from "../data/players/index.ts";
import type { PlayerScorecard, Tournament } from "../data/types.ts";
import { archivedMatchCard, type PortalMatchCard } from "./matchCards.ts";

/**
 * `scorecards` is passed in (rather than fetched here) so this stays a pure,
 * DB-free function — the caller fetches it once via
 * lib/data/archivedScorecards.ts's getScorecardsForTournament, same
 * Supabase-only limitation documented on findMatchesForPlayer.
 */
export function archivedMatchesForPlayer(tournament: Tournament, playerSlug: string, scorecards: PlayerScorecard[] = []): PortalMatchCard[] {
  const canonicalSlug = getPlayerProfile(playerSlug)?.slug ?? playerSlug.toLowerCase();
  const isPlayer = (name: string) => (getPlayerProfile(name)?.slug ?? name.toLowerCase()) === canonicalSlug;
  return tournament.matches
    .filter((match) => [...match.maroonPlayers, ...match.whitePlayers].some(isPlayer))
    .map((match) => archivedMatchCard(tournament, match, scorecards));
}
