"use client";

import { useMemo, useState } from "react";
import type { CareerHoleRecord, CareerTeamHoleRecord } from "@/lib/data/careerStats";

type ArchiveRound = {
  id: string;
  kind: "Individual" | "Team";
  year: number;
  round: number;
  format: string;
  course: string;
  detail: string;
  holes: Array<{ hole: number; par: number; yards: number; score: number; putts: number | null; fairwayInRegulation: boolean | null; greenInRegulation: boolean | null; penalties: number | null }>;
};

export function CareerRoundArchive({ player, year, format, records, teamRecords }: { player: string; year: string; format: string; records: CareerHoleRecord[]; teamRecords: CareerTeamHoleRecord[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rounds = useMemo<ArchiveRound[]>(() => {
    const individual = new Map<string, CareerHoleRecord[]>();
    records.filter((record) => record.player === player && (year === "all" || record.year === Number(year)) && (format === "all" || record.format === format)).forEach((record) => {
      const id = `individual-${record.year}-${record.round}-${record.course}-${record.format}`;
      individual.set(id, [...(individual.get(id) ?? []), record]);
    });
    const team = new Map<string, CareerTeamHoleRecord[]>();
    teamRecords.filter((record) => (record.player1 === player || record.player2 === player) && (year === "all" || record.year === Number(year)) && (format === "all" || record.format === format)).forEach((record) => {
      const id = `team-${record.year}-${record.round}-${record.matchId}-${record.teamId}`;
      team.set(id, [...(team.get(id) ?? []), record]);
    });
    return [
      ...[...individual.entries()].map(([id, holes]) => ({ id, kind: "Individual" as const, year: holes[0].year, round: holes[0].round, format: holes[0].format, course: holes[0].course, detail: "Individual scorecard", holes })),
      ...[...team.entries()].map(([id, holes]) => ({ id, kind: "Team" as const, year: holes[0].year, round: holes[0].round, format: holes[0].format, course: holes[0].course, detail: `${holes[0].player1}${holes[0].player2 ? ` + ${holes[0].player2}` : ""} · ${holes[0].teamId}`, holes })),
    ].sort((a, b) => b.year - a.year || a.round - b.round || a.kind.localeCompare(b.kind));
  }, [format, player, records, teamRecords, year]);
  const selected = rounds.find((round) => round.id === selectedId) ?? rounds[0];

  if (!rounds.length) return <p className="mt-4 rounded-sm border border-gold-200 bg-white px-3 py-4 font-sans text-sm text-ink-500">No archived rounds match these filters.</p>;
  const total = selected.holes.reduce((sum, hole) => sum + hole.score, 0);
  const toPar = selected.holes.reduce((sum, hole) => sum + hole.score - hole.par, 0);

  return <div className="mt-3 grid gap-4 lg:grid-cols-[280px_1fr]">
    <div className="max-h-[520px] overflow-y-auto rounded-sm border border-gold-200 bg-white p-2">
      {rounds.map((round) => <button type="button" key={round.id} onClick={() => setSelectedId(round.id)} className={`mb-1 w-full rounded-sm px-3 py-2 text-left font-sans text-sm ${selected.id === round.id ? "bg-maroon-700 text-white" : "hover:bg-cream-100 text-ink-900"}`}><span className="block font-bold">{round.year} · Round {round.round} · {round.kind}</span><span className="block text-xs opacity-80">{round.format} · {round.course}</span></button>)}
    </div>
    <section className="rounded-sm border border-gold-200 bg-white p-3 sm:p-4">
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{selected.kind} archive</p>
      <h3 className="mt-1 font-serif text-xl font-bold text-ink-900">{selected.year} · Round {selected.round} · {selected.format}</h3>
      <p className="mt-1 font-sans text-sm text-ink-500">{selected.course} · {selected.detail}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 font-sans"><div className="rounded-sm bg-cream-100 p-2"><p className="m-0 text-2xs uppercase text-ink-500">Score</p><p className="m-0 text-lg font-black">{total}</p></div><div className="rounded-sm bg-cream-100 p-2"><p className="m-0 text-2xs uppercase text-ink-500">To par</p><p className="m-0 text-lg font-black">{toPar > 0 ? `+${toPar}` : toPar}</p></div><div className="rounded-sm bg-cream-100 p-2"><p className="m-0 text-2xs uppercase text-ink-500">Holes</p><p className="m-0 text-lg font-black">{selected.holes.length}</p></div></div>
      <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left font-sans text-xs"><thead className="border-b border-gold-200 text-ink-500"><tr><th className="px-2 py-2">Hole</th><th className="px-2 py-2">Par</th><th className="px-2 py-2">Yards</th><th className="px-2 py-2">Score</th><th className="px-2 py-2">To par</th><th className="px-2 py-2">Fairway</th><th className="px-2 py-2">Green</th><th className="px-2 py-2">Putts</th><th className="px-2 py-2">Pen.</th></tr></thead><tbody>{selected.holes.sort((a, b) => a.hole - b.hole).map((hole) => { const diff = hole.score - hole.par; return <tr key={hole.hole} className="border-b border-gold-100"><td className="px-2 py-2">{hole.hole}</td><td className="px-2 py-2">{hole.par}</td><td className="px-2 py-2">{hole.yards}</td><td className="px-2 py-2 font-bold">{hole.score}</td><td className="px-2 py-2">{diff > 0 ? `+${diff}` : diff}</td><td className="px-2 py-2">{hole.fairwayInRegulation == null ? "—" : hole.fairwayInRegulation ? "Hit" : "Miss"}</td><td className="px-2 py-2">{hole.greenInRegulation == null ? "—" : hole.greenInRegulation ? "Hit" : "Miss"}</td><td className="px-2 py-2">{hole.putts ?? "—"}</td><td className="px-2 py-2">{hole.penalties ?? "—"}</td></tr>; })}</tbody></table></div>
    </section>
  </div>;
}
