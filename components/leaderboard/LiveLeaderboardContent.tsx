"use client";

import { Badge } from "@/components/ui/Badge";
import { LeaderboardTable } from "./LeaderboardTable";
import { MatchPlayShowcase, PointsRibbon } from "./MatchPlayShowcase";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export function LiveLeaderboardContent() {
  const { tournament, payload, error, loading } = useLiveTournament();
  const isEmpty = tournament.individualLeaderboard.length === 0;

  return (
    <div>
      <PointsRibbon tournament={tournament} live={true} />

      <div className="pt-8">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Badge live>Live</Badge>
          {payload?.updatedAt && <span className="font-sans text-[11px] text-ink-400">Updated {timeAgo(payload.updatedAt)}</span>}
          {error && <span className="font-sans text-[11px] text-score-under">{error}</span>}
        </div>

        {loading && !payload ? (
          <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>
        ) : (
          <>
            <MatchPlayShowcase liveTournament={tournament} defaultOption="live" />

            <section>
              <div className="mb-5 border-b-2 border-ink-900 pb-4">
                <div className="font-condensed text-[11px] font-bold uppercase tracking-eyebrow text-gold-700">Individual Standings</div>
                <h2 className="m-0 font-sans text-3xl font-black text-ink-900">2027 Individual Leaderboard</h2>
              </div>
              {isEmpty ? (
                <div className="px-5 py-10 bg-cream-50 border border-ink-100 rounded-md text-center">
                  <p className="font-sans text-sm text-ink-500 m-0">No individual scores have posted yet. Check back once play begins.</p>
                </div>
              ) : (
                <LeaderboardTable tournament={tournament} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
