"use client";

import { Button } from "@/components/ui/Button";
import { FantasyResults } from "./FantasyResults";
import { FantasyRoundCircles } from "./FantasyRoundCircles";
import { useAccountSession } from "@/lib/useAccountSession";
import { fantasyTeamScore, type FantasyPicks } from "@/lib/fantasy/scoring";
import type { Tournament } from "@/lib/data/types";
import type { UpcomingRoundScheduleItem } from "@/lib/data/activeSeasonOverlay";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export function FantasyRosterSummary({
  tournament,
  picks,
  locked,
  rank,
  totalPlayers,
  updatedAt,
  schedule,
  onEdit,
}: {
  tournament: Tournament;
  picks: FantasyPicks;
  locked: boolean;
  rank: number | null;
  totalPlayers: number | null;
  updatedAt: string | null;
  schedule: UpcomingRoundScheduleItem[];
  onEdit: () => void;
}) {
  const session = useAccountSession();
  const total = fantasyTeamScore(tournament, picks).total;
  const name = session?.displayName ?? "Your Team";

  return (
    <div>
      <h2 className="m-0 text-center font-serif text-lg font-bold text-ink-900">{name}</h2>

      <div className="mt-4 flex items-center justify-center gap-4">
        <div className="flex-1 text-center">
          <p className="m-0 font-score text-2xl font-bold tabular-nums text-ink-900">{total}</p>
          <p className="m-0 font-condensed text-3xs font-bold uppercase tracking-wide text-ink-400">Total Score</p>
          {updatedAt && <p className="m-0 mt-0.5 font-sans text-[10px] text-ink-400">Updated {timeAgo(updatedAt)}</p>}
        </div>
        <div className="h-10 w-px bg-ink-200" />
        <div className="flex-1 text-center">
          <p className="m-0 font-score text-2xl font-bold tabular-nums text-ink-900">{rank ? `#${rank}` : "—"}</p>
          <p className="m-0 font-condensed text-3xs font-bold uppercase tracking-wide text-ink-400">
            {totalPlayers ? `of ${totalPlayers}` : "Ranking"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <FantasyRoundCircles tournament={tournament} picks={picks} schedule={schedule} />
      </div>

      {!locked && (
        <Button className="mt-6" fullWidth variant="secondary" onClick={onEdit}>
          Edit Lineup
        </Button>
      )}

      {locked && <FantasyResults tournament={tournament} scores={fantasyTeamScore(tournament, picks)} />}
    </div>
  );
}
