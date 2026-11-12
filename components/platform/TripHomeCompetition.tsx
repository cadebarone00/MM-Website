"use client";

import { halves } from "@/lib/platform/bigBoard";
import type { HomeCompetitionSummary } from "@/lib/platform/homeCompetition";
import styles from "./TripHomeCompetition.module.css";

/**
 * Trip Home → Competition: the whole competition at a glance, from the trip's real settings — type, team format,
 * individual format, golf days, rounds, each round's format, then total points and what wins. Big Board look.
 */
export function TripHomeCompetition({ summary }: { summary: HomeCompetitionSummary }) {
  const facts: [string, string][] = [
    ["Type", summary.type],
    ...(summary.teamFormat ? [["Team format", summary.teamFormat] as [string, string], [summary.teamFormat === "2 Teams" ? "Your team" : "Teammates", summary.yourTeam || "Not on a team yet"] as [string, string]] : []),
    ...(summary.individualFormat ? [["Individual", summary.individualFormat] as [string, string]] : []),
    ["Days", String(summary.days)],
    ["Rounds", String(summary.rounds.length)],
  ];
  return <section className={styles.card} aria-label="Competition details">
    <dl className={styles.facts}>
      {facts.map(([label, value]) => <div key={label} className={styles.fact}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {summary.rounds.length > 0 && <>
      <div className={styles.divider} aria-hidden />
      <h3 className={styles.subhead}>Formats</h3>
      <ol className={styles.rounds}>
        {summary.rounds.map(round => <li key={round.number} className={styles.round}>
          <span className={styles.roundNumber}>Round {round.number}</span>
          <span className={styles.roundWhat}>
            <span className={styles.roundFormat} data-unset={round.format === "Format not set" || undefined}>{round.format}</span>
            <span className={styles.roundCourse} data-unset={round.course === "Course TBD" || undefined}>{round.course}</span>
          </span>
        </li>)}
      </ol>
    </>}
    {summary.totalPoints !== null && summary.toWin !== null && <>
      <div className={styles.divider} aria-hidden />
      <div className={styles.points}>
        <div className={styles.pointsCell}><span className={styles.pointsLabel}>Total points</span><span className={styles.pointsValue}>{halves(summary.totalPoints)}</span></div>
        <div className={styles.pointsCell}><span className={styles.pointsLabel}>To win</span><span className={`${styles.pointsValue} ${styles.toWin}`}>{halves(summary.toWin)}</span></div>
      </div>
    </>}
  </section>;
}
