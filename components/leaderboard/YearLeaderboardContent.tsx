"use client";

import { PointsRibbon } from "@/components/leaderboard/PointsRibbon";
import { LeaderboardBoard } from "@/components/leaderboard/LeaderboardBoard";
import { YearTabs } from "@/components/YearTabs";
import type { Tournament } from "@/lib/data/types";

export function YearLeaderboardContent({ tournament, activeSlug }: { tournament: Tournament; activeSlug: string }) {
  return (
    <div>
      <PointsRibbon tournament={tournament} />

      <div className="pt-4 sm:pt-8">
        <YearTabs basePath="/leaderboard" activeSlug={activeSlug} />
        <LeaderboardBoard tournament={tournament} live={false} />
      </div>
    </div>
  );
}
