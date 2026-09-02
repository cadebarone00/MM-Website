"use client";

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
  if (name.toLowerCase() === "wojciechowski") return "WOJO";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function finalLabelColor(match: RealMatch) {
  const leader = matchLeader(match);
  if (leader === "maroon") return "bg-maroon-700 text-white";
  if (leader === "white") return "bg-white text-maroon-700";
  return "bg-cream-100 text-maroon-700";
}

function TeamSide({ players, team }: { players: string[]; team: Team }) {
  const isMaroon = team === "maroon";

  return (
    <div className={["flex min-w-0 flex-col self-stretch", isMaroon ? "items-end bg-maroon-700 text-white" : "items-start bg-white text-maroon-700"].join(" ")}>
      {players.map((player, i) => (
        <span
          key={player}
          className={[
            "relative block w-full truncate px-2 py-1.5 font-sans text-xs font-semibold capitalize",
            isMaroon ? "text-right" : "text-left",
            i > 0 ? (isMaroon ? "before:absolute before:top-0 before:left-2 before:right-0 before:h-px before:bg-gold-600" : "before:absolute before:top-0 before:left-0 before:right-2 before:h-px before:bg-gold-600") : "",
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
    <div className="mb-1.5 overflow-hidden border border-gold-500 last:mb-0">
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
        className="cursor-pointer py-0 hover:bg-cream-50"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-stretch">
          <TeamSide players={match.maroonPlayers} team="maroon" />
          <div className="flex items-stretch">
            {status === "final" ? (
              <span className={["flex h-full w-full items-center justify-center px-1.5 font-condensed text-3xs font-extrabold uppercase tracking-wide", finalLabelColor(match)].join(" ")}>
                {centerLabel}
              </span>
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
