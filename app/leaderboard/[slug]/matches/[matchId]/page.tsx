import { nativeSeasonYear } from "@/lib/data/seasonCatalog";
import { matchRound } from "@/lib/data/roundIdentity";
import { notFound } from "next/navigation";
import { MatchProfile } from "@/components/match/MatchProfile";
import { LiveMatchProfile } from "@/components/match/LiveMatchProfile";
import { LiveMatchScorecard } from "@/components/match/LiveMatchScorecard";
import { historicalMatchScorecard } from "@/lib/data/historicalMatchScorecard";
import { getScorecardsForTournament } from "@/lib/data/archivedScorecards";
import { pastTournaments, getTournament } from "@/lib/data";
import { getCombinedCareerArchive } from "@/lib/data/combinedCareerArchive";
import { reconstructHistoricalMatchOdds } from "@/lib/odds/historicalMatchOdds";

export function generateStaticParams() {
  return pastTournaments.flatMap((t) => t.matches.map((m) => ({ slug: t.slug, matchId: m.id })));
}

export default async function MatchBreakdownPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) {
  const { slug, matchId } = await params;

  if (nativeSeasonYear(slug)) {
    return <LiveMatchProfile key={matchId} tournamentSlug={slug} matchId={matchId} />;
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) notFound();

  const [scorecards, archive] = await Promise.all([getScorecardsForTournament(tournament), getCombinedCareerArchive()]);
  const scorecard = historicalMatchScorecard(tournament, match, scorecards, archive.teamRecords);
  const estimate = reconstructHistoricalMatchOdds(tournament, match, archive.records, archive.teamRecords);
  return <MatchProfile round={matchRound(tournament, match) ?? undefined} tournamentSlug={slug} editionLabel={tournament.editionLabel} match={match} odds={estimate.points} estimateNote={estimate.note || undefined} scorecard={<LiveMatchScorecard match={match} scorecard={scorecard} />} />;
}
