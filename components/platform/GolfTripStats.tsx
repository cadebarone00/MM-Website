import type { ScoreEdit } from "@/lib/platform/playerRounds";
import type { TripStatsRow, TripStatsTotals } from "@/lib/platform/tripStats";
import styles from "./GolfTripStats.module.css";

export type TripStatsView = { players: (TripStatsRow & { name: string })[]; trip: TripStatsTotals | null };
export type ScoreChangeLine = { name: string; edit: ScoreEdit };

const show = (value: number | null, suffix = "") => value === null ? "—" : `${value}${suffix}`;

/**
 * Golf tab → Overview, under the leaderboard: trip stats from the saved rounds (Player & Attest add-on), and the
 * organizer's changes to their own round, which everyone on the trip can see (decision 9).
 */
export function GolfTripStats({ stats, changes = [] }: { stats: TripStatsView; changes?: ScoreChangeLine[] }) {
  if (!stats.trip) return <p className={styles.empty}>Trip stats show once the first card is submitted.</p>;
  const row = (key: string, name: string, s: TripStatsTotals, total = false) => <tr key={key} className={total ? styles.total : undefined}>
    <th scope="row">{name}</th><td>{s.rounds}</td><td>{s.scoringAvg}</td><td>{show(s.puttsAvg)}</td><td>{show(s.fairwayPct, "%")}</td><td>{show(s.greenPct, "%")}</td>
  </tr>;
  return <>
    <div className={styles.scroll}><table className={styles.table}>
      <thead><tr><th scope="col">Player</th><th scope="col">Rds</th><th scope="col">Avg</th><th scope="col">Putts</th><th scope="col">FWY</th><th scope="col">GIR</th></tr></thead>
      <tbody>{stats.players.map((p) => row(p.profileId, p.name, p))}{row("trip", "Trip", stats.trip, true)}</tbody>
    </table></div>
    {changes.length > 0 && <section className={styles.changes} aria-label="Organizer's own score changes">
      <h3>Organizer&rsquo;s own score changes</h3>
      <ul>{changes.map(({ name, edit }, i) => <li key={i}>{name}, hole {edit.hole} {edit.field}: {String(edit.from ?? "—")} → {String(edit.to ?? "—")}. {edit.reason}</li>)}</ul>
    </section>}
  </>;
}
