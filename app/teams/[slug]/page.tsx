import { notFound } from "next/navigation";
import { YearTabs } from "@/components/YearTabs";
import { TournamentHeader } from "@/components/TournamentHeader";
import { UpcomingNotice } from "@/components/UpcomingNotice";
import { TeamsDirectory } from "@/components/teams/TeamsDirectory";
import { pastTournaments, nextTournament, getTournament } from "@/lib/data";
import { getNextTournamentOverride } from "@/lib/data/activeSeasonOverlay";

export function generateStaticParams() {
  return [...pastTournaments.map((t) => ({ slug: t.slug })), { slug: nextTournament.slug }];
}

export default async function TeamsYearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === nextTournament.slug) {
    const nextTournamentOverride = await getNextTournamentOverride();
    return (
      <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
        <YearTabs basePath="/teams" activeSlug={slug} includeLive />
        <UpcomingNotice what="A roster" nextTournamentOverride={nextTournamentOverride} />
      </div>
    );
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  return (
    <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
      <YearTabs basePath="/teams" activeSlug={slug} includeLive />
      <TournamentHeader tournament={tournament} title="Players" />
      <TeamsDirectory tournament={tournament} />
    </div>
  );
}
