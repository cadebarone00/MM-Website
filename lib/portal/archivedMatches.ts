import { getPlayerDisplayName, getPlayerProfile } from "../data/players/index.ts";
import type { Tournament } from "../data/types.ts";

export function archivedMatchesForPlayer(tournament: Tournament, playerSlug: string) {
  const canonicalSlug = getPlayerProfile(playerSlug)?.slug ?? playerSlug.toLowerCase();
  const isPlayer = (name: string) => (getPlayerProfile(name)?.slug ?? name.toLowerCase()) === canonicalSlug;
  return tournament.matches.filter((match) => [...match.maroonPlayers, ...match.whitePlayers].some(isPlayer)).map((match) => {
    const onMaroon = match.maroonPlayers.some(isPlayer);
    const ownSide = onMaroon ? match.maroonPlayers : match.whitePlayers;
    const opponents = onMaroon ? match.whitePlayers : match.maroonPlayers;
    return {
      id: match.id,
      label: `${["You", ...ownSide.filter((name) => !isPlayer(name)).map(getPlayerDisplayName)].join(" & ")} vs. ${opponents.map(getPlayerDisplayName).join(" & ")}`,
      details: `Day ${match.day} ? ${match.session} ? ${match.format} ? ${tournament.venue}`,
      status: "Past" as const,
    };
  });
}
