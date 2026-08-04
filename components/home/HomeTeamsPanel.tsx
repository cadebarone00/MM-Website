"use client";

import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { latestCompleted, fmtPt, getNextTournamentStatus } from "@/lib/data";
import { TeamMatchesBoard } from "@/components/leaderboard/TeamMatchesBoard";

/** Condensed Teams view for the mobile home toggle: score line + the same TeamMatchesBoard shown on the Teams tab of /leaderboard, just embedded in a smaller panel. */
export function HomeTeamsPanel() {
  const { tournament } = useLiveTournament();
  const hasLiveRoster = tournament.roster.maroon.length > 0 && tournament.roster.white.length > 0;
  const source = hasLiveRoster ? tournament : latestCompleted;
  const live = getNextTournamentStatus() === "live";

  return (
    <div className="rounded-lg border border-maroon-800 bg-maroon-900 p-3 text-white shadow-xl sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        {!hasLiveRoster && (
          <span className="font-condensed text-3xs font-semibold uppercase tracking-wide text-white/50">{latestCompleted.year}</span>
        )}
        <span className="ml-auto font-condensed text-2xl font-black tabular-nums text-white">
          {fmtPt(source.maroonPts)}&ndash;{fmtPt(source.whitePts)}
        </span>
      </div>
      <div className="rounded-md bg-white p-2 sm:p-3">
        <TeamMatchesBoard tournament={source} live={live} />
      </div>
    </div>
  );
}
