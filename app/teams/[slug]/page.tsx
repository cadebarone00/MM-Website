import { notFound } from "next/navigation";
import { YearTabs } from "@/components/YearTabs";
import { TournamentHeader } from "@/components/TournamentHeader";
import { UpcomingNotice } from "@/components/UpcomingNotice";
import { TeamsDirectory } from "@/components/teams/TeamsDirectory";
import { ConfirmedRoster } from "@/components/teams/ConfirmedRoster";
import { pastTournaments, nextTournament, getTournament } from "@/lib/data";
import { getNextTournamentOverride, getConfirmedRoster } from "@/lib/data/activeSeasonOverlay";

// See app/schedule/[slug]/page.tsx for why this is needed: without it,
// generateStaticParams below makes Next.js prerender this page once and
// cache it, so a newly locked player wouldn't show up until a redeploy.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return [...pastTournaments.map((t) => ({ slug: t.slug })), { slug: nextTournament.slug }];
}

export default async function TeamsYearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === nextTournament.slug) {
    const [nextTournamentOverride, confirmedRoster] = await Promise.all([
      getNextTournamentOverride(),
      getConfirmedRoster(),
    ]);
    return (
      <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
        <YearTabs basePath="/teams" activeSlug={slug} includeLive />
        <UpcomingNotice what="A roster" nextTournamentOverride={nextTournamentOverride} />
        <ConfirmedRoster roster={confirmedRoster} />
      </div>
    );
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  return (
    <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
      <TournamentHeader tournament={tournament} title="Players" />
      <TeamsDirectory tournament={tournament} />
    </div>
  );
}
