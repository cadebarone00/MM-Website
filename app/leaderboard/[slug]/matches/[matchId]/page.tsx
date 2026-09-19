import { notFound } from "next/navigation";
import { MatchProfile } from "@/components/match/MatchProfile";
import { LiveMatchProfile } from "@/components/match/LiveMatchProfile";
import { MatchHoleByHole } from "@/components/leaderboard/MatchHoleByHole";
import { getScorecardsForTournament } from "@/lib/data/archivedScorecards";
import { pastTournaments, nextTournament, getTournament } from "@/lib/data";

export function generateStaticParams() {
  return pastTournaments.flatMap((t) => t.matches.map((m) => ({ slug: t.slug, matchId: m.id })));
}

export default async function MatchBreakdownPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) {
  const { slug, matchId } = await params;

  if (slug === nextTournament.slug) {
    return <LiveMatchProfile key={matchId} tournamentSlug={slug} matchId={matchId} />;
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) notFound();

  const scorecards = await getScorecardsForTournament(tournament);
  const withScorecards = { ...tournament, scorecards };
  return <MatchProfile tournamentSlug={slug} editionLabel={tournament.editionLabel} match={match} scorecard={<MatchHoleByHole tournament={withScorecards} match={match} tournamentSlug={slug} />} />;
}
