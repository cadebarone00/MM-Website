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
  const chartHeight = height - padding.top - padding.bottom;
  const centerY = padding.top + chartHeight / 2;
  const final = samples.at(-1) ?? 50;
  const favorite = final >= 50 ? "Maroon" : "White";
  const favoriteProbability = Math.round(favorite === "Maroon" ? final : 100 - final);

  return (
    <section className="border-y border-ink-200 bg-cream-50 p-4 text-ink-900 shadow-sm sm:rounded-md sm:border sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-500">Tournament Win Probability</p>
          <h1 className="mt-1 font-serif text-xl font-bold sm:text-3xl">{tournament.editionLabel}</h1>
        </div>
        <div className="flex gap-4 text-right">
          <div><div className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Projected points</div><div className="mt-1 font-sans text-2xl font-black"><span className="text-maroon-700">{fmtPt(tournament.maroonPts)}</span><span className="mx-2 text-ink-300">–</span>{fmtPt(tournament.whitePts)}</div></div>
          <div className="border-l border-ink-200 pl-4"><div className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{favorite} win probability</div><div className={`mt-1 font-sans text-3xl font-black ${favorite === "Maroon" ? "text-maroon-700" : "text-ink-900"}`}>{favoriteProbability}%</div></div>
        </div>
      </div>
      <div className="mt-5 aspect-video h-auto sm:h-[340px] sm:aspect-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Maroon and White win probability across the tournament">
          {[100, 75, 50, 25, 0].map((value) => {
            const y = padding.top + ((100 - value) / 100) * (height - padding.top - padding.bottom);
            const label = value === 100 ? "MAROON 100%" : value === 0 ? "WHITE 100%" : `${value}%`;
            return <g key={value}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={value === 50 ? "#91877b" : "#d9d5cd"} strokeDasharray={value === 50 ? undefined : "4 6"} /><text x="8" y={y + 4} fill={value === 100 ? "var(--color-maroon-700)" : "#6e645b"} fontSize={value === 100 || value === 0 ? "17" : "22"} fontWeight={value === 100 || value === 0 ? "700" : undefined}>{label}</text></g>;
          })}
          {samples.slice(0, -1).map((value, index) => {
            const next = samples[index + 1];
            const x1 = padding.left + (index / Math.max(1, samples.length - 1)) * (width - padding.left - padding.right);
            const x2 = padding.left + ((index + 1) / Math.max(1, samples.length - 1)) * (width - padding.left - padding.right);
            const y1 = padding.top + ((100 - value) / 100) * chartHeight;
            const y2 = padding.top + ((100 - next) / 100) * chartHeight;
            const maroonLeads = (value + next) / 2 >= 50;
            return <polygon key={`${value}-${index}`} points={`${x1},${centerY} ${x1},${y1} ${x2},${y2} ${x2},${centerY}`} fill={maroonLeads ? "var(--color-maroon-500)" : "#ffffff"} opacity={maroonLeads ? ".30" : ".78"} />;
          })}
          <polyline points={path} fill="none" stroke="#1a1513" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={Number(path.split(" ").at(-1)?.split(",")[0])} cy={Number(path.split(" ").at(-1)?.split(",")[1])} r="9" fill={favorite === "Maroon" ? "var(--color-maroon-700)" : "#1a1513"} />
          {Array.from({ length: 8 }, (_, index) => <text key={index} x={padding.left + (index / 7) * (width - padding.left - padding.right)} y={height - 8} textAnchor="middle" fill="#6e645b" fontSize="20">R{index + 1}</text>)}
          <text x={width - padding.right} y={padding.top + 18} textAnchor="end" fill="#6e645b" fontSize="20">FINAL</text>
        </svg>
      </div>
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
      <div className="mt-3 -mx-4 sm:mx-0 sm:mt-4"><ProbabilityGraph tournament={tournament} /></div>
      <div className="mt-5 sm:mt-6"><MobilePointsBoard maroon={maroon} white={white} /><div className="hidden gap-5 lg:grid lg:grid-cols-2"><TeamPoints title="Maroon" rows={maroon} team="maroon" /><TeamPoints title="White" rows={white} team="white" /></div></div>
    </main>
  );
}
