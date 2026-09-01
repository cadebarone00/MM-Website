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
  console.log(
    `[DIAG] LeaderboardYearPage slug=${slug} scorecards=${scorecards.length}`,
    scorecards.map((s) => `${s.player}:${s.rounds.length}r`).join(",")
  );
  const tournamentWithScorecards = { ...tournament, scorecards };
  console.log(
    `[DIAG] individualLeaderboard matches for ${slug}:`,
    tournament.individualLeaderboard
      .map((p) => `${p.player}=${scorecards.find((s) => s.player.toLowerCase() === p.player.toLowerCase()) ? "FOUND" : "MISS"}`)
      .join(",")
  );

  return (
    <div className="max-w-[1200px] mx-auto px-4 pb-8 sm:px-7 sm:pb-16">
      <YearLeaderboardContent tournament={tournamentWithScorecards} activeSlug={slug} />
      {tournament.notes && <p className="font-sans text-xs text-ink-400 mt-6 max-w-[640px]">{tournament.notes}</p>}
    </div>
  );
}
