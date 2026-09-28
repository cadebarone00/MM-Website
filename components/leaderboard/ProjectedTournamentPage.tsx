import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fmtPt } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { RealMatch, Tournament } from "@/lib/data/types";
import { historicalOddsSeries } from "@/lib/data/tournamentProbability";
import { TournamentOddsGraph } from "./TournamentOddsGraph";
import styles from "@/components/match/MatchTimeline.module.css";

type PointRow = { name: string; points: number };

function playerPoints(tournament: Tournament, team: "maroon" | "white"): PointRow[] {
  const roster = team === "maroon" ? tournament.roster.maroon : tournament.roster.white;
  const points = new Map(roster.map((slug) => [slug, 0]));
  for (const match of tournament.matches) {
    const players = team === "maroon" ? match.maroonPlayers : match.whitePlayers;
    const earned = team === "maroon" ? match.maroonPts : match.whitePts;
    for (const player of players) points.set(player, (points.get(player) ?? 0) + earned);
  }
  return roster.map((slug) => ({ name: getPlayerDisplayName(slug), points: points.get(slug) ?? 0 })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/** Rounds in play order (day, then Morning before Afternoon), each holding its match results. */
function roundResults(tournament: Tournament): ("maroon" | "white" | "tie" | null)[][] {
  const order = (match: RealMatch) => match.day * 2 + (match.session === "Afternoon" ? 1 : 0);
  const keys = [...new Set(tournament.matches.map(order))].sort((a, b) => a - b);
  return keys.map((key) => tournament.matches.filter((match) => order(match) === key).map((match) => match.status && match.status !== "final" ? null : match.maroonPts > match.whitePts ? "maroon" : match.maroonPts < match.whitePts ? "white" : "tie"));
}

function ProbabilityCard({ tournament }: { tournament: Tournament }) {
  const rounds = roundResults(tournament);
  const finished = tournament.matches.length > 0 && rounds.every((round) => round.every(Boolean));
  const winner = tournament.maroonPts > tournament.whitePts ? "maroon" : tournament.maroonPts < tournament.whitePts ? "white" : null;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-500">Tournament Win Probability</p>
          <h1 className="mt-1 font-serif text-xl font-bold sm:text-3xl">{tournament.editionLabel}</h1>
        </div>
        <div className="text-right"><div className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Points</div><div className="mt-1 font-sans text-2xl font-black"><span className="text-maroon-700">{fmtPt(tournament.maroonPts)}</span><span className="mx-2 text-ink-300">–</span>{fmtPt(tournament.whitePts)}</div></div>
      </div>
      <div className={styles.mobileGraph}><div className={styles.probabilityCard}>
        <TournamentOddsGraph points={historicalOddsSeries(rounds)} rounds={rounds.length} result={finished && winner ? { winner, label: `${fmtPt(tournament.maroonPts)}–${fmtPt(tournament.whitePts)}` } : undefined} note="No odds were saved this year, so each point counts finished rounds as their real results and every later match as even." emptyNote="No matches are recorded for this tournament yet." />
      </div></div>
    </>
  );
}

function TeamPoints({ title, rows, team }: { title: string; rows: PointRow[]; team: "maroon" | "white" }) {
  return (
    <section className={team === "maroon" ? "rounded-md border border-maroon-700 bg-maroon-700 p-4 text-white" : "rounded-md border border-ink-200 bg-white p-4 text-ink-900"}>
      <h2 className="font-serif text-2xl font-bold">{title}</h2>
      <p className={team === "maroon" ? "mt-1 font-sans text-sm text-white/70" : "mt-1 font-sans text-sm text-ink-500"}>Points earned by each team member</p>
      <ol className="mt-4 divide-y divide-current/15">
        {rows.map((row) => <li key={row.name} className="flex items-center justify-between py-2.5"><span className="font-sans text-base font-semibold">{row.name}</span><span className="font-sans text-xl font-black tabular-nums">{fmtPt(row.points)}</span></li>)}
      </ol>
    </section>
  );
}

function lastName(name: string): string {
  return name.trim().split(/\s+/).at(-1) ?? name;
}

function MobilePointsBoard({ maroon, white }: { maroon: PointRow[]; white: PointRow[] }) {
  return (
    <section className="lg:hidden border-y border-ink-200 bg-white px-4 py-3">
      <div className="grid grid-cols-[1fr_auto_auto_1fr] gap-x-2 border-b border-ink-200 pb-2 font-condensed text-2xs font-bold uppercase tracking-wide">
        <span className="text-maroon-700">Maroon</span><span className="text-center text-ink-400">Pts</span><span className="text-center text-ink-400">Pts</span><span className="text-right text-ink-700">White</span>
      </div>
      <div className="divide-y divide-ink-100">
        {Array.from({ length: Math.max(maroon.length, white.length) }, (_, index) => {
          const left = maroon[index]; const right = white[index];
          return <div key={index} className="grid grid-cols-[1fr_auto_auto_1fr] items-center gap-x-2 py-2 font-sans text-sm"><span className="truncate font-semibold text-maroon-700">{left ? lastName(left.name) : ""}</span><span className="w-7 text-center font-black tabular-nums text-ink-900">{left ? fmtPt(left.points) : ""}</span><span className="w-7 text-center font-black tabular-nums text-ink-900">{right ? fmtPt(right.points) : ""}</span><span className="truncate text-right font-semibold text-ink-800">{right ? lastName(right.name) : ""}</span></div>;
        })}
      </div>
    </section>
  );
}

export function ProjectedTournamentPage({ tournament }: { tournament: Tournament }) {
  const maroon = playerPoints(tournament, "maroon");
  const white = playerPoints(tournament, "white");
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-4 sm:px-7 sm:py-10">
      <Link href={`/leaderboard/${tournament.slug}`} className="inline-flex items-center gap-1 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700 hover:text-maroon-900"><ArrowLeft size={15} /> Back to Leaderboard</Link>
      <div className="mt-3 sm:mt-4"><ProbabilityCard tournament={tournament} /></div>
      <div className="mt-5 sm:mt-6"><MobilePointsBoard maroon={maroon} white={white} /><div className="hidden gap-5 lg:grid lg:grid-cols-2"><TeamPoints title="Maroon" rows={maroon} team="maroon" /><TeamPoints title="White" rows={white} team="white" /></div></div>
    </main>
  );
}
