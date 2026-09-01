"use client";

import { PointsRibbon } from "@/components/leaderboard/PointsRibbon";
import { LeaderboardBoard } from "@/components/leaderboard/LeaderboardBoard";
import type { Tournament } from "@/lib/data/types";

// No year switcher here — the Leaderboard only ever shows the most recent
// tournament played, or the live one while it's underway. Browsing past
// years is the History page's job (app/history).
export function YearLeaderboardContent({ tournament }: { tournament: Tournament }) {
  return (
    <div>
      <PointsRibbon tournament={tournament} />

      <div className="pt-2 sm:pt-4">
        <LeaderboardBoard key={tournament.slug} tournament={tournament} live={false} />
      </div>
    </div>
  );
}
