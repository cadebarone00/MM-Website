import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { CareerGlance } from "@/components/stats/CareerGlance";
import { pastTournaments } from "@/lib/data";
import { getPlayerDisplayName, getPlayerAvatar, getPlayerProfile, playerProfiles } from "@/lib/data/players";
import { getPlayerNameMap } from "@/lib/portal/allPlayers";
import { getPlayerStatsByYear, playerHasAnyStats } from "@/lib/data/stats";
import { CAREER_STAT_COLUMNS } from "@/lib/data/stats/careerColumns";
import type { PlayerYearStats } from "@/lib/data/stats";
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

export default async function PlayerCareerPage({ params, inPortal = false }: { params: Promise<{ player: string }>; inPortal?: boolean }) {
  const { player } = await params;
  const playerId = getPlayerProfile(player)?.id ?? player;
  if (!playerHasAnyStats(playerId)) notFound();

  const nameBySlug = await getPlayerNameMap();
  const displayName = nameBySlug[playerId] ?? getPlayerDisplayName(playerId);
  const avatar = getPlayerAvatar(playerId);
  const team = mostRecentTeam(playerId);
  const yearStats = getPlayerStatsByYear(playerId);
  const years = yearStats.map((y) => y.year);
  const played = yearStats.map((y) => y.stats).filter((s): s is PlayerYearStats => s != null);

  const rows = CAREER_STAT_COLUMNS.map((column) => ({
    label: column.label,
    values: yearStats.map((y) => (y.stats ? column.value(y.stats) : null)),
    careerTotal: column.total?.(played) ?? null,
  }));

  const isMaroon = team === "maroon";

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

      <div className="mb-6"><CareerGlance yearStats={yearStats} /></div>
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
