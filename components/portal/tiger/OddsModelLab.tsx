"use client";

import { useMemo, useState } from "react";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { CareerHoleRecord } from "@/lib/data/careerStats";

type Result = { simulations: number; samples: number; mean: number; over: number; under: number; fairOver: string; fairUnder: string; offeredOver: string; offeredUnder: string };
const odds = (probability: number) => probability >= 0.5 ? Math.round((-100 * probability) / (1 - probability)) : Math.round((100 * (1 - probability)) / probability);
const oddsLabel = (value: number) => value > 0 ? `+${value}` : String(value);

export function OddsModelLab({ records, databaseReady }: { records: CareerHoleRecord[]; databaseReady: boolean }) {
  const players = useMemo(() => [...new Set(records.map((row) => row.player))].sort((a, b) => getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b))), [records]);
  const [player, setPlayer] = useState(players[0] ?? "");
  const [line, setLine] = useState("2.5");
  const [format, setFormat] = useState("all");
  const [result, setResult] = useState<Result | null>(null);
  const formats = useMemo(() => [...new Set(records.filter((row) => row.player === player).map((row) => row.format))].sort(), [player, records]);

  function run() {
    const target = Number(line);
    if (!Number.isFinite(target) || target < 0) return;
    const eligible = records.filter((row) => row.player === player && row.roundHoles === 18 && (format === "all" || row.format === format));
    const rounds = new Map<string, number>();
    for (const row of eligible) { const id = `${row.year}-${row.round}-${row.course}`; rounds.set(id, (rounds.get(id) ?? 0) + (row.score - row.par === -1 ? 1 : 0)); }
    const samples = [...rounds.values()];
    if (!samples.length) return;
    const simulations = 10000;
    let overCount = 0;
    let sum = 0;
    for (let index = 0; index < simulations; index += 1) { const total = samples[Math.floor(Math.random() * samples.length)]; sum += total; if (total > target) overCount += 1; }
    const over = overCount / simulations;
    const under = 1 - over;
    const margin = 0.05;
    const offeredOver = Math.min(0.99, over * (1 + margin));
    const offeredUnder = Math.min(0.99, under * (1 + margin));
    setResult({ simulations, samples: samples.length, mean: sum / simulations, over, under, fairOver: oddsLabel(odds(over)), fairUnder: oddsLabel(odds(under)), offeredOver: oddsLabel(odds(offeredOver)), offeredUnder: oddsLabel(odds(offeredUnder)) });
  }

  if (!databaseReady || !players.length) return <p className="rounded-lg border border-gold-300 bg-cream-50 px-4 py-5 font-sans text-sm text-ink-600">Import the 18-hole Career Data & Odds Model workbook before running a preview.</p>;
  return <div><section className="rounded-lg border-2 border-maroon-700 bg-cream-50 p-5"><p className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700">Model version MM-1.0 · 10,000 simulations · 5% preview margin</p><h2 className="mt-1 font-serif text-xl font-bold text-ink-900">Player Total Birdies</h2><p className="mt-1 font-sans text-sm text-ink-600">V1 samples complete historical 18-hole birdie totals for the chosen player and format. Course-hole fit, current-event form, and live-state adjustments will be added as model inputs next.</p><div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3"><Field label="Player"><select value={player} onChange={(e) => { setPlayer(e.target.value); setFormat("all"); setResult(null); }} className="input">{players.map((item) => <option key={item} value={item}>{getPlayerDisplayName(item)}</option>)}</select></Field><Field label="Format"><select value={format} onChange={(e) => { setFormat(e.target.value); setResult(null); }} className="input"><option value="all">All formats</option>{formats.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field label="Birdie line"><input type="number" min="0" step="0.5" value={line} onChange={(e) => { setLine(e.target.value); setResult(null); }} className="input" /></Field></div><button type="button" onClick={run} className="mt-5 rounded-lg bg-maroon-700 px-5 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white">Run Birdie Simulation</button></section>{result && <section className="mt-6 rounded-lg border-2 border-stone-300 p-5"><h2 className="font-serif text-xl font-bold text-ink-900">Preview Result</h2><p className="mt-1 font-sans text-sm text-ink-600">{result.samples} historical 18-hole rounds sampled across {result.simulations.toLocaleString()} simulations.</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Expected birdies" value={result.mean.toFixed(2)} /><Metric label={`Over ${line}`} value={`${(result.over * 100).toFixed(1)}%`} /><Metric label={`Under ${line}`} value={`${(result.under * 100).toFixed(1)}%`} /><Metric label="Model" value="MM-1.0" /></div><div className="mt-4 overflow-hidden rounded-lg border border-gold-200"><table className="w-full font-sans text-sm"><thead className="bg-cream-100 text-left font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-600"><tr><th className="px-3 py-2">Selection</th><th className="px-3 py-2">Fair odds</th><th className="px-3 py-2">Preview odds</th></tr></thead><tbody><tr className="border-t border-gold-100"><td className="px-3 py-2">Over {line}</td><td className="px-3 py-2">{result.fairOver}</td><td className="px-3 py-2 font-bold text-maroon-700">{result.offeredOver}</td></tr><tr className="border-t border-gold-100"><td className="px-3 py-2">Under {line}</td><td className="px-3 py-2">{result.fairUnder}</td><td className="px-3 py-2 font-bold text-maroon-700">{result.offeredUnder}</td></tr></tbody></table></div></section>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-600"><span>{label}</span>{children}</label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-gold-200 bg-white px-3 py-3"><p className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">{label}</p><p className="mt-1 font-sans text-lg font-bold text-ink-900">{value}</p></div>; }
