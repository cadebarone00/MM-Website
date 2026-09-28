"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSeasonCatalog } from "@/components/SeasonCatalogProvider";
import { pastTournaments } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";

type ConfirmedPlayer = { year: number; slug: string; team: "maroon" | "white"; name: string };

/** Archived rosters and locked native assignments, with six slots per team. */
export function HomeTeamsPanel() {
  const { nextTournament } = useSeasonCatalog();
  const [selection, setSelection] = useState<{ configuredYear: number; year: number } | null>(null);
  const [roster, setRoster] = useState<ConfirmedPlayer[]>([]);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
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
        <div className="relative">
          <select aria-label="Teams year" value={year} onChange={(event) => setSelection({ configuredYear: nextTournament.year, year: Number(event.target.value) })} className="appearance-none rounded-full border border-gold-500 bg-white py-1.5 pl-4 pr-9 font-condensed text-sm font-bold text-maroon-700 focus-visible:outline-2 focus-visible:outline-maroon-700">
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <ChevronDown aria-hidden size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-maroon-700" />
        </div>
      </div>
      <div className="flex overflow-hidden rounded-sm">
        <div className="flex-1 bg-maroon-700 py-1.5 text-center font-condensed text-2xs font-bold uppercase tracking-eyebrow text-white">Maroon</div>
        <div className="flex-1 border-y border-ink-100 bg-white py-1.5 text-center font-condensed text-2xs font-bold uppercase tracking-eyebrow text-maroon-700">White</div>
      </div>
      {error && <p role="status" className="my-2 text-center text-xs text-ink-500">Roster updates unavailable. Showing the last available roster.</p>}
      {!archived && !loaded ? <p role="status" className="py-4 text-center text-sm text-ink-500">{error ? "Roster unavailable." : "Loading roster..."}</p> : (
        <div className="grid grid-cols-2">
          {(["maroon", "white"] as const).map((team) => {
            const players = archived
              ? archived.roster[team].map((slug) => ({ slug, name: getPlayerDisplayName(slug) }))
              : roster.filter((player) => player.year === year && player.team === team);
            return <div key={team} className={team === "maroon" ? "flex flex-col border-r border-ink-100 pr-3 text-right" : "flex flex-col pl-3 text-left"}>
              {Array.from({ length: Math.max(6, players.length) }, (_, index) => {
                const player = players[index];
                return <span key={player?.slug ?? `tbd-${index}`} className={`w-full truncate py-1.5 font-sans text-sm ${player ? "font-semibold text-ink-900" : "text-ink-400"}`}>
                  {player?.name ?? `${team === "maroon" ? "Maroon" : "White"} Player TBD`}
                </span>;
              })}
            </div>;
          })}
        </div>
      )}
    </div>
  );
}
