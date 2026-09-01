import { notFound } from "next/navigation";
import { YearLeaderboardContent } from "@/components/leaderboard/YearLeaderboardContent";
import { LiveLeaderboardContent } from "@/components/leaderboard/LiveLeaderboardContent";
import { pastTournaments, nextTournament, getTournament } from "@/lib/data";
import { getScorecardsForTournament } from "@/lib/data/archivedScorecards";

export function generateStaticParams() {
  return [...pastTournaments.map((t) => ({ slug: t.slug })), { slug: nextTournament.slug }];
}

export default async function LeaderboardYearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === nextTournament.slug) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 pb-8 sm:px-7 sm:pb-16">
        <LiveLeaderboardContent />
      </div>
    );
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  const scorecards = await getScorecardsForTournament(tournament);
  const tournamentWithScorecards = { ...tournament, scorecards };

  // TEMPORARY diagnostic — rendered (not console.log'd, which Vercel's
  // static-generation build doesn't reliably surface) so it can be read
  // straight off the live HTML. Remove once the Individual-tab data bug
  // is root-caused.
  const diag = {
    slug,
    scorecardCount: scorecards.length,
    scorecardPlayers: scorecards.map((s) => `${s.player}:${s.rounds.length}r`),
    individualLeaderboardMatches: tournament.individualLeaderboard.map(
      (p) => `${p.player}=${scorecards.find((s) => s.player.toLowerCase() === p.player.toLowerCase()) ? "FOUND" : "MISS"}`
    ),
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 pb-8 sm:px-7 sm:pb-16">
      <pre hidden id="diag-scorecards">{JSON.stringify(diag)}</pre>
      <YearLeaderboardContent tournament={tournamentWithScorecards} activeSlug={slug} />
      {tournament.notes && <p className="font-sans text-xs text-ink-400 mt-6 max-w-[640px]">{tournament.notes}</p>}
    </div>
  );
}
