import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { pastTournaments } from "@/lib/data";
import { getPlayerDisplayName, getPlayerAvatar, playerProfiles } from "@/lib/data/players";
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

export default async function PlayerStatsPage({ params }: { params: Promise<{ player: string }> }) {
  const { player } = await params;
  if (!playerHasAnyStats(player)) notFound();

  const displayName = getPlayerDisplayName(player);
  const avatar = getPlayerAvatar(player);
  const team = mostRecentTeam(player);
  const yearStats = getPlayerStatsByYear(player);
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

  return (
    <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
      <Link
        href="/teams"
        className="font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors"
      >
        ← Back to Teams
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

      <div className="overflow-x-auto rounded-md border border-ink-100">
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
