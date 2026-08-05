"use client";

import { Badge } from "@/components/ui/Badge";
import { PointsRibbon } from "./PointsRibbon";
import { LeaderboardBoard } from "./LeaderboardBoard";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus, latestCompleted } from "@/lib/data";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

/**
 * Live 2027 data once the feed has entries; otherwise falls back to the
 * latest completed tournament (2026) so this page previews the real
 * leaderboard styling with real data instead of sitting empty — same
 * live-else-fallback pattern the home screen's strip and quick cards
 * already use. Outside the live window with no feed data, we always show
 * the 2026 preview rather than an empty 2027 shell; during the live window
 * we show the real (possibly still-empty) 2027 tournament so "no scores
 * posted yet" reads honestly if the feed hasn't caught up yet.
 */
export function LiveLeaderboardContent() {
  const { tournament, payload, error, loading } = useLiveTournament();
  const isLive = getNextTournamentStatus() === "live";
  const hasLiveData = tournament.individualLeaderboard.length > 0;
  const showFallback = !isLive && !hasLiveData;
  const source = showFallback ? latestCompleted : tournament;

  return (
    <div>
      <PointsRibbon tournament={source} />

      <div className="pt-4">
        {isLive && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Badge live>Live</Badge>
            {payload?.updatedAt && <span className="font-sans text-[11px] text-ink-400">Updated {timeAgo(payload.updatedAt)}</span>}
            {error && <span className="font-sans text-[11px] text-score-under">{error}</span>}
          </div>
        )}

        {isLive && loading && !payload ? (
          <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>
        ) : (
          <LeaderboardBoard tournament={source} live={isLive} />
        )}
      </div>
    </div>
  );
}
