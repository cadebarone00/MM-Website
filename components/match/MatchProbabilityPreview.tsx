import type { MatchOddsPoint } from "@/lib/live/matchProfile";
import styles from "./MatchMarkets.module.css";

export function MatchProbabilityPreview({ points }: { points: MatchOddsPoint[] }) {
  const point = points.filter(point => point.state_thru === 0).at(-1);
  const values = point ? [point.maroon_win_probability, point.white_win_probability, point.tie_probability] : [];
  const ready = values.length === 3 && values.every(value => Number.isFinite(value) && value >= 0 && value <= 1) && Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 0.001;
  const pct = (index: number) => ready ? `${(values[index] * 100).toFixed(1)}%` : "—";
  let offset = 0;
  return <section className={styles.predictor} aria-label="Pre-match win probability">
    <header className={styles.boardHeader}><h2>Win Probability</h2></header>
    <div className={styles.predictionBody}>
      <div className={styles.maroonPercent}><strong>{pct(0)}</strong><span>Maroon</span></div>
      <div className={styles.donut}>
        <svg viewBox="0 0 240 240" role="img" aria-label={ready ? `Maroon ${pct(0)}, White ${pct(1)}, Tie ${pct(2)}` : "Pre-match probabilities not yet available"}>
          <circle cx="120" cy="120" r="98" fill="none" stroke="#e8e8e8" strokeWidth="23" />
          {ready && values.map((value, index) => {
            const start = offset;
            offset += value * 100;
            return <circle key={index} cx="120" cy="120" r="98" fill="none" stroke={["#500001", "#dedbd3", "#a78945"][index]} strokeWidth="23" pathLength="100" strokeDasharray={`${value * 100} ${100 - value * 100}`} strokeDashoffset={-start} transform="rotate(90 120 120)" />;
          })}
        </svg>
        <div className={styles.donutTeams}><span>Maroon</span><span>White</span></div>
      </div>
      <div className={styles.whitePercent}><strong>{pct(1)}</strong><span>White</span></div>
    </div>
    <p className={styles.marketNote}>{ready ? `Tie ${pct(2)} · Pre-match probabilities` : "Pre-match probabilities not yet available."}</p>
  </section>;
}
