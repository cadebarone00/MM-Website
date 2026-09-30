"use client";

import { useEffect, useState } from "react";
import { ExpandingPillSelector } from "@/components/ui/ExpandingPillSelector";
import { useSeasonCatalog } from "@/components/SeasonCatalogProvider";
import { pastTournaments } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";

type ConfirmedPlayer = { year: number; slug: string; team: "maroon" | "white"; name: string };

const statColumns = [
  { label: "MM Hcp", description: "Maroon Tournament handicap" },
  { label: "Sc. Avg.", description: "Maroon Tournament scoring average" },
  { label: "TPE", description: "Total points earned" },
];

/** Archived rosters and locked native assignments with mirrored stat columns. */
export function HomeTeamsPanel() {
  const { nextTournament } = useSeasonCatalog();
  const [selection, setSelection] = useState<{ configuredYear: number; year: number } | null>(null);
  const [roster, setRoster] = useState<ConfirmedPlayer[]>([]);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeStat, setActiveStat] = useState<string | null>(null);
  const [hoveredStat, setHoveredStat] = useState<string | null>(null);
  const year = selection?.configuredYear === nextTournament.year ? selection.year : nextTournament.year;
  const archived = pastTournaments.find((tournament) => tournament.year === year);
  const years = [...new Set([nextTournament.year, year, ...pastTournaments.map((tournament) => tournament.year), ...roster.map((player) => player.year)])].sort((a, b) => b - a);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const response = await fetch("/api/home-team-rosters", { cache: "no-store" });
        if (!response.ok) throw new Error("Roster unavailable");
        const data = await response.json();
        if (alive) { setRoster(data.roster); setError(false); setLoaded(true); }
      } catch { if (alive) setError(true); }
    }
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  return (
    <div>
      <div className="mb-3 flex justify-center">
        <ExpandingPillSelector
          activeLabel={String(year)}
          items={years.map((value) => ({ value, label: String(value) }))}
          activeValue={year}
          onSelect={(value) => setSelection({ configuredYear: nextTournament.year, year: value })}
          expandedMaxWidth="max-w-[min(32rem,60vw)]"
          scrollable
        />
      </div>
      <div className="flex overflow-hidden rounded-sm">
        <div className="flex-1 bg-maroon-700 py-1.5 text-center font-condensed text-2xs font-bold uppercase tracking-eyebrow text-white">Maroon</div>
        <div className="flex-1 border-y border-ink-100 bg-white py-1.5 text-center font-condensed text-2xs font-bold uppercase tracking-eyebrow text-maroon-700">White</div>
      </div>
      <p id="team-stat-description" role="status" className="min-h-10 px-2 py-2 text-center text-xs text-ink-500">
        {statColumns.find((column) => column.label === (hoveredStat ?? activeStat))?.description ?? "\u00a0"}
      </p>
      {error && <p role="status" className="my-2 text-center text-xs text-ink-500">Roster updates unavailable. Showing the last available roster.</p>}
      {!archived && !loaded ? <p role="status" className="py-4 text-center text-sm text-ink-500">{error ? "Roster unavailable." : "Loading roster..."}</p> : (
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          {(["maroon", "white"] as const).map((team) => {
            const players = archived
              ? archived.roster[team].map((slug) => ({ slug, name: getPlayerDisplayName(slug) }))
              : roster.filter((player) => player.year === year && player.team === team);
            return <div key={team} dir={team === "maroon" ? "rtl" : "ltr"} className="min-w-0 overflow-x-auto" role="region" aria-label={`${team} roster and statistics; scroll for more columns`} tabIndex={0}>
              <table className="w-full min-w-[360px] table-fixed border-separate border-spacing-0 text-start">
                <caption className="sr-only">{team} team, {year}. Statistic values are not yet populated.</caption>
                <colgroup><col className="w-[140px]" />{statColumns.map((column) => <col key={column.label} className="w-[60px]" />)}<col className="w-10" /></colgroup>
                <thead><tr>
                  <th scope="col" className={`py-2 font-sans text-xs font-semibold text-ink-500 ${team === "maroon" ? "text-right" : "text-left"}`}>Name</th>
                  {statColumns.map((column) => <th key={column.label} scope="col" className="text-center">
                    <button type="button" dir="ltr" aria-label={`${column.label}: ${column.description}`} aria-pressed={activeStat === column.label} aria-describedby="team-stat-description"
                      onMouseEnter={() => setHoveredStat(column.label)} onMouseLeave={() => setHoveredStat(null)}
                      onFocus={() => setHoveredStat(column.label)} onBlur={() => setHoveredStat(null)}
                      onClick={() => { setHoveredStat(null); setActiveStat((current) => current === column.label ? null : column.label); }}
                      onKeyDown={(event) => { if (event.key === "Escape") { setActiveStat(null); setHoveredStat(null); } }}
                      className="min-h-11 w-full rounded-sm font-sans text-[11px] font-semibold text-ink-500 hover:text-maroon-700 focus-visible:outline-2 focus-visible:outline-maroon-700">
                      {column.label}
                    </button>
                  </th>)}
                  <th scope="col"><span className="sr-only">Reserved for additional statistics</span></th>
                </tr></thead>
                <tbody>{Array.from({ length: archived && (year === 2024 || year === 2025) ? players.length : Math.max(6, players.length) }, (_, index) => {
                const player = players[index];
                return <tr key={player?.slug ?? `tbd-${index}`}>
                  <th scope="row" className={`py-4 font-sans text-sm ${team === "maroon" ? "text-right" : "text-left"} ${player ? "font-semibold text-ink-900" : "font-normal text-ink-400"}`}>
                    <span dir="ltr" className="block truncate">
                  {player?.name ?? `${team === "maroon" ? "Maroon" : "White"} Player TBD`}
                    </span>
                  </th>
                  {statColumns.map((column) => <td key={column.label}><span className="sr-only">Not yet populated</span></td>)}
                  <td />
                </tr>;
              })}</tbody>
              </table>
            </div>;
          })}
        </div>
      )}
    </div>
  );
}
