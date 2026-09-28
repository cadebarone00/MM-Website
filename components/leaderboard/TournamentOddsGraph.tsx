"use client";

import { useId, useState, type CSSProperties } from "react";
import type { TournamentOddsPoint } from "@/lib/data/tournamentProbability";
import styles from "@/components/match/MatchTimeline.module.css";

/** A tie contributes half to each side: 100% Maroon is top, 100% White bottom. */
const balance = (point: TournamentOddsPoint) => point.maroon + point.tie / 2;

/**
 * The match page's win-probability graph (MatchOddsGraph), drawn across the
 * tournament's rounds instead of a match's 18 holes.
 */
export function TournamentOddsGraph({ points, rounds, result, note, emptyNote }: { points: TournamentOddsPoint[]; rounds: number; result?: { winner: "maroon" | "white"; label: string }; note: string; emptyNote: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const clip = useId();
  const span = Math.max(1, rounds);
  const width = span * 100;
  const latest = points.at(-1);
  const active = points[Math.min(selected ?? points.length - 1, points.length - 1)];
  const x = (point: TournamentOddsPoint) => point.x * 100;
  const y = (point: TournamentOddsPoint) => (1 - balance(point)) * 180;
  const center = 90;
  const line = points.map(point => `${x(point)},${y(point)}`).join(" ");
  const area = latest ? `${x(points[0])},${center} ${line} ${x(latest)},${center}` : "";
  const values = active ? [active.maroon, active.tie, active.white] : [];
  const pick = (value: number) => {
    const nearest = points.reduce((best, point, index) => Math.abs(point.x - value) < Math.abs(points[best].x - value) ? index : best, 0);
    setSelected(nearest);
  };
  return (
    <section className={`${styles.timeline} ${styles.rounds}`} style={{ "--rounds": span } as CSSProperties} aria-label="Tournament win probability">
      <div className={`${styles.oddsHeader} mb-5 flex flex-wrap items-start gap-4`}>
        <div><h2 className={styles.probabilityTitle}>Win Probability</h2><p className="font-sans text-xs text-ink-500">{active ? active.label : "—"}</p></div>
        <div className="flex gap-5">
          {["Maroon", "Tie", "White"].map((label, index) => <div key={label}><p className={`font-condensed text-xs font-bold uppercase tracking-wide ${index === 1 ? "text-gold-700" : "text-maroon-700"}`}>{label}</p><p className="font-sans text-xl font-black tabular-nums">{active ? `${Math.round(values[index] * 100)}%` : "—"}</p></div>)}
        </div>
      </div>
      {latest && rounds > 0 ? <>
        <div className={styles.timelineGrid}>
          <div className={`${styles.labels} font-condensed text-maroon-700`}>
            {["100%", "50%", "0%", "50%", "100%"].map((label, index) => <span key={index} className={styles.axisPercent} style={{ top: `${index * 25}%` }}>{label}</span>)}
            <span className={styles.maroonLabel}>Maroon</span>
            <span className={styles.whiteLabel}>White</span>
          </div>
          <svg viewBox={`0 0 ${width} 180`} preserveAspectRatio="none" className={styles.plot} role="img" aria-label="Tournament win probability by round: Maroon at the top, even or tie in the middle, White at the bottom">
            <defs><clipPath id={`${clip}-upper`}><rect width={width} height="90" /></clipPath><clipPath id={`${clip}-lower`}><rect y="90" width={width} height="90" /></clipPath></defs>
            <rect width={width} height="180" fill="#eee5d5" />
            <polygon points={area} fill="#500001" fillOpacity="0.9" clipPath={`url(#${clip}-upper)`} />
            <polygon points={area} fill="#fff" clipPath={`url(#${clip}-lower)`} />
            {[0, 45, 90, 135, 180].map(value => <line key={value} x1="0" x2={width} y1={value} y2={value} stroke="#a78945" strokeOpacity={value === center ? 0.8 : 0.3} vectorEffect="non-scaling-stroke" />)}
            <polyline points={line} fill="none" stroke="#231b18" strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {result && <div className={styles.resultArea}><div className={styles.endResult} style={{ top: result.winner === "maroon" ? 0 : "50%" }} role="note" aria-label={`${result.winner === "maroon" ? "Maroon" : "White"} wins ${result.label}`}>{result.label}</div></div>}
          <div className={styles.holeAxis} aria-label="Rounds">{Array.from({ length: rounds }, (_, index) => <span key={index}>R{index + 1}</span>)}</div>
          {points.length > 1 && <div className={styles.sliderTrack}><input aria-label="Explore tournament odds" aria-valuetext={active?.label} type="range" min="0" max={rounds} step="0.01" value={active?.x ?? 0} onChange={(event) => pick(Number(event.target.value))} className={styles.explore} /></div>}
        </div>
        {active && <p className="sr-only">{active.label} · Maroon {Math.round(active.maroon * 100)}% · Tie {Math.round(active.tie * 100)}% · White {Math.round(active.white * 100)}%</p>}
        <p className="mt-3 font-sans text-xs text-ink-500">{note} The line balances the two teams’ chances, with ties pulling it toward the middle.</p>
      </> : <p className="py-12 text-center font-sans text-sm text-ink-500">{emptyNote}</p>}
    </section>
  );
}
