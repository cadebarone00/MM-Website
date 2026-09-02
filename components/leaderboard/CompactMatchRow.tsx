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
  return name.toUpperCase();
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
    <div className={["flex min-w-0 flex-col justify-center self-stretch", isMaroon ? "items-end bg-maroon-700 text-white" : "items-start bg-white text-maroon-700"].join(" ")}>
      {players.map((player, i) => (
        <span
          key={player}
          className={[
            "relative block w-full px-2 py-1.5 font-sans text-xs font-semibold capitalize",
            isMaroon ? "text-right" : "text-left",
          ].join(" ")}
        >
          <span className="block truncate">{lastName(player)}</span>
          {players.length === 1 && (
            <span
              className={[
                "absolute top-1/2 flex h-4 w-8 -translate-y-1/2 items-center justify-center bg-transparent font-condensed text-[7px] font-extrabold uppercase tracking-tight",
                isMaroon ? "left-1/4 -translate-x-1/2 border border-white text-white" : "right-1/4 translate-x-1/2 border border-maroon-700 text-maroon-700",
              ].join(" ")}
            >
              Odds
            </span>
          )}
          {i > 0 && (
            <>
              <span aria-hidden className={isMaroon ? "absolute right-0 top-0 h-px w-1/2 bg-gold-600" : "absolute left-0 top-0 h-px w-1/2 bg-gold-600"} />
              <span
                className={[
                  "absolute top-0 flex h-4 w-8 -translate-y-1/2 items-center justify-center bg-transparent font-condensed text-[7px] font-extrabold uppercase tracking-tight",
                  isMaroon ? "left-[calc(25%-16px)] border border-white text-white" : "right-[calc(25%-16px)] border border-maroon-700 text-maroon-700",
                ].join(" ")}
              >
                Odds
              </span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

function MatchStat({ status }: { status: ReturnType<typeof matchStatus> }) {
  return (
    <div className="flex min-h-[34px] items-center justify-center border-r border-gold-300 bg-cream-100">
      {status === "live" ? (
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-label="Live" />
      ) : status === "final" ? (
        <span className="font-sans text-sm font-black text-maroon-700">F</span>
      ) : (
        <span className="font-sans text-xs font-bold text-ink-400">—</span>
      )}
    </div>
  );
}

function MatchThru({ match, status }: { match: RealMatch; status: ReturnType<typeof matchStatus> }) {
  const thru = status === "final" ? 18 : status === "live" ? match.thru ?? "—" : "—";

  return (
    <div className="flex min-h-[34px] items-center justify-center border-l border-gold-300 bg-cream-100 font-sans text-xs font-black tabular-nums text-maroon-700">
      {thru}
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
        <div className="grid grid-cols-[30px_minmax(0,1fr)_44px_minmax(0,1fr)_30px] items-stretch">
          <MatchStat status={status} />
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
          <MatchThru match={match} status={status} />
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
