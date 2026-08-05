import { notFound } from "next/navigation";
import { MatchBreakdownView } from "@/components/wagers/MatchBreakdownView";
import { LiveMatchBreakdown } from "@/components/wagers/LiveMatchBreakdown";
import { pastTournaments, nextTournament, getTournament } from "@/lib/data";

export function generateStaticParams() {
  return pastTournaments.flatMap((t) => t.matches.map((m) => ({ slug: t.slug, matchId: m.id })));
}

export default async function MatchBreakdownPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) {
  const { slug, matchId } = await params;

  if (slug === nextTournament.slug) {
    return (
      <div className="mx-auto max-w-[900px] px-4 pb-16 pt-8 sm:px-7">
        <LiveMatchBreakdown tournamentSlug={slug} matchId={matchId} />
      </div>
    );
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) notFound();

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-16 pt-8 sm:px-7">
      <MatchBreakdownView tournamentSlug={slug} editionLabel={tournament.editionLabel} match={match} />
    </div>
  );
}
