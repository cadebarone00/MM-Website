"use client";

import { Badge } from "@/components/ui/Badge";
import { PointsRibbon } from "./PointsRibbon";
import { LeaderboardBoard } from "./LeaderboardBoard";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export function LiveLeaderboardContent() {
  const { tournament, payload, error, loading } = useLiveTournament();

  return (
    <div>
      <PointsRibbon tournament={tournament} />

      <div className="pt-8">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Badge live>Live</Badge>
          {payload?.updatedAt && <span className="font-sans text-[11px] text-ink-400">Updated {timeAgo(payload.updatedAt)}</span>}
          {error && <span className="font-sans text-[11px] text-score-under">{error}</span>}
        </div>

        {loading && !payload ? (
          <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>
        ) : (
          <LeaderboardBoard tournament={tournament} live={true} />
        )}
      </div>
    </div>
  );
}
