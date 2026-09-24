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

/**
 * The one "My Roster" card, in every state — no separate Welcome screen.
 * Without a saved team, the score/rank stat row shows greyed-out
 * placeholders (E / T12) and the centered name is replaced by a maroon
 * "Make Your Selections" pill that starts the draft; the round-circle strip
 * still shows (all blank, since there's no team to score yet). Once a team
 * is saved, the pill becomes your name and the placeholders become real
 * numbers - same layout throughout.
 */
export function FantasyRosterSummary({
  tournament,
  picks,
  locked,
  rank,
  totalPlayers,
  updatedAt,
  schedule,
  onStart,
  onEdit,
}: {
  tournament: Tournament;
  picks: FantasyPicks | null;
  locked: boolean;
  rank: number | null;
  totalPlayers: number | null;
  updatedAt: string | null;
  schedule: UpcomingRoundScheduleItem[];
  onStart: () => void;
  onEdit: () => void;
}) {
  const session = useAccountSession();
  const scores = picks ? fantasyTeamScore(tournament, picks) : null;

  return (
    <div>
      {picks ? (
        <h2 className="m-0 text-center font-serif text-lg font-bold text-ink-900">{session?.displayName ?? "Your Team"}</h2>
      ) : locked ? (
        <p className="m-0 text-center font-condensed text-sm font-bold uppercase tracking-wide text-ink-400">Picks Closed</p>
      ) : (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onStart}
            className="rounded-pill bg-maroon-700 px-6 py-2 font-condensed text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-maroon-600"
          >
            Make Your Selections
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-4">
        <div className="flex-1 text-center">
          <p className={["m-0 font-score text-2xl font-bold tabular-nums", picks ? "text-ink-900" : "text-ink-300"].join(" ")}>
            {picks ? scores!.total : "E"}
          </p>
          <p className={["m-0 font-condensed text-3xs font-bold uppercase tracking-wide", picks ? "text-ink-400" : "text-ink-300"].join(" ")}>
            Total Score
          </p>
          {picks && updatedAt && <p className="m-0 mt-0.5 font-sans text-[10px] text-ink-400">Updated {timeAgo(updatedAt)}</p>}
        </div>
        <div className="h-10 w-px bg-ink-200" />
        <div className="flex-1 text-center">
          <p className={["m-0 font-score text-2xl font-bold tabular-nums", picks ? "text-ink-900" : "text-ink-300"].join(" ")}>
            {picks ? (rank ? `#${rank}` : "—") : "T12"}
          </p>
          <p className={["m-0 font-condensed text-3xs font-bold uppercase tracking-wide", picks ? "text-ink-400" : "text-ink-300"].join(" ")}>
            {picks && totalPlayers ? `of ${totalPlayers}` : "Ranking"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <FantasyRoundCircles tournament={tournament} picks={picks} schedule={schedule} />
      </div>

      {picks && !locked && (
        <Button className="mt-6" fullWidth variant="secondary" onClick={onEdit}>
          Edit Lineup
        </Button>
      )}

      {picks && locked && <FantasyResults tournament={tournament} scores={scores!} />}
    </div>
  );
}
