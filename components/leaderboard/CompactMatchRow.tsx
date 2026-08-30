"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
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

function TeamSide({
  players,
  team,
  tournamentSlug,
}: {
  players: string[];
  team: Team;
  tournamentSlug: string;
}) {
  const isMaroon = team === "maroon";

  return (
    <div className={["flex min-w-0 flex-col", isMaroon ? "items-end" : "items-start"].join(" ")}>
      {players.map((player, i) => (
        <Link
          key={player}
          href={`/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}`}
          onClick={(e) => e.stopPropagation()}
          className={[
            "block w-full truncate py-1 font-sans text-xs font-semibold text-ink-900 transition-opacity hover:opacity-70",
            isMaroon ? "text-right" : "text-left",
            i > 0 ? "border-t border-ink-100" : "",
          ].join(" ")}
        >
          {getPlayerDisplayName(player).split(" ").pop()}
        </Link>
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
  const maroonSideLabel = match.maroonPlayers.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
  const whiteSideLabel = match.whitePlayers.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");

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
        className="flex cursor-pointer items-center gap-1 px-2 py-1 hover:bg-cream-50"
      >
        <div className="grid flex-1 grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center gap-2">
          <TeamSide players={match.maroonPlayers} team="maroon" tournamentSlug={tournamentSlug} />
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
          <TeamSide players={match.whitePlayers} team="white" tournamentSlug={tournamentSlug} />
        </div>
        <ChevronDown size={14} className={["shrink-0 text-ink-400 transition-transform", expanded ? "rotate-180" : ""].join(" ")} />
      </div>
      {expanded && (
        <div className="pb-2">
          <MatchHoleByHole tournament={tournament} match={match} />
        </div>
      )}
    </div>
  );
}
