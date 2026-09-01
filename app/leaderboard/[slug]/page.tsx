import { notFound, redirect } from "next/navigation";
import { YearLeaderboardContent } from "@/components/leaderboard/YearLeaderboardContent";
import { LiveLeaderboardContent } from "@/components/leaderboard/LiveLeaderboardContent";
import { pastTournaments, nextTournament, latestCompleted, getTournament, isPastLeaderboardSwitchover } from "@/lib/data";
import { getScorecardsForTournament } from "@/lib/data/archivedScorecards";

export function generateStaticParams() {
  return [...pastTournaments.map((t) => ({ slug: t.slug })), { slug: nextTournament.slug }];
}

export default async function LeaderboardYearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === nextTournament.slug) {
    // Before the season switchover, `nextTournament` isn't live yet and has
    // nothing to show — send visitors to the latest completed tournament
    // instead of a dead-end empty page.
    if (!isPastLeaderboardSwitchover()) {
      redirect(`/leaderboard/${latestCompleted.slug}`);
    }
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

  return (
    <div className="max-w-[1200px] mx-auto px-4 pb-8 sm:px-7 sm:pb-16">
      <YearLeaderboardContent tournament={tournamentWithScorecards} activeSlug={slug} />
      {tournament.notes && <p className="font-sans text-xs text-ink-400 mt-6 max-w-[640px]">{tournament.notes}</p>}
    </div>
  );
}
