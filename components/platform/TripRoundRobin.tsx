"use client";

import { roundRobinSchedule, roundRobinStandings, type RoundRobinResults, type RoundRobinSide } from "@/lib/platform/roundRobin";
import styles from "./TripRoundRobin.module.css";

export function TripRoundRobin({ sides, roster, results, onChange, courses = [] }: {
  sides: RoundRobinSide[]; roster: string; results?: RoundRobinResults; onChange?: (value: RoundRobinResults) => void; courses?: string[];
}) {
  const schedule = roundRobinSchedule(sides.map(side => side.id));
  const outcomes = results?.roster === roster ? results.outcomes : {};
  const standings = roundRobinStandings(sides, schedule, outcomes);
  const names = new Map(sides.map(side => [side.id, side.name]));
  return <div className={styles.board}>
    <h3>Round Robin</h3>
    <p className={styles.note}>Every side plays every other side once. Byes do not count toward the record.</p>
    <div className={styles.tableWrap}><table className={styles.table} aria-label="Round robin standings">
      <thead><tr><th scope="col">Side</th><th scope="col">W</th><th scope="col">L</th><th scope="col">T</th><th scope="col">PCT</th></tr></thead>
      <tbody>{standings.map(row => <tr key={row.id}><th scope="row"><span className={styles.rank}>{row.rank}</span>{row.name}</th><td>{row.wins}</td><td>{row.losses}</td><td>{row.ties}</td><td>{row.played ? row.percentage.toFixed(3) : "—"}</td></tr>)}</tbody>
    </table></div>
    <p className={styles.note}>Standings use winning percentage; a tie counts as half a win. Equal percentages share a rank. The organizer records results here.</p>
    {results && results.roster !== roster && <p className={styles.note}>The lineup or round selection changed. Previous results do not apply to this schedule.</p>}
    {schedule.map((rotation, index) => <section key={index} className={styles.rotation} aria-label={`Round robin rotation ${index + 1}`}>
      <h4>Rotation {index + 1}{courses[index] ? ` / ${courses[index]}` : ""}</h4>
      {rotation.matches.map(match => <div className={styles.match} key={match.id}>
        <span>{names.get(match.home)} <span className={styles.versus}>vs</span> {names.get(match.away)}</span>
        {onChange ? <label className={styles.result}>Result
          <select aria-label={`Result: ${names.get(match.home)} vs ${names.get(match.away)}`} value={outcomes[match.id] ?? ""} onChange={event => {
            const next = { ...outcomes };
            if (event.target.value) next[match.id] = event.target.value as "home" | "away" | "tie";
            else delete next[match.id];
            onChange({ roster, outcomes: next });
          }}>
            <option value="">Not played</option><option value="home">{names.get(match.home)} wins</option><option value="away">{names.get(match.away)} wins</option><option value="tie">Tie</option>
          </select>
        </label> : <span className={styles.outcome}>{outcomes[match.id] === "tie" ? "Tied" : outcomes[match.id] ? `${names.get(outcomes[match.id] === "home" ? match.home : match.away)} won` : "Not played"}</span>}
      </div>)}
      {rotation.bye && <p className={styles.note}>Bye: {names.get(rotation.bye)}</p>}
    </section>)}
    <p className={styles.note}>{schedule.length} rotations needed. Rotations without a course can be scheduled in Golf Schedule.</p>
  </div>;
}
