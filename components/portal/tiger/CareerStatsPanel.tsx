"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { CareerRoundArchive } from "@/components/portal/tiger/CareerRoundArchive";
import { CareerBuckets } from "@/components/portal/tiger/CareerBuckets";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { CareerHoleRecord, CareerPartnership, CareerTeamHoleRecord } from "@/lib/data/careerStats";

const ALL = "all";
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="flex min-w-[116px] flex-col gap-1 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-sm border border-gold-300 bg-white px-2 font-sans text-sm font-semibold normal-case text-ink-900">{options.map((option) => <option key={option} value={option}>{option === ALL ? "All" : option}</option>)}</select></label>;
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-sm border border-gold-200 bg-white px-3 py-2"><p className="m-0 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{label}</p><p className="mt-1 font-sans text-lg font-black tabular-nums text-ink-900">{value}</p></div>;
}

export function CareerStatsPanel({ records, partnerships, teamRecords }: { records: CareerHoleRecord[]; partnerships: CareerPartnership[]; teamRecords: CareerTeamHoleRecord[] }) {
  const players = useMemo(() => [...new Set(records.map((r) => r.player))].sort((a, b) => getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b))), [records]);
  const [player, setPlayer] = useState(players[0] ?? "");
  const [year, setYear] = useState(ALL);
  const [format, setFormat] = useState(ALL);
  const [partner, setPartner] = useState(ALL);
  const [partnershipFormat, setPartnershipFormat] = useState(ALL);
  const [view, setView] = useState("overview");
  const allPlayerRows = records.filter((r) => r.player === player);
  const years = [...new Set(allPlayerRows.map((r) => String(r.year)))].sort();
  const formats = [...new Set([...allPlayerRows.map((r) => r.format), ...teamRecords.filter((r) => r.player1 === player || r.player2 === player).map((r) => r.format)])].sort();
  const rows = allPlayerRows.filter((r) => (year === ALL || r.year === Number(year)) && (format === ALL || r.format === format));
  const roundGroups = new Map<string, CareerHoleRecord[]>();
  rows.forEach((r) => { const key = `${r.year}-${r.round}-${r.course}`; roundGroups.set(key, [...(roundGroups.get(key) ?? []), r]); });
  const totals = [...roundGroups.values()].map((round) => round.reduce((sum, r) => sum + r.score, 0));
  const holes = rows.length;
  const byDiff = (diff: (value: number) => boolean) => rows.filter((r) => diff(r.score - r.par)).length;
  const partners = [...new Set(partnerships.filter((p) => p.player === player).map((p) => p.partner))].sort();
  const partnershipFormats = [...new Set(partnerships.filter((p) => p.player === player).map((p) => p.format))].sort();
  const pairings = partnerships.filter((p) => p.player === player && (year === ALL || p.year === Number(year)) && (partnershipFormat === ALL || p.format === partnershipFormat) && (partner === ALL || p.partner === partner));
  const trends = years.map((trendYear) => { const yearRows = allPlayerRows.filter((r) => String(r.year) === trendYear && (format === ALL || r.format === format)); const groups = new Map<string, CareerHoleRecord[]>(); yearRows.forEach((r) => { const key = `${r.round}-${r.course}`; groups.set(key, [...(groups.get(key) ?? []), r]); }); const scores = [...groups.values()].map((round) => round.reduce((sum, r) => sum + r.score, 0)); return { year: trendYear, rounds: scores.length, average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0 }; });
  if (!player) return <p className="rounded-md border border-gold-300 bg-cream-50 px-4 py-5 font-sans text-sm text-ink-500">No archived scorecards are available yet. Import the 2024–2026 scorecards and this page will calculate every view automatically.</p>;
  return <div>
    <div role="tablist" aria-label="Player archive" className="flex flex-wrap gap-2 border-b border-gold-200 pb-4">
      {players.map((playerId) => <button type="button" key={playerId} role="tab" aria-selected={player === playerId} onClick={() => { setPlayer(playerId); setYear(ALL); setFormat(ALL); setPartner(ALL); setPartnershipFormat(ALL); }} className={`rounded-sm px-3 py-2 font-condensed text-xs font-bold uppercase tracking-wide ${player === playerId ? "bg-maroon-700 text-white" : "bg-white text-ink-600 hover:bg-cream-100"}`}>{getPlayerDisplayName(playerId)}</button>)}
    </div>
    <div className="mt-4 flex flex-wrap gap-3">
      <Select label="Year" value={year} onChange={setYear} options={[ALL, ...years]} />
      <Select label="Format" value={format} onChange={setFormat} options={[ALL, ...formats]} />
      {view === "trends" && <Select label="Team format" value={partnershipFormat} onChange={setPartnershipFormat} options={[ALL, ...partnershipFormats]} />}
    </div>
    <div className="mt-5"><Tabs items={[{ value: "overview", label: "Overview" }, { value: "scoring", label: "Scoring" }, { value: "buckets", label: "Buckets" }, { value: "trends", label: "Trends" }, { value: "archive", label: "Round Archive" }]} value={view} onChange={setView} variant="plain" /></div>
    <div className="mt-5"><h2 className="m-0 font-serif text-xl font-bold text-ink-900">{getPlayerDisplayName(player)}</h2>
      {view === "overview" && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Years" value={year === ALL ? years.length : year} /><Metric label="Rounds" value={totals.length} /><Metric label="Avg. Round" value={totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2) : "—"} /><Metric label="Avg. Hole" value={holes ? (rows.reduce((sum, r) => sum + r.score, 0) / holes).toFixed(3) : "—"} /><Metric label="Best Round" value={totals.length ? Math.min(...totals) : "—"} /><Metric label="Worst Round" value={totals.length ? Math.max(...totals) : "—"} /><Metric label="Holes" value={holes} /><Metric label="Courses" value={new Set(rows.map((r) => r.course)).size} /></div>}
      {view === "scoring" && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"><Metric label="Eagle+" value={byDiff((d) => d <= -2)} /><Metric label="Birdies" value={`${byDiff((d) => d === -1)} (${holes ? ((byDiff((d) => d === -1) / holes) * 100).toFixed(1) : 0}%)`} /><Metric label="Pars" value={byDiff((d) => d === 0)} /><Metric label="Bogeys" value={byDiff((d) => d === 1)} /><Metric label="Double+" value={byDiff((d) => d >= 2)} /></div>}
      {view === "buckets" && <CareerBuckets records={rows} />}
      {view === "archive" && <CareerRoundArchive player={player} year={year} format={format} records={records} teamRecords={teamRecords} />}
      {view === "trends" && <div className="mt-3"><Select label="Partnered with" value={partner} onChange={setPartner} options={[ALL, ...partners]} /><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Partnerships" value={pairings.length} /><Metric label="Wins" value={pairings.filter((p) => p.result === "win").length} /><Metric label="Losses" value={pairings.filter((p) => p.result === "loss").length} /></div><div className="mt-4 overflow-x-auto rounded-sm border border-gold-200 bg-white"><table className="min-w-full text-left font-sans text-xs"><thead className="bg-cream-100 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Year</th><th className="px-3 py-2">Rounds</th><th className="px-3 py-2">Avg. Round</th></tr></thead><tbody>{trends.map((row) => <tr key={row.year} className="border-t border-gold-100"><td className="px-3 py-2">{row.year}</td><td className="px-3 py-2">{row.rounds}</td><td className="px-3 py-2">{row.rounds ? row.average.toFixed(2) : "—"}</td></tr>)}</tbody></table></div></div>}
    </div>
  </div>;
}
