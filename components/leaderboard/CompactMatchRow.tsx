"use client";

import { ResultChevron } from "@/components/match/ResultChevron";
import { matchStatus, matchLeader, liveLabel } from "@/components/leaderboard/matchUtils";
import { MatchHoleByHole } from "@/components/leaderboard/MatchHoleByHole";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { RealMatch, Team, Tournament } from "@/lib/data/types";

function labelColor(match: RealMatch) {
  const leader = matchLeader(match);
  if (leader === "maroon") return "border-maroon-200 bg-maroon-50 text-maroon-700";
  if (leader === "white") return "border-ink-200 bg-white text-ink-900";
  return "border-ink-300 bg-ink-100 text-ink-900";
}

function lastName(player: string) {
  const name = getPlayerDisplayName(player).split(" ").pop() ?? player;
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function TeamSide({ players, team }: { players: string[]; team: Team }) {
  const isMaroon = team === "maroon";

  return (
    <div className={["flex min-w-0 flex-col", isMaroon ? "items-end" : "items-start"].join(" ")}>
      {players.map((player, i) => (
        <span
          key={player}
          className={[
            "block w-full truncate py-1 font-sans text-xs font-semibold text-ink-900",
            isMaroon ? "text-right" : "text-left",
            i > 0 ? "border-t border-ink-100" : "",
          ].join(" ")}
        >
          {lastName(player)}
        </span>
      ))}
    </div>
  );
}

/**
 * Compact, no-avatar, last-name-only match row for the mobile Match Play
 * tab. Deliberately separate from `components/match/MatchRow.tsx` (still
 * used unchanged by the year-recap page) rather than reworked in place, so
 * that page's richer avatar-based look isn't affected by this redesign.
 */
export function CompactMatchRow({
  match,
  tournament,
  tournamentSlug,
  expanded,
  onToggle,
}: {
  match: RealMatch;
  tournament: Tournament;
  tournamentSlug: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = matchStatus(match);
  const centerLabel = status === "scheduled" ? "VS" : liveLabel(match);
  const maroonSideLabel = match.maroonPlayers.map(lastName).join(" & ");
  const whiteSideLabel = match.whitePlayers.map(lastName).join(" & ");

  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${maroonSideLabel} vs ${whiteSideLabel}, ${centerLabel}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="cursor-pointer px-2 py-1 hover:bg-cream-50"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center gap-2">
          <TeamSide players={match.maroonPlayers} team="maroon" />
          <div className="flex justify-center">
            {status === "final" ? (
              <ResultChevron winner={matchLeader(match)} size="xs">
                {centerLabel}
              </ResultChevron>
            ) : (
              <span
                className={[
                  "inline-flex min-h-[22px] min-w-[40px] items-center justify-center rounded-pill border px-1.5 font-condensed text-3xs font-extrabold uppercase tracking-wide",
                  labelColor(match),
                ].join(" ")}
              >
                {centerLabel}
              </span>
            )}
          </div>
          <TeamSide players={match.whitePlayers} team="white" />
        </div>
      </div>
      {expanded && (
        <div className="pb-2">
          <MatchHoleByHole tournament={tournament} match={match} tournamentSlug={tournamentSlug} />
        </div>
      )}
    </div>
  );
}
