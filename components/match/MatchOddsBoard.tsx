import type { RealMatch } from "@/lib/data/types";
import { getPlayerDisplayName } from "@/lib/data/players";
import { liveLabel, matchStatus } from "@/components/leaderboard/matchUtils";
import styles from "./MatchMarkets.module.css";

/** Presentation only; pricing models are not connected. */
export function MatchOddsBoard({ match }: { match: RealMatch }) {
  const status = matchStatus(match);
  return <section className={styles.oddsBoard} aria-label="Match odds markets">
    <header className={styles.boardHeader}><h2>Match Odds</h2></header>
    <table className={styles.marketTable}>
      <thead><tr><th scope="col"><span>Tee time {match.teeTimeCst ?? "TBD"}</span>{status === "final" ? <span>Final · {liveLabel(match)}</span> : status === "live" ? <span>Thru {match.thru ?? 0}</span> : null}</th><th scope="col">Open<span>Spread / ML</span></th><th scope="col">Spread</th><th scope="col">Total<span>Birdies</span></th><th scope="col" aria-label="Moneyline">ML</th></tr></thead>
      <tbody>{(["maroon", "white"] as const).map((team, index) => <tr key={team}>
        <th scope="row"><span className={styles.teamName}>{team === "maroon" ? "Maroon" : "White"}</span><span>{(team === "maroon" ? match.maroonPlayers : match.whitePlayers).map(getPlayerDisplayName).join(" & ")}</span></th>
        <td aria-label={team + " opening spread and moneyline not posted"}><span>—</span><small>—</small></td>
        <td aria-label={team + " current spread not posted"}><div className={styles.marketCell}>—<small>—</small></div></td>
        <td aria-label={"Match birdies " + (index === 0 ? "over" : "under") + " not posted"}><div className={styles.marketCell}>{index === 0 ? "O" : "U"} —<small>—</small></div></td>
        <td aria-label={team + " moneyline not posted"}><div className={styles.marketCell}>—</div></td>
      </tr>)}</tbody>
    </table>
    <p className={styles.marketNote}>Odds not posted. Total is over/under birdies for the entire match.</p>
  </section>;
}
