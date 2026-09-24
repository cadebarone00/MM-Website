"use client";

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
 * The Total Score / Ranking stat pair always renders (greyed placeholders
 * "E" / "T12" until you've drafted, maroon real numbers once you have) —
 * before you've drafted, a "Make Your Selections" pill floats directly on
 * top of that (still-locked) stat pair rather than replacing it. The
 * name/stats sit vertically centered in the space above the round-circle
 * strip, which is pinned to the bottom of the card (flush above the site's
 * bottom nav on mobile).
 */
export function FantasyRosterSummary({
  tournament,
  picks,
  locked,
  rankLabel,
  totalPlayers,
  updatedAt,
  schedule,
  onStart,
  onEdit,
}: {
  tournament: Tournament;
  picks: FantasyPicks | null;
  locked: boolean;
  rankLabel: string | null;
  totalPlayers: number | null;
  updatedAt: string | null;
  schedule: UpcomingRoundScheduleItem[];
  onStart: () => void;
  onEdit: () => void;
}) {
  const session = useAccountSession();
  const scores = picks ? fantasyTeamScore(tournament, picks) : null;
  const statColor = picks ? "text-maroon-700" : "text-ink-300";
  const captionColor = picks ? "text-ink-400" : "text-ink-300";

  return (
    <div className="flex h-full flex-col lg:h-auto lg:gap-8">
      <div className="flex flex-1 flex-col items-center justify-center">
        {picks && <h2 className="m-0 text-center font-serif text-xl font-bold text-ink-900">{session?.displayName ?? "Your Team"}</h2>}

        <div className="relative mt-4 flex w-full items-center justify-center gap-8">
          <div className="flex-1 text-center">
            <p className={["m-0 font-score text-7xl font-bold tabular-nums", statColor].join(" ")}>{picks ? scores!.total : "E"}</p>
            <p className={["m-0 mt-1 font-condensed text-3xs font-bold uppercase tracking-wide", captionColor].join(" ")}>Total Score</p>
            {picks && updatedAt && <p className="m-0 mt-0.5 font-sans text-[10px] text-ink-400">Updated {timeAgo(updatedAt)}</p>}
          </div>
          <div className="h-24 w-[3px] shrink-0 rounded-pill bg-gold-500" />
          <div className="flex-1 text-center">
            <p className={["m-0 font-score text-7xl font-bold tabular-nums", statColor].join(" ")}>{picks ? rankLabel ?? "—" : "T12"}</p>
            <p className={["m-0 mt-1 font-condensed text-3xs font-bold uppercase tracking-wide", captionColor].join(" ")}>
              {picks && totalPlayers ? `of ${totalPlayers}` : "Ranking"}
            </p>
          </div>

          {!picks && !locked && (
            <button
              type="button"
              onClick={onStart}
              className="absolute inset-0 m-auto flex h-fit w-fit items-center justify-center rounded-pill bg-maroon-700 px-6 py-2 font-condensed text-sm font-bold uppercase tracking-wide text-white shadow-lg transition-colors hover:bg-maroon-600"
            >
              Make Your Selections
            </button>
          )}

          {!picks && locked && (
            <div className="absolute inset-0 m-auto flex h-fit w-fit items-center justify-center rounded-pill bg-ink-200 px-6 py-2 font-condensed text-sm font-bold uppercase tracking-wide text-ink-500 shadow-lg">
              Picks Closed
            </div>
          )}
        </div>

        {picks && !locked && (
          <button
            type="button"
            onClick={onEdit}
            className="mt-4 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700 hover:underline"
          >
            Edit Lineup
          </button>
        )}
      </div>

      <div className="pb-1">
        <FantasyRoundCircles tournament={tournament} picks={picks} schedule={schedule} />
      </div>
    </div>
  );
}
