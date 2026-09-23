"use client";

import { useId, useState } from "react";
import type { MatchOddsPoint } from "@/lib/live/matchProfile";
import styles from "./MatchTimeline.module.css";

const price = (value: number | null) => value == null ? "—" : value > 0 ? `+${value}` : String(value);
/** A tie contributes half to each side: 100% Maroon is top, 100% White bottom. */
export const matchBalance = (point: MatchOddsPoint) => point.maroon_win_probability + point.tie_probability / 2;

export function MatchOddsGraph({ points, live, final, estimateNote, result }: { points: MatchOddsPoint[]; live: boolean; final: boolean; estimateNote?: string; result?: { winner: "maroon" | "white"; thru: number; label: string } }) {
  const [selected, setSelected] = useState<number | null>(null);
  const clip = useId();
  // Keep the latest published price at each completed-hole boundary, including corrections.
  const byHole = new Map<number, MatchOddsPoint>();
  points.forEach(point => {
    if (Number.isInteger(point.state_thru) && point.state_thru >= 0 && point.state_thru <= 18) byHole.set(point.state_thru, point);
  });
  const history = [...byHole.values()].sort((a, b) => a.state_thru - b.state_thru);
  const finish = final && result && result.thru > 0 && result.thru < 18 ? result : null;
  const latest = history.at(-1);
  const activeIndex = Math.min(selected ?? history.length - 1, history.length - 1);
  const active = history[activeIndex];
  const x = (point: MatchOddsPoint) => point.state_thru * 100;
  const y = (point: MatchOddsPoint) => (1 - matchBalance(point)) * 180;
  const center = 90;
  const line = history.map(point => `${x(point)},${y(point)}`).join(" ");
  const area = latest ? `${x(history[0])},${center} ${line} ${x(latest)},${center}` : "";
  const header = active;
  const values = header ? [header.maroon_win_probability, header.tie_probability, header.white_win_probability] : [];
  const prices = header ? [header.maroon_american_odds, header.tie_american_odds, header.white_american_odds] : [];
  return (
    <section className={styles.timeline} aria-label="Match odds">
      <div className={`${styles.oddsHeader} mb-5 flex flex-wrap items-start justify-between gap-4`}>
        <div><p className="font-condensed text-xs font-bold uppercase tracking-wide text-ink-500">Match win probability</p><h2 className="mt-1 font-serif text-xl font-bold">{live ? final ? "Final odds" : "Live odds" : "Match odds"}</h2></div>
        <div className="flex gap-5">
          {["Maroon", "Tie", "White"].map((label, index) => <div key={label}><p className={`font-condensed text-xs font-bold uppercase tracking-wide ${index === 1 ? "text-gold-700" : "text-maroon-700"}`}>{label}</p><p className="font-sans text-xl font-black tabular-nums">{header ? `${Math.round(values[index] * 100)}%` : "—"}</p><p className="font-sans text-xs text-ink-500">{header ? price(prices[index]) : "—"}</p></div>)}
        </div>
      </div>
      {latest ? <>
        <div className={styles.timelineGrid}>
          <div className={`${styles.labels} font-condensed text-maroon-700`}>
            {["100%", "50%", "0%", "50%", "100%"].map((label, index) => <span key={index} className={styles.axisPercent} style={{ top: `${index * 25}%` }}>{label}</span>)}
            <span className={styles.maroonLabel}>Maroon</span>
            <span className={styles.whiteLabel}>White</span>
          </div>
          <svg viewBox="0 0 1800 180" preserveAspectRatio="none" className={styles.plot} role="img" aria-label="Match probability aligned to scorecard holes: Maroon at the top, even or tie in the middle, White at the bottom">
            <defs><clipPath id={`${clip}-upper`}><rect width="1800" height="90" /></clipPath><clipPath id={`${clip}-lower`}><rect y="90" width="1800" height="90" /></clipPath></defs>
            <rect width="1800" height="180" fill="#eee5d5" />
            <polygon points={area} fill="#500001" fillOpacity="0.9" clipPath={`url(#${clip}-upper)`} />
            <polygon points={area} fill="#fff" clipPath={`url(#${clip}-lower)`} />
            {[0, 45, 90, 135, 180].map(value => <line key={value} x1="0" x2="1800" y1={value} y2={value} stroke="#a78945" strokeOpacity={value === center ? 0.8 : 0.3} vectorEffect="non-scaling-stroke" />)}
            <polyline points={line} fill="none" stroke="#231b18" strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            {history.map(point => <line key={point.state_thru} x1={x(point)} x2={x(point)} y1={Math.max(0, y(point) - 3)} y2={Math.min(180, y(point) + 3)} stroke="#231b18" strokeWidth={point === active ? 2 : 1} vectorEffect="non-scaling-stroke"><title>{`Thru ${point.state_thru}: Maroon ${Math.round(point.maroon_win_probability * 100)}%, Tie ${Math.round(point.tie_probability * 100)}%, White ${Math.round(point.white_win_probability * 100)}%`}</title></line>)}
          </svg>
          {finish && <div className={styles.resultArea}><div role="note" aria-label={`${finish.winner === "maroon" ? "Maroon" : "White"} wins ${finish.label} after hole ${finish.thru}`} className={`${styles.resultBlock} ${finish.winner === "maroon" ? styles.maroonResult : styles.whiteResult}`} style={{ left: `${finish.thru / 18 * 100}%`, top: finish.winner === "maroon" ? 0 : "50%" }}>{finish.label}</div></div>}
          {history.length > 1 && <input aria-label="Explore match odds" type="range" min="0" max={history.length - 1} value={activeIndex} onChange={(event) => setSelected(Number(event.target.value))} className={`${styles.explore} accent-maroon-700`} />}
        </div>
        {active && <p className="mt-2 font-sans text-xs text-ink-500">{active.state_thru === 0 ? "Before play" : final && activeIndex === history.length - 1 ? `Final · Thru ${active.state_thru}` : `Thru ${active.state_thru}`} · Maroon {Math.round(active.maroon_win_probability * 100)}% · Tie {Math.round(active.tie_probability * 100)}% · White {Math.round(active.white_win_probability * 100)}%</p>}
        <p className="mt-2 font-sans text-xs text-ink-500">{estimateNote ?? "Saved odds by completed hole."} The line balances the two teams’ chances, with ties pulling it toward the middle.</p>
      </> : <p className="py-12 text-center font-sans text-sm text-ink-500">{live ? "Odds will appear once a price is published for this match." : "No recorded odds history is available for this historical match."}</p>}
    </section>
  );
}

