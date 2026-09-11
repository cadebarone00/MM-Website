import { getPlayerProfile } from "../data/players/index.ts";
import type { Tournament } from "../data/types.ts";
import { archivedMatchCard, type PortalMatchCard } from "./matchCards.ts";

export function archivedMatchesForPlayer(tournament: Tournament, playerSlug: string): PortalMatchCard[] {
  const canonicalSlug = getPlayerProfile(playerSlug)?.slug ?? playerSlug.toLowerCase();
  const isPlayer = (name: string) => (getPlayerProfile(name)?.slug ?? name.toLowerCase()) === canonicalSlug;
  return tournament.matches
    .filter((match) => [...match.maroonPlayers, ...match.whitePlayers].some(isPlayer))
    .map((match) => archivedMatchCard(tournament, match));
}
