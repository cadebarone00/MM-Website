"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { getPlayerScorecard } from "@/lib/data";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { RoundScorecard, Team, Tournament } from "@/lib/data/types";

type Filter = "all" | Team;

const filters: [Filter, string][] = [
  ["all", "All Players"],
  ["maroon", "Team Maroon"],
  ["white", "Team White"],
];

const POS_W = 40;
const PLAYER_W = 168;

function thruLabel(round: RoundScorecard | undefined): string {
  if (!round) return "—";
  const played = round.holes.filter((h) => h.score > 0).length;
  return played >= round.holes.length ? "F" : String(played);
}

/** Every "prior completed round" column number that appears for any player, so the table's columns stay consistent across rows even when scorecards are incomplete. */
function priorRoundNumbers(tournament: Tournament): number[] {
  const rounds = new Set<number>();
  tournament.scorecards?.forEach((sc) => {
    const sorted = [...sc.rounds].sort((a, b) => a.round - b.round);
    sorted.slice(0, -1).forEach((r) => rounds.add(r.round));
  });
  return [...rounds].sort((a, b) => a - b);
}

export function IndividualLeaderboardTable({ tournament }: { tournament: Tournament }) {
  const [filter, setFilter] = useState<Filter>("all");

  if (tournament.individualLeaderboard.length === 0) {
    return (
      <div className="rounded-md border border-ink-100 bg-cream-50 px-5 py-10 text-center">
        <p className="m-0 font-sans text-sm text-ink-500">No individual scores have posted yet. Check back once play begins.</p>
      </div>
    );
  }

  const sorted = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const ranked = sorted.map((p, i) => ({ ...p, pos: i + 1 }));
  const rows = ranked.filter((p) => filter === "all" || p.team === filter);
  const priorRounds = priorRoundNumbers(tournament);

  return (
    <div>
      <div className="mb-3 flex gap-1.5 sm:mb-5 sm:gap-2">
        {filters.map(([v, l]) => {
          const on = filter === v;
          return (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={[
                "cursor-pointer rounded-pill border-[1.5px] px-3 py-1 font-sans text-[11px] font-semibold transition-all duration-150 sm:px-[18px] sm:py-[7px] sm:text-[13px]",
                on ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 bg-white text-ink-700",
              ].join(" ")}
            >
              {l}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gold-400 shadow-lg">
        <table className="w-full min-w-max border-collapse bg-cream-50">
          <thead>
            <tr className="border-b border-gold-200">
              <th
                style={{ position: "sticky", left: 0, width: POS_W, minWidth: POS_W }}
                className="z-10 bg-cream-50 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400"
              >
                Pos
              </th>
              <th
                style={{ position: "sticky", left: POS_W, width: PLAYER_W, minWidth: PLAYER_W }}
                className="z-10 bg-cream-50 py-2 pl-3 text-left font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400"
              >
                Player
              </th>
              <th className="px-3 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">Tot</th>
              <th className="px-3 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">Today</th>
              <th className="px-3 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">Thru</th>
              {priorRounds.map((round) => (
                <th key={round} className="px-3 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">
                  R{round}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const scorecard = getPlayerScorecard(tournament, p.player);
              const roundsSorted = scorecard ? [...scorecard.rounds].sort((a, b) => a.round - b.round) : [];
              const lastRound = roundsSorted[roundsSorted.length - 1];
              const priorForPlayer = roundsSorted.slice(0, -1);
              const isMaroon = p.team === "maroon";
              const rowBg = p.pos === 1 ? "bg-gold-100" : "bg-cream-50";

              return (
                <tr key={p.player} className={["border-b border-ink-100 last:border-b-0", rowBg].join(" ")}>
                  <td
                    style={{ position: "sticky", left: 0, width: POS_W, minWidth: POS_W }}
                    className={["py-2 text-center font-condensed text-sm font-bold tabular-nums text-ink-900", rowBg].join(" ")}
                  >
                    {p.pos}
                  </td>
                  <td
                    style={{ position: "sticky", left: POS_W, width: PLAYER_W, minWidth: PLAYER_W }}
                    className={["py-2 pl-3", rowBg].join(" ")}
                  >
                    <Link
                      href={`/leaderboard/${tournament.slug}/players/${p.player.toLowerCase()}`}
                      className="flex items-center gap-2 transition-opacity hover:opacity-80"
                    >
                      <Avatar name={getPlayerDisplayName(p.player)} src={getPlayerAvatar(p.player)} size="xs" team={p.team} />
                      <span
                        className={["truncate font-sans text-xs font-semibold sm:text-sm", isMaroon ? "text-maroon-700" : "text-ink-900"].join(" ")}
                      >
                        {getPlayerDisplayName(p.player)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ScoreBadge value={p.toPar} size="sm" chip />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {lastRound ? <ScoreBadge value={lastRound.toPar} size="sm" /> : <span className="text-ink-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center font-sans text-xs font-semibold text-ink-500">{thruLabel(lastRound)}</td>
                  {priorRounds.map((roundNum) => {
                    const round = priorForPlayer.find((r) => r.round === roundNum);
                    return (
                      <td key={roundNum} className="px-3 py-2 text-center">
                        {round ? <ScoreBadge value={round.toPar} size="sm" /> : <span className="text-ink-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 font-sans text-xs text-ink-400">
        Tap a player to open their scorecard for the current or most recent round — earlier rounds are one tap away from there too.
      </p>
    </div>
  );
}
