import type { RealMatch } from "@/lib/data/types";
import { getPlayerDisplayName } from "@/lib/data/players";
import { liveLabel, matchStatus } from "@/components/leaderboard/matchUtils";
import styles from "./MatchTimeline.module.css";

/** Presentation only; pricing models are not connected. */
export function MatchOddsBoard({ match }: { match: RealMatch }) {
  const status = matchStatus(match);
  return <section className={styles.oddsBoard} aria-label="Match odds markets">
    <header className={styles.boardHeader}><h2>Match Odds</h2><p>Tee time {match.teeTimeCst ?? "TBD"}{status === "final" ? " ? Final ? " + liveLabel(match) : status === "live" ? " ? Thru " + (match.thru ?? 0) : ""}</p></header>
    <table className={styles.marketTable}>
      <thead><tr><th scope="col">Team</th><th scope="col">Open<span>Spread / ML</span></th><th scope="col">Spread</th><th scope="col">Total<span>Match birdies</span></th><th scope="col">Moneyline</th></tr></thead>
      <tbody>{(["maroon", "white"] as const).map((team, index) => <tr key={team}>
        <th scope="row"><span className={styles.teamName}>{team === "maroon" ? "Maroon" : "White"}</span><span>{(team === "maroon" ? match.maroonPlayers : match.whitePlayers).map(getPlayerDisplayName).join(" & ")}</span></th>
        <td aria-label={team + " opening spread and moneyline not posted"}>? / ?</td>
        <td aria-label={team + " current spread not posted"}>?</td>
        <td aria-label={"Match birdies " + (index === 0 ? "over" : "under") + " not posted"}>{index === 0 ? "O" : "U"} ?</td>
        <td aria-label={team + " moneyline not posted"}>?</td>
      </tr>)}</tbody>
    </table>
    <p className={styles.marketNote}>Odds not posted. Total is over/under birdies for the entire match.</p>
  </section>;
}
