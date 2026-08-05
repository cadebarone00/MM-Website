import type { Team } from "@/lib/data";
import { nextTournament, latestCompleted } from "@/lib/data";
import { getPlayerProfile } from "@/lib/data/players";

function rosterHasSlug(roster: { maroon: string[]; white: string[] } | undefined, slug: string): Team | null {
  if (!roster) return null;
  if (roster.maroon.some((p) => getPlayerProfile(p)?.slug === slug)) return "maroon";
  if (roster.white.some((p) => getPlayerProfile(p)?.slug === slug)) return "white";
  return null;
}

/**
 * A player's team isn't fixed on their profile — it comes from whichever
 * tournament's roster they're on. Prefers the upcoming tournament's roster
 * (once set) over the last completed one, so the portal reflects the
 * current trip as soon as pairings are known.
 */
export function findPlayerTeam(playerSlug: string): Team | null {
  return rosterHasSlug(nextTournament.roster, playerSlug) ?? rosterHasSlug(latestCompleted.roster, playerSlug);
}
