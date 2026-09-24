import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { pastTournaments } from "@/lib/data";
import { getPlayerDisplayName, getPlayerAvatar, getPlayerProfile, playerProfiles } from "@/lib/data/players";
import { getPlayerStatsByYear, playerHasAnyStats } from "@/lib/data/stats";
import type { Team } from "@/lib/data/types";

export function generateStaticParams() {
  return playerProfiles.map((profile) => ({ player: profile.id.toLowerCase() }));
}

function mostRecentTeam(player: string): Team {
  const years = [...pastTournaments].sort((a, b) => b.year - a.year);
  for (const t of years) {
    if (t.roster.maroon.some((p) => p.toLowerCase() === player.toLowerCase())) return "maroon";
    if (t.roster.white.some((p) => p.toLowerCase() === player.toLowerCase())) return "white";
  }
  return "maroon";
}

function fmtPct(v: number) {
  return `${v}%`;
}

function fmtNum(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtMoney(v: number) {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Row {
  label: string;
  values: (string | null)[];
  careerTotal?: string;
}

export default async function PlayerCareerPage({ params, inPortal = false }: { params: Promise<{ player: string }>; inPortal?: boolean }) {
  const { player } = await params;
  const playerId = getPlayerProfile(player)?.id ?? player;
  if (!playerHasAnyStats(playerId)) notFound();

  const displayName = getPlayerDisplayName(playerId);
  const avatar = getPlayerAvatar(playerId);
  const team = mostRecentTeam(playerId);
  const yearStats = getPlayerStatsByYear(playerId);
  const years = yearStats.map((y) => y.year);

  const sumIfAny = (vals: (number | undefined)[]) => {
    const present = vals.filter((v): v is number => v != null);
    return present.length > 0 ? present.reduce((a, b) => a + b, 0) : undefined;
  };

  const rows: Row[] = [
    {
      label: "Scoring Average",
      values: yearStats.map((y) => (y.stats?.scoringAverage != null ? fmtNum(y.stats.scoringAverage) : null)),
    },
    {
      label: "Team Points Won",
      values: yearStats.map((y) => (y.stats?.teamPointsWon != null ? fmtNum(y.stats.teamPointsWon) : null)),
      careerTotal: (() => {
        const t = sumIfAny(yearStats.map((y) => y.stats?.teamPointsWon));
        return t != null ? fmtNum(t) : undefined;
      })(),
    },
    {
      label: "Total Earned",
      values: yearStats.map((y) => (y.stats?.totalEarned != null ? fmtMoney(y.stats.totalEarned) : null)),
      careerTotal: (() => {
        const t = sumIfAny(yearStats.map((y) => y.stats?.totalEarned));
        return t != null ? fmtMoney(t) : undefined;
      })(),
    },
    {
      label: "Total Skins",
      values: yearStats.map((y) => (y.stats?.totalSkins != null ? String(y.stats.totalSkins) : null)),
      careerTotal: (() => {
        const t = sumIfAny(yearStats.map((y) => y.stats?.totalSkins));
        return t != null ? String(t) : undefined;
      })(),
    },
    {
      label: "Putting Average",
      values: yearStats.map((y) => (y.stats?.puttingAverage != null ? fmtNum(y.stats.puttingAverage) : null)),
    },
    {
      label: "Avg. Putts / Hole",
      values: yearStats.map((y) => (y.stats?.avgPuttsPerHole != null ? fmtNum(y.stats.avgPuttsPerHole) : null)),
    },
    {
      label: "Par 3 Avg.",
      values: yearStats.map((y) => (y.stats?.par3Avg != null ? fmtNum(y.stats.par3Avg) : null)),
    },
    {
      label: "Par 4 Avg.",
      values: yearStats.map((y) => (y.stats?.par4Avg != null ? fmtNum(y.stats.par4Avg) : null)),
    },
    {
      label: "Par 5 Avg.",
      values: yearStats.map((y) => (y.stats?.par5Avg != null ? fmtNum(y.stats.par5Avg) : null)),
    },
    {
      label: "GIR %",
      values: yearStats.map((y) => (y.stats?.girPct != null ? fmtPct(y.stats.girPct) : null)),
    },
    {
      label: "FIR %",
      values: yearStats.map((y) => (y.stats?.firPct != null ? fmtPct(y.stats.firPct) : null)),
    },
    {
      label: "Total 1-Putts",
      values: yearStats.map((y) =>
        y.stats?.oneJacks?.total != null ? `${y.stats.oneJacks.total}${y.stats.oneJacks.pct != null ? ` (${fmtPct(y.stats.oneJacks.pct)})` : ""}` : null
      ),
      careerTotal: (() => {
        const t = sumIfAny(yearStats.map((y) => y.stats?.oneJacks?.total));
        return t != null ? String(t) : undefined;
      })(),
    },
    {
      label: "Total 3+ Putts",
      values: yearStats.map((y) =>
        y.stats?.threePlusPutts?.total != null
          ? `${y.stats.threePlusPutts.total}${y.stats.threePlusPutts.pct != null ? ` (${fmtPct(y.stats.threePlusPutts.pct)})` : ""}`
          : y.stats?.threePlusPutts?.pct != null
            ? fmtPct(y.stats.threePlusPutts.pct)
            : null
      ),
      careerTotal: (() => {
        const t = sumIfAny(yearStats.map((y) => y.stats?.threePlusPutts?.total));
        return t != null ? String(t) : undefined;
      })(),
    },
    {
      label: "Up & Down %",
      values: yearStats.map((y) =>
        y.stats?.upAndDown?.pct != null
          ? `${fmtPct(y.stats.upAndDown.pct)}${y.stats.upAndDown.total != null ? ` (${y.stats.upAndDown.total})` : ""}`
          : null
      ),
    },
    {
      label: "Total Birdie-or-Better",
      values: yearStats.map((y) => (y.stats?.birdieOrBetter != null ? String(y.stats.birdieOrBetter) : null)),
      careerTotal: (() => {
        const t = sumIfAny(yearStats.map((y) => y.stats?.birdieOrBetter));
        return t != null ? String(t) : undefined;
      })(),
    },
    {
      label: "Total Double-or-Worse",
      values: yearStats.map((y) => (y.stats?.doubleOrWorse != null ? String(y.stats.doubleOrWorse) : null)),
      careerTotal: (() => {
        const t = sumIfAny(yearStats.map((y) => y.stats?.doubleOrWorse));
        return t != null ? String(t) : undefined;
      })(),
    },
    {
      label: "Bounce Back %",
      values: yearStats.map((y) =>
        y.stats?.bounceBack?.pct != null
          ? `${fmtPct(y.stats.bounceBack.pct)}${y.stats.bounceBack.total != null ? ` (${y.stats.bounceBack.total})` : ""}`
          : null
      ),
    },
    {
      label: "Fall Off %",
      values: yearStats.map((y) =>
        y.stats?.fallOff?.pct != null ? `${fmtPct(y.stats.fallOff.pct)}${y.stats.fallOff.total != null ? ` (${y.stats.fallOff.total})` : ""}` : null
      ),
    },
    {
      label: "Strokes Gained: Total",
      values: yearStats.map((y) => (y.stats?.strokesGained?.total != null ? fmtNum(y.stats.strokesGained.total) : null)),
    },
    {
      label: "Strokes Gained: Off Tee",
      values: yearStats.map((y) => (y.stats?.strokesGained?.offTee != null ? fmtNum(y.stats.strokesGained.offTee) : null)),
    },
    {
      label: "Strokes Gained: Approach",
      values: yearStats.map((y) => (y.stats?.strokesGained?.approach != null ? fmtNum(y.stats.strokesGained.approach) : null)),
    },
    {
      label: "Strokes Gained: Around Green",
      values: yearStats.map((y) => (y.stats?.strokesGained?.aroundGreen != null ? fmtNum(y.stats.strokesGained.aroundGreen) : null)),
    },
    {
      label: "Strokes Gained: Putting",
      values: yearStats.map((y) => (y.stats?.strokesGained?.putting != null ? fmtNum(y.stats.strokesGained.putting) : null)),
    },
  ];

  const isMaroon = team === "maroon";
  const latest = yearStats.at(-1)?.stats;
  const careerPoints = sumIfAny(yearStats.map((year) => year.stats?.teamPointsWon));
  const chartValues = [
    Math.max(0, Math.min(100, (95 - (latest?.scoringAverage ?? 95)) * 5)),
    latest?.firPct ?? 0,
    latest?.girPct ?? 0,
    latest?.upAndDown?.pct ?? 0,
    Math.max(0, Math.min(100, 50 + (latest?.strokesGained?.putting ?? 0) * 12)),
  ];
  const chartPoints = chartValues.map((value, index) => {
    const angle = (-Math.PI / 2) + (index * Math.PI * 2) / chartValues.length;
    const radius = 62 * (value / 100);
    return `${100 + Math.cos(angle) * radius},${100 + Math.sin(angle) * radius}`;
  }).join(" ");

  return (
    <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
      <Link
        href={inPortal ? "/portal" : "/teams"}
        className={`${inPortal ? "hidden lg:inline-block " : ""}font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors`}
      >
        ← Back to {inPortal ? "Portal" : "Teams"}
      </Link>

      <div className="flex items-center gap-4 mt-4 mb-6">
        <Avatar name={displayName} src={avatar} size="lg" team={team} />
        <div>
          <h1 className="font-sans text-[32px] font-extrabold text-ink-900 m-0">{displayName}</h1>
          <span className={["font-condensed text-xs font-semibold tracking-wide uppercase", isMaroon ? "text-maroon-600" : "text-ink-500"].join(" ")}>
            {isMaroon ? "Team Maroon" : "Team White"} · Career Stats
          </span>
        </div>
      </div>

      <section className="mb-6 grid gap-4 lg:grid-cols-[1.25fr_0.9fr]">
        <div className="rounded-2xl bg-maroon-800 p-5 text-white shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div><p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-gold-200">Career profile</p><h2 className="mt-1 font-serif text-2xl font-bold">Performance at a glance</h2></div>
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/85">{years.length} seasons</span>
          </div>
          <div className="mt-2 flex items-center justify-center">
            <svg viewBox="0 0 200 200" className="h-56 w-56 overflow-visible" aria-label="Five-category performance graphic">
              {[62, 42, 22].map((radius) => <polygon key={radius} points={[0, 1, 2, 3, 4].map((index) => { const angle = (-Math.PI / 2) + (index * Math.PI * 2) / 5; return `${100 + Math.cos(angle) * radius},${100 + Math.sin(angle) * radius}`; }).join(" ")} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1" />)}
              {[0, 1, 2, 3, 4].map((index) => { const angle = (-Math.PI / 2) + (index * Math.PI * 2) / 5; return <line key={index} x1="100" y1="100" x2={100 + Math.cos(angle) * 62} y2={100 + Math.sin(angle) * 62} stroke="rgba(255,255,255,.25)" strokeWidth="1" />; })}
              <polygon points={chartPoints} fill="rgba(213,171,82,.45)" stroke="rgb(246,210,120)" strokeWidth="2" />
              {[[100, 25, "Score"], [171, 77, "Fairways"], [145, 169, "Greens"], [55, 169, "Up & Down"], [29, 77, "Putting"]].map(([x, y, label]) => <text key={label as string} x={x as number} y={y as number} textAnchor="middle" className="fill-white text-[9px] font-semibold">{label}</text>)}
            </svg>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Scoring avg.", latest?.scoringAverage != null ? fmtNum(latest.scoringAverage) : "—", "Latest season"],
            ["Career points", careerPoints != null ? fmtNum(careerPoints) : "—", "All tournaments"],
            ["Fairways", latest?.firPct != null ? fmtPct(latest.firPct) : "—", "Latest season"],
            ["Greens", latest?.girPct != null ? fmtPct(latest.girPct) : "—", "Latest season"],
          ].map(([label, value, note]) => <div key={label} className="flex min-h-36 flex-col justify-between rounded-xl border border-stone-300 bg-white p-4 shadow-sm"><p className="font-condensed text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">{label}</p><p className="font-serif text-3xl font-bold text-ink-900">{value}</p><p className="font-sans text-xs text-ink-500">{note}</p></div>)}
        </div>
      </section>
      <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-cream-100 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">Stat</th>
              {years.map((y) => (
                <th key={y} className="px-4 py-3 text-right">
                  {y}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Career Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-ink-100 font-sans text-sm text-ink-700">
                <td className="px-4 py-2 font-semibold text-ink-900">{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={years[i]} className="px-4 py-2 text-right tabular-nums">
                    {v ?? <span className="text-ink-400">Not recorded for this year</span>}
                  </td>
                ))}
                <td className="px-4 py-2 text-right tabular-nums font-semibold">{row.careerTotal ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
