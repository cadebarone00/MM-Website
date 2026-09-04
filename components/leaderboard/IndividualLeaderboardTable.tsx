"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { TrophyBadge } from "@/components/ui/TrophyBadge";
import { WinnerBadge } from "@/components/ui/WinnerBadge";
import { defendingIndividualChampion, getPlayerScorecard } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { RoundScorecard, Tournament } from "@/lib/data/types";
import type { LiveIndividualStanding } from "./LeaderboardBoard";

const POS_W = 36;
const PLAYER_W = 96;

function lastName(player: string): string {
  return getPlayerDisplayName(player).split(" ").pop() ?? player;
}

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

/** Live standings deliberately render straight from confirmed scoring rows.
 * They do not borrow a static scorecard, so `Thru` and totals stay truthful
 * while a round is in progress. */
function LiveIndividualLeaderboardTable({ standings }: { standings: LiveIndividualStanding[] }) {
  const sorted = [...standings].sort((a, b) => a.toPar - b.toPar || b.played - a.played || a.gross - b.gross || a.player.localeCompare(b.player));

  if (sorted.length === 0) {
    return (
      <div className="rounded-md border border-ink-100 bg-cream-50 px-5 py-10 text-center">
        <p className="m-0 font-sans text-sm text-ink-500">No confirmed individual scores have posted yet.</p>
      </div>
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-7 lg:mx-0 lg:rounded-lg lg:border lg:border-gold-400 lg:shadow-lg">
      <table className="w-full min-w-max border-collapse bg-cream-50">
        <thead>
          <tr className="bg-maroon-700 lg:bg-transparent lg:border-b lg:border-gold-200">
            {[
              ["Pos", "text-center"],
              ["Player", "text-left"],
              ["Tot", "text-center"],
              ["Thru", "text-center"],
              ["Gross", "text-center"],
            ].map(([label, align]) => (
              <th key={label} className={`px-3 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-white lg:text-ink-400 ${align}`}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((standing, index) => {
            const rowBg = index === 0 ? "bg-gold-200" : "bg-cream-50";
            return (
              <tr key={standing.player} className={`border-b border-ink-100 last:border-b-0 ${rowBg}`}>
                <td className="px-3 py-2 text-center font-condensed text-xs font-bold tabular-nums text-ink-900">{index + 1}</td>
                <td className="px-3 py-2 font-sans text-2xs font-bold uppercase text-ink-900 sm:text-xs">{lastName(standing.player)}</td>
                <td className="px-3 py-2 text-center"><ScoreBadge value={standing.toPar} size="sm" /></td>
                <td className="px-3 py-2 text-center font-sans text-2xs font-semibold text-ink-500">{standing.played}</td>
                <td className="px-3 py-2 text-center font-sans text-2xs font-semibold tabular-nums text-ink-700">{standing.gross}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function IndividualLeaderboardTable({ tournament, liveStandings }: { tournament: Tournament; liveStandings?: LiveIndividualStanding[] }) {
  const router = useRouter();

  if (liveStandings) return <LiveIndividualLeaderboardTable standings={liveStandings} />;

  if (tournament.individualLeaderboard.length === 0) {
    return (
      <div className="rounded-md border border-ink-100 bg-cream-50 px-5 py-10 text-center">
        <p className="m-0 font-sans text-sm text-ink-500">No individual scores have posted yet. Check back once play begins.</p>
      </div>
    );
  }

  const sorted = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const rows = sorted.map((p, i) => ({ ...p, pos: i + 1 }));
  const priorRounds = priorRoundNumbers(tournament);
  const champion = defendingIndividualChampion(tournament);

  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-7 lg:mx-0 lg:rounded-lg lg:border lg:border-gold-400 lg:shadow-lg">
      <table className="w-full min-w-max border-collapse bg-cream-50">
        <thead>
          <tr className="bg-maroon-700 lg:bg-transparent lg:border-b lg:border-gold-200">
            <th
              style={{ position: "sticky", left: 0, width: POS_W, minWidth: POS_W }}
              className="z-10 bg-maroon-700 lg:bg-cream-50 py-2 pl-3 lg:pl-0 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-white lg:text-ink-400"
            >
              Pos
            </th>
            <th
              style={{ position: "sticky", left: POS_W, width: PLAYER_W, minWidth: PLAYER_W }}
              className="z-10 bg-maroon-700 lg:bg-cream-50 py-2 pl-2 text-left font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-white lg:text-ink-400"
            >
              Player
            </th>
            <th className="px-2 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-white lg:text-ink-400">Tot</th>
            <th className="px-2 py-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-white lg:text-ink-400">Thru</th>
            <th className="px-2 py-2 pr-4 lg:pr-3 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-white lg:text-ink-400">Tdy</th>
            {priorRounds.map((round) => (
              <th key={round} className="px-2 py-2 last:pr-4 lg:last:pr-3 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-white lg:text-ink-400">
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
            const rowBg = p.pos === 1 ? "bg-gold-200" : "bg-cream-50";
            const href = `/leaderboard/${tournament.slug}/players/${p.player.toLowerCase()}`;

            return (
              <tr
                key={p.player}
                onClick={() => router.push(href)}
                className={["cursor-pointer border-b border-ink-100 last:border-b-0", rowBg].join(" ")}
              >
                <td
                  style={{ position: "sticky", left: 0, width: POS_W, minWidth: POS_W }}
                  className={["py-2 text-center font-condensed text-xs font-bold tabular-nums text-ink-900", rowBg].join(" ")}
                >
                  {p.pos}
                </td>
                <td
                  style={{ position: "sticky", left: POS_W, width: PLAYER_W, minWidth: PLAYER_W }}
                  className={["py-2 pl-2", rowBg].join(" ")}
                >
                  <Link href={href} className="inline-flex min-w-0 items-center gap-1 truncate transition-opacity hover:opacity-80">
                    <span
                      className={[
                        "truncate font-sans text-2xs font-bold uppercase sm:text-xs",
                        isMaroon ? "text-maroon-700" : "text-ink-900",
                      ].join(" ")}
                    >
                      {lastName(p.player)}
                    </span>
                    {champion === p.player && <TrophyBadge count={1} />}
                    {tournament.individualChampion === p.player && <WinnerBadge />}
                  </Link>
                </td>
                <td className="px-2 py-2 text-center">
                  <ScoreBadge value={p.toPar} size="sm" />
                </td>
                <td className="px-2 py-2 text-center font-sans text-2xs font-semibold text-ink-500">{thruLabel(lastRound)}</td>
                <td className="px-2 py-2 text-center">
                  {lastRound ? <ScoreBadge value={lastRound.toPar} size="sm" /> : <span className="text-ink-300">—</span>}
                </td>
                {priorRounds.map((roundNum) => {
                  const round = priorForPlayer.find((r) => r.round === roundNum);
                  return (
                    <td key={roundNum} className="px-2 py-2 text-center">
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
  );
}
