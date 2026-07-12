"use client";

import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { MatchPlayShowcase, PointsRibbon } from "@/components/leaderboard/MatchPlayShowcase";
import { YearTabs } from "@/components/YearTabs";
import type { Tournament } from "@/lib/data/types";

export function YearLeaderboardContent({ tournament, activeSlug }: { tournament: Tournament; activeSlug: string }) {
  return (
    <div>
      <PointsRibbon tournament={tournament} live={false} />

      <div className="pt-4 sm:pt-8">
        <YearTabs basePath="/leaderboard" activeSlug={activeSlug} />
        <MatchPlayShowcase liveTournament={tournament} defaultOption={String(tournament.year) as "2026" | "2025" | "2024"} />

        <section>
          <div className="mb-3 border-b-2 border-ink-900 pb-2 sm:mb-5 sm:pb-4">
            <div className="font-condensed text-[9px] font-bold uppercase tracking-eyebrow text-gold-700 sm:text-[11px]">Individual Standings</div>
            <h2 className="m-0 font-sans text-xl font-black text-ink-900 sm:text-3xl">{tournament.year} Individual Leaderboard</h2>
          </div>
          <LeaderboardTable tournament={tournament} />
        </section>
      </div>
    </div>
  );
}
