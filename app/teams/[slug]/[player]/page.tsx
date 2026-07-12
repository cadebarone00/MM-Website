import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerBioPage } from "@/components/teams/PlayerBioPage";
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

export default async function TeamPlayerBioRoute({ params }: { params: Promise<{ slug: string; player: string }> }) {
  const { slug, player } = await params;
  if (slug !== "maroon" && slug !== "white") notFound();

  const profile = getPlayerProfileBySlug(player);
  if (!profile) notFound();

  const activeTeam = currentTeam(profile.id);
  if (activeTeam !== slug) notFound();

  return (
    <div className="mx-auto max-w-[1360px] px-7 pt-8 pb-16">
      <Link
        href={`/teams/${activeTeam === "maroon" ? "2026-palm-springs" : "2026-palm-springs"}`}
        className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500 transition-colors hover:text-maroon-700"
      >
        Back to Teams
      </Link>
      <div className="mt-4">
        <PlayerBioPage profile={profile} team={activeTeam} />
      </div>
    </div>
  );
}
