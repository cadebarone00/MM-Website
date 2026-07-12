import { notFound } from "next/navigation";
import { YearLeaderboardContent } from "@/components/leaderboard/YearLeaderboardContent";
import { LiveLeaderboardContent } from "@/components/leaderboard/LiveLeaderboardContent";
import { pastTournaments, nextTournament, getTournament } from "@/lib/data";

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

  return (
    <div className="max-w-[1200px] mx-auto px-4 pb-8 sm:px-7 sm:pb-16">
      <YearLeaderboardContent tournament={tournament} activeSlug={slug} />
      {tournament.notes && <p className="font-sans text-xs text-ink-400 mt-6 max-w-[640px]">{tournament.notes}</p>}
    </div>
  );
}
