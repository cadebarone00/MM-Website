"use client";

import { useId, useState } from "react";
import type { MatchOddsPoint } from "@/lib/live/matchProfile";

const price = (value: number | null) => value == null ? "—" : value > 0 ? `+${value}` : String(value);
/** A tie contributes half to each side: 100% Maroon is top, 100% White bottom. */
export const matchBalance = (point: MatchOddsPoint) => point.maroon_win_probability + point.tie_probability / 2;

export function MobileMatchOddsGraph({ points, live, final, estimateNote }: { points: MatchOddsPoint[]; live: boolean; final: boolean; estimateNote?: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const clip = useId();
  const latest = points.at(-1);
  const activeIndex = Math.min(selected ?? points.length - 1, points.length - 1);
  const active = points[activeIndex];
  const estimated = !!estimateNote;
  const x = (index: number) => 145 + (estimated ? points[index].state_thru / 18 : index / Math.max(1, points.length - 1)) * 815;
  const y = (balance: number) => 30 + (1 - balance) * 280;
  const center = y(0.5);
  const header = estimated ? active : latest;
  const values = header ? [header.maroon_win_probability, header.tie_probability, header.white_win_probability] : [];
  const prices = header ? [header.maroon_american_odds, header.tie_american_odds, header.white_american_odds] : [];
  return (
    <section className="rounded-md border border-ink-200 bg-cream-50 p-4 shadow-sm sm:p-6" aria-label="Match odds">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-condensed text-xs font-bold uppercase tracking-wide text-ink-500">Match win probability</p><h2 className="mt-1 font-serif text-2xl font-bold">{estimated ? "2026 estimated replay" : live ? final ? "Final odds" : "Live odds" : "Match odds"}</h2></div>
        <div className="flex gap-5">
          {["Maroon", "Tie", "White"].map((label, index) => <div key={label}><p className={`font-condensed text-xs font-bold uppercase tracking-wide ${index === 1 ? "text-gold-700" : "text-maroon-700"}`}>{label}</p><p className="font-sans text-2xl font-black tabular-nums">{header ? `${Math.round(values[index] * 100)}%` : "—"}</p><p className="font-sans text-xs text-ink-500">{header ? price(prices[index]) : "—"}</p></div>)}
        </div>
      </div>
      {latest ? <>
        <div className="mt-5 overflow-x-auto">
          <svg viewBox="0 0 1000 360" className="w-full" role="img" aria-label="Match probability balance: 100% Maroon at the top, even or tie in the middle, 100% White at the bottom">
            <defs><clipPath id={`${clip}-upper`}><rect x="145" y="30" width="815" height="140" /></clipPath><clipPath id={`${clip}-lower`}><rect x="145" y="170" width="815" height="140" /></clipPath></defs>
            {[1, 0.75, 0.5, 0.25, 0].map((value) => <g key={value}><line x1="145" x2="960" y1={y(value)} y2={y(value)} stroke={value === 0.5 ? "#a78945" : "#d9d5cd"} strokeDasharray={value === 0.5 ? undefined : "4 6"} /><text x="130" y={y(value) + 5} textAnchor="end" fontSize="17" fontWeight={value === 1 || value === 0 || value === 0.5 ? "700" : undefined} fill={value === 1 ? "#500001" : "#73695f"}>{value === 1 ? "MAROON 100%" : value === 0 ? "WHITE 100%" : value === 0.5 ? "EVEN / TIE" : ""}</text></g>)}
            {points.slice(0, -1).map((p, index) => {
              const polygon = `${x(index)},${center} ${x(index)},${y(matchBalance(p))} ${x(index + 1)},${y(matchBalance(points[index + 1]))} ${x(index + 1)},${center}`;
              return <g key={index}><polygon points={polygon} fill="#500001" opacity=".2" clipPath={`url(#${clip}-upper)`} /><polygon points={polygon} fill="#fff" clipPath={`url(#${clip}-lower)`} /></g>;
            })}
            <polyline points={points.map((p, index) => `${x(index)},${y(matchBalance(p))}`).join(" ")} fill="none" stroke="#231b18" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, index) => <circle key={index} cx={x(index)} cy={y(matchBalance(p))} r={index === activeIndex ? 7 : 3} fill={matchBalance(p) > 0.5 ? "#500001" : matchBalance(p) < 0.5 ? "#73695f" : "#a78945"}><title>{`${p.state_thru === 0 ? "Pre-round" : `Thru ${p.state_thru}`}: Maroon ${Math.round(p.maroon_win_probability * 100)}%, Tie ${Math.round(p.tie_probability * 100)}%, White ${Math.round(p.white_win_probability * 100)}%`}</title></circle>)}
            {estimated ? [0, 3, 6, 9, 12, 15, 18].map((hole) => <text key={hole} x={145 + hole / 18 * 815} y="345" textAnchor="middle" fontSize="17" fill="#73695f">{hole === 0 ? "Pre" : `H${hole}`}</text>) : <><text x="145" y="345" fontSize="17" fill="#73695f">First shown update</text><text x="960" y="345" textAnchor="end" fontSize="17" fill="#73695f">Latest update</text></>}
          </svg>
        </div>
        {points.length > 1 && <input aria-label="Explore match odds" type="range" min="0" max={points.length - 1} value={activeIndex} onChange={(event) => setSelected(Number(event.target.value))} className="mt-3 w-full accent-maroon-700" />}
        {active && <p className="mt-2 font-sans text-xs text-ink-500">{active.state_thru === 0 ? "Pre-round" : final && activeIndex === points.length - 1 ? `Final · Thru ${active.state_thru}` : `Thru ${active.state_thru}`} · Maroon {Math.round(active.maroon_win_probability * 100)}% · Tie {Math.round(active.tie_probability * 100)}% · White {Math.round(active.white_win_probability * 100)}%</p>}
        <p className="mt-2 font-sans text-xs text-ink-500">{estimateNote ?? "Saved odds in update order."} The line balances the two teams’ chances, with ties pulling it toward the middle. Use the slider to explore.</p>
      </> : <p className="py-12 text-center font-sans text-sm text-ink-500">{live ? "Odds will appear once a price is published for this match." : "No recorded odds history is available for this historical match."}</p>}
    </section>
  );
}
