import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fmtPt } from "@/lib/data";
import type { Tournament } from "@/lib/data/types";

type PointRow = { name: string; points: number };

function playerPoints(tournament: Tournament, team: "maroon" | "white"): PointRow[] {
  const roster = team === "maroon" ? tournament.roster.maroon : tournament.roster.white;
  const points = new Map(roster.map((name) => [name, 0]));
  for (const match of tournament.matches) {
    const players = team === "maroon" ? match.maroonPlayers : match.whitePlayers;
    const earned = team === "maroon" ? match.maroonPts : match.whitePts;
    for (const player of players) points.set(player, (points.get(player) ?? 0) + earned);
  }
  return roster.map((name) => ({ name, points: points.get(name) ?? 0 })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/**
 * A completed historical tournament has no remaining uncertainty. Earlier
 * points on the line use the score margin and matches remaining to show how
 * the team's eventual chance tightened; the final sample is always 100% for
 * the confirmed winner. Live seasons will replace these historical samples
 * with odds snapshots as official match odds are published.
 */
function probabilitySeries(tournament: Tournament): number[] {
  let maroon = 0;
  let white = 0;
  const sessions = [...new Map(tournament.matches.map((match) => [`${match.day}:${match.session}`, match])).keys()];
  const samples: number[] = [];
  sessions.forEach((session, index) => {
    tournament.matches.filter((match) => `${match.day}:${match.session}` === session).forEach((match) => { maroon += match.maroonPts; white += match.whitePts; });
    const remaining = sessions.length - index - 1;
    samples.push(remaining === 0 ? (maroon > white ? 100 : maroon < white ? 0 : 50) : Math.max(1, Math.min(99, 50 + ((maroon - white) / Math.max(1, Math.sqrt(remaining) * 0.85)) * 15)));
  });
  return samples;
}

function ProbabilityGraph({ tournament }: { tournament: Tournament }) {
  const samples = probabilitySeries(tournament);
  const width = 1000;
  const height = 340;
  const padding = { left: 50, right: 20, top: 25, bottom: 40 };
  const point = (value: number, index: number) => {
    const x = padding.left + (index / Math.max(1, samples.length - 1)) * (width - padding.left - padding.right);
    const y = padding.top + ((100 - value) / 100) * (height - padding.top - padding.bottom);
    return `${x},${y}`;
  };
  const path = samples.map(point).join(" ");
  const final = samples.at(-1) ?? 50;

  return (
    <section className="rounded-md border border-gold-300 bg-maroon-900 p-4 text-white sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-gold-300">Tournament Win Probability</p>
          <h1 className="mt-1 font-serif text-3xl font-bold sm:text-4xl">{tournament.editionLabel}</h1>
        </div>
        <div className="rounded-sm border border-white/20 px-3 py-2 text-right">
          <div className="font-condensed text-2xs font-bold uppercase tracking-wide text-gold-300">{final === 50 ? "Tied" : final > 50 ? "Maroon wins" : "White wins"}</div>
          <div className="font-sans text-2xl font-black">{final}%</div>
        </div>
      </div>
      <div className="mt-5 h-[260px] sm:h-[340px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Maroon win probability across the tournament">
          {[0, 25, 50, 75, 100].map((value) => {
            const y = padding.top + ((100 - value) / 100) * (height - padding.top - padding.bottom);
            return <g key={value}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,.18)" /><text x="8" y={y + 4} fill="rgba(255,255,255,.72)" fontSize="22">{value}%</text></g>;
          })}
          <polyline points={path} fill="none" stroke="var(--color-gold-400)" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={Number(path.split(" ").at(-1)?.split(",")[0])} cy={Number(path.split(" ").at(-1)?.split(",")[1])} r="9" fill="var(--color-gold-300)" />
          <text x={padding.left} y={height - 8} fill="rgba(255,255,255,.72)" fontSize="22">Opening</text>
          <text x={width - padding.right} y={height - 8} textAnchor="end" fill="rgba(255,255,255,.72)" fontSize="22">Final</text>
        </svg>
      </div>
      <p className="mt-1 font-sans text-xs text-white/65">Maroon win probability · final result confirmed</p>
    </section>
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

export function ProjectedTournamentPage({ tournament }: { tournament: Tournament }) {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-7 sm:px-7 sm:py-10">
      <Link href={`/leaderboard/${tournament.slug}`} className="inline-flex items-center gap-1 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700 hover:text-maroon-900"><ArrowLeft size={15} /> Back to Leaderboard</Link>
      <div className="mt-4"><ProbabilityGraph tournament={tournament} /></div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2"><TeamPoints title="Maroon" rows={playerPoints(tournament, "maroon")} team="maroon" /><TeamPoints title="White" rows={playerPoints(tournament, "white")} team="white" /></div>
    </main>
  );
}
