"use client";

import { matchStatus, liveLabel, matchWinner, sideScore, teamSideColor } from "@/components/leaderboard/matchUtils";
import Link from "next/link";
import { getPlayerLastName } from "@/lib/data/players";
import type { RealMatch, Team } from "@/lib/data/types";

function lastName(player: string) {
  const name = getPlayerLastName(player);
  if (name.toLowerCase() === "wojciechowski") return "WOJO";
  return name.toUpperCase();
}

function TeamSide({ players, team, probability, score, won }: { players: string[]; team: Team; probability?: number; score: string | null; won: boolean }) {
  const isMaroon = team === "maroon";
  const onMaroon = isMaroon && won;
  const scoreLabel = score && <span className={["relative z-10 shrink-0 whitespace-nowrap px-0.5 font-condensed text-sm font-extrabold uppercase", teamSideColor(team, won)].join(" ")}>{score}</span>;

  return (
    <div className={["relative flex min-w-0 items-center self-stretch", isMaroon ? "justify-end" : "justify-start", teamSideColor(team, won)].join(" ")}>
      {isMaroon && scoreLabel}
      <div className={["flex min-w-0 flex-col", isMaroon ? "items-end text-right" : "items-start text-left"].join(" ")}>
        {players.map((player) => (
          <span key={player} className="block max-w-full truncate px-2 py-1.5 font-sans text-xs font-semibold capitalize lg:py-2.5">
            {lastName(player)}
          </span>
        ))}
      </div>
      {!isMaroon && scoreLabel}
      {players.length > 1 && <span aria-hidden className={isMaroon ? "absolute right-0 top-1/2 h-px w-1/2 bg-gold-600" : "absolute left-0 top-1/2 h-px w-1/2 bg-gold-600"} />}
      <span
        className={[
          "absolute top-1/2 flex h-4 w-8 -translate-y-1/2 items-center justify-center bg-transparent font-condensed text-[7px] font-extrabold uppercase tracking-tight",
          isMaroon ? "left-2" : "right-2",
          onMaroon ? "border border-white text-white" : "border border-maroon-700 text-maroon-700",
        ].join(" ")}
      >
        {probability == null ? "Odds" : `${Math.round(probability * 100)}%`}
      </span>
    </div>
  );
}

function MatchStat({ match, status }: { match: RealMatch; status: ReturnType<typeof matchStatus> }) {
  return (
    <div className="flex min-h-[34px] items-center justify-center border-x border-gold-500 bg-cream-100">
      {status === "live" ? (
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-label="Live" />
      ) : status === "final" ? (
        <span className="font-sans text-sm font-black text-maroon-700">F</span>
      ) : match.teeTimeCst ? (
        <span className="px-0.5 text-center font-condensed text-3xs font-extrabold uppercase leading-tight text-maroon-700">{match.teeTimeCst}</span>
      ) : (
        <span className="font-sans text-xs font-bold text-ink-400">—</span>
      )}
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
  tournamentSlug,
}: {
  match: RealMatch;
  tournamentSlug: string;
}) {
  const status = matchStatus(match);
  const scoreLabel = liveLabel(match);
  const winner = matchWinner(match);
  const maroonSideLabel = match.maroonPlayers.map(lastName).join(" & ");
  const whiteSideLabel = match.whitePlayers.map(lastName).join(" & ");

  return (
    <div className="mb-1.5 overflow-hidden border border-gold-500 last:mb-0">
      <Link
        href={`/leaderboard/${tournamentSlug}/matches/${encodeURIComponent(match.id)}`}
        aria-label={`${maroonSideLabel} vs ${whiteSideLabel}, ${scoreLabel}`}
        className="block py-0 hover:bg-cream-50 focus-visible:outline-2 focus-visible:outline-maroon-700"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-stretch">
          <TeamSide players={match.maroonPlayers} team="maroon" probability={match.maroonWinProbability} score={sideScore(match, "maroon")} won={winner === "maroon"} />
          <MatchStat match={match} status={status} />
          <TeamSide players={match.whitePlayers} team="white" probability={match.whiteWinProbability} score={sideScore(match, "white")} won={winner === "white"} />
        </div>
      </Link>
    </div>
  );
}
