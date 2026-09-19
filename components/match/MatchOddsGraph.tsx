"use client";

import { useState } from "react";
import type { MatchOddsPoint } from "@/lib/live/matchProfile";

const series = [
  { key: "maroon_win_probability", label: "Maroon", color: "#500001" },
  { key: "tie_probability", label: "Tie", color: "#a78945" },
  { key: "white_win_probability", label: "White", color: "#73695f" },
] as const;
const price = (value: number | null) => value == null ? "—" : value > 0 ? `+${value}` : String(value);

export function MatchOddsGraph({ points, live, final }: { points: MatchOddsPoint[]; live: boolean; final: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const latest = points.at(-1);
  const active = selected == null ? latest : points[selected] ?? latest;
  const x = (index: number) => 60 + index / Math.max(1, points.length - 1) * 900;
  const y = (probability: number) => 25 + (1 - probability) * 250;
  return (
    <section className="rounded-md border border-ink-200 bg-cream-50 p-4 shadow-sm sm:p-6" aria-label="Match odds">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-condensed text-xs font-bold uppercase tracking-wide text-ink-500">Match win probability</p><h2 className="mt-1 font-serif text-2xl font-bold">{live ? final ? "Final odds" : "Live odds" : "Match odds"}</h2></div>
        <div className="flex flex-wrap gap-5">
          {series.map(({ key, label, color }, index) => <div key={key}><p className="font-condensed text-xs font-bold uppercase tracking-wide" style={{ color }}>{label}</p><p className="font-sans text-2xl font-black tabular-nums">{latest ? `${Math.round(latest[key] * 100)}%` : "—"}</p><p className="font-sans text-xs text-ink-500">{latest ? price([latest.maroon_american_odds, latest.tie_american_odds, latest.white_american_odds][index]) : "—"}</p></div>)}
        </div>
      </div>
      {latest ? <>
        <svg viewBox="0 0 1000 325" className="mt-5 w-full" role="img" aria-label="Saved Maroon, White and tie probabilities in update order">
          {[0, 0.25, 0.5, 0.75, 1].map((value) => <g key={value}><line x1="60" x2="960" y1={y(value)} y2={y(value)} stroke="#d9d5cd" strokeDasharray={value === 0.5 ? undefined : "4 6"} /><text x="8" y={y(value) + 5} fontSize="17" fill="#73695f">{value * 100}%</text></g>)}
          {series.map(({ key, color }) => <g key={key}><polyline points={points.map((point, index) => `${x(index)},${y(point[key])}`).join(" ")} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" />{points.map((point, index) => <circle key={index} cx={x(index)} cy={y(point[key])} r={index === (selected ?? points.length - 1) ? 6 : 3} fill={color}><title>Update {index + 1}, thru {point.state_thru}: {Math.round(point[key] * 100)}%</title></circle>)}</g>)}
          <text x="60" y="310" fontSize="17" fill="#73695f">First saved update</text><text x="960" y="310" textAnchor="end" fontSize="17" fill="#73695f">Latest update</text>
        </svg>
        {points.length > 1 && <input aria-label="Explore saved match odds" type="range" min="0" max={points.length - 1} value={selected ?? points.length - 1} onChange={(event) => setSelected(Number(event.target.value))} className="mt-3 w-full accent-maroon-700" />}
        {active && <p className="mt-2 font-sans text-xs text-ink-500">Thru {active.state_thru} · Maroon {Math.round(active.maroon_win_probability * 100)}% · Tie {Math.round(active.tie_probability * 100)}% · White {Math.round(active.white_win_probability * 100)}%</p>}
        <p className="mt-2 font-sans text-xs text-ink-500">Saved odds in update order. {points.length === 1 ? "The graph will grow as more odds are recorded." : "Use the slider to explore previous updates."}</p>
      </> : <p className="py-12 text-center font-sans text-sm text-ink-500">{live ? "Odds will appear once a price is published for this match." : "No recorded odds history is available for this historical match."}</p>}
    </section>
  );
}
