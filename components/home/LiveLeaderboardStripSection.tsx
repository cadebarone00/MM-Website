"use client";

import { LeaderboardStrip } from "@/components/leaderboard/LeaderboardStrip";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { latestCompleted, getNextTournamentStatus } from "@/lib/data";

/**
 * Mobile: always visible under the hero — live 2027 data once the feed has
 * entries, otherwise falls back to the latest completed tournament (2026)
 * so the strip is never empty between tournaments.
 * Desktop: unchanged from before this plan — hidden entirely outside the
 * live tournament window.
 */
export function LiveLeaderboardStripSection() {
  const { tournament } = useLiveTournament();
  const isLive = tournament.matches.length > 0;
  const mobileSource = isLive ? tournament : latestCompleted;
  const desktopLive = getNextTournamentStatus() === "live";

  return (
    <>
      <div className="lg:hidden">
        {!isLive && (
          <div className="px-4 pt-3 sm:px-7">
            <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-ink-400">{latestCompleted.year} Final</span>
          </div>
        )}
        <LeaderboardStrip tournament={mobileSource} />
      </div>
      {desktopLive && (
        <div className="hidden lg:block">
          <LeaderboardStrip tournament={tournament} />
        </div>
      )}
    </>
  );
}
