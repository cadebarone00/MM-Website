import { notFound, redirect } from "next/navigation";
import { pastTournaments } from "@/lib/data";
import { getPlayerProfileBySlug, playerProfiles } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";

export function generateStaticParams() {
  return playerProfiles.map((profile) => ({
    slug: currentTeam(profile.id),
    player: profile.slug,
  }));
}

function currentTeam(player: string): Team {
  const years = [...pastTournaments].sort((a, b) => b.year - a.year);
  for (const tournament of years) {
    if (tournament.roster.maroon.some((name) => name.toLowerCase() === player.toLowerCase())) return "maroon";
    if (tournament.roster.white.some((name) => name.toLowerCase() === player.toLowerCase())) return "white";
  }
  return "maroon";
}

// The most recent tournament this player actually appears in — the scorecard
// page for that year is now the one canonical player bio.
function mostRecentTournamentSlug(player: string): string | null {
  const years = [...pastTournaments].sort((a, b) => b.year - a.year);
  for (const tournament of years) {
    if ([...tournament.roster.maroon, ...tournament.roster.white].some((name) => name.toLowerCase() === player.toLowerCase())) {
      return tournament.slug;
    }
  }
  return null;
}

/**
 * This page used to render its own player bio. That's been folded into the
 * scorecard page's Statistics + Bio sections, so this route just forwards
 * there now — kept around (rather than removed outright) so old
 * /teams/[team]/[player] links still land somewhere.
 */
export default async function TeamPlayerBioRoute({ params }: { params: Promise<{ slug: string; player: string }> }) {
  const { slug, player } = await params;
  if (slug !== "maroon" && slug !== "white") notFound();

  const profile = getPlayerProfileBySlug(player);
  if (!profile) notFound();

  const activeTeam = currentTeam(profile.id);
  if (activeTeam !== slug) notFound();

  const tournamentSlug = mostRecentTournamentSlug(profile.id);
  if (!tournamentSlug) notFound();

  redirect(`/leaderboard/${tournamentSlug}/players/${profile.slug}`);
}
