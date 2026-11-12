"use client";

import type { ReactNode } from "react";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { shownUsername } from "@/lib/platform/playerUsername";
import { sortHomeRoster, type HomeRosterPlayer, type HomeRosterTeam } from "@/lib/platform/homeRoster";
import styles from "./GolfTripHome.module.css";

/**
 * Home's Players section. Once the teams are set (after the team draft, or teams saved in Settings) it becomes "Teams":
 * one section, each team's name as a small gold label (not a heading) with its players under it.
 */
export function TripHomeRoster({ players, teams, allotted, invite }: {
  players: HomeRosterPlayer[]; teams: HomeRosterTeam[] | null; allotted: number | null; invite?: ReactNode;
}) {
  const list = (roster: HomeRosterPlayer[]) => <ul className={styles.homePlayerList}>
    {roster.map((player, index) => <li key={player.name} className={styles.homePlayer}>
      <span className={styles.homePlayerNumber}>{index + 1}</span>
      <span className={styles.homePlayerBadge} aria-hidden>{player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : <span className={styles.homePlayerMark}><MaroonMark color="var(--color-maroon-900)" /></span>}</span>
      <span className={styles.homePlayerWho}>
        <span className={styles.homePlayerName}>{player.name}</span>
        <span className={styles.homePlayerUsername}>{shownUsername(player.name, player.username)}</span>
      </span>
    </li>)}
  </ul>;
  if (teams) return <section className={styles.homePlayers} aria-labelledby="home-roster-heading">
    <div className={styles.homePlayersTop}>
      <h2 id="home-roster-heading" className={styles.accountHeading}>Teams</h2>
      <span className={styles.homePlayersCount} aria-label={`${teams.length} teams`}>{teams.length}</span>
    </div>
    {invite}
    {teams.map((team, teamIndex) => <div key={teamIndex} className={styles.homeTeam} role="group" aria-labelledby={`home-team-${teamIndex}`}>
      <p id={`home-team-${teamIndex}`} className={styles.homeTeamName}><span>{team.name}</span><span aria-label={`${team.players.length} players`}>{team.players.length}</span></p>
      {list(team.players)}
    </div>)}
  </section>;
  const sections = [{ name: "Players", players: sortHomeRoster(players) }];
  return <>{sections.map((section, teamIndex) => <section key={teamIndex} className={styles.homePlayers} aria-labelledby={`home-roster-heading-${teamIndex}`}>
    <div className={styles.homePlayersTop}>
      <h2 id={`home-roster-heading-${teamIndex}`} className={styles.accountHeading}>{section.name}</h2>
      <span className={styles.homePlayersCount} aria-label={allotted ? `${players.length} of ${allotted} players joined` : `${players.length} players joined`}>
        {allotted ? `${players.length}/${allotted}` : players.length}
      </span>
    </div>
    {teamIndex === 0 && invite}
    {section.players.length ? <ul className={styles.homePlayerList}>
      {section.players.map((player, index) => <li key={player.name} className={styles.homePlayer}>
        <span className={styles.homePlayerNumber}>{index + 1}</span>
        <span className={styles.homePlayerBadge} aria-hidden>{player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : <span className={styles.homePlayerMark}><MaroonMark color="var(--color-maroon-900)" /></span>}</span>
        <span className={styles.homePlayerWho}>
          <span className={styles.homePlayerName}>{player.name}</span>
          <span className={styles.homePlayerUsername}>{shownUsername(player.name, player.username)}</span>
        </span>
      </li>)}
    </ul> : <p className={styles.homePlayersEmpty}>Players show up here as they join the trip.</p>}
  </section>)}</>;
}
