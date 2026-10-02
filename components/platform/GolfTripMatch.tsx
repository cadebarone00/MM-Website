import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GolfMatchGolfer, GolfMatchPreview, GolfMatchSide } from "@/lib/platform/golfTripPreviewFixture";
import styles from "./GolfTripMatch.module.css";

/**
 * Golf tab → Match slide: Sleeper's fantasy Match screen, translated to golf, on the trip's maroon.
 * Top: the team matchup card. Below: the lineup, one row per match (golfer vs golfer, M1/M2/… badge between).
 * Look only, fed by made-up data from the /dev/tournament preview.
 */
export function GolfTripMatch({ match }: { match: GolfMatchPreview }) {
  return <div className={styles.match}>
    <MatchupHeader match={match} />
    <ul className={styles.lineup}>
      {match.matches.map((m, i) => <li key={i} className={styles.pairing}>
        <Golfer golfer={m.left} align="left" />
        <span className={styles.score}>{m.left.score}</span>
        <span className={`${styles.badge} ${styles[`badge${i % 4}`]}`}>M{i + 1}</span>
        <span className={`${styles.score} ${styles.scoreRight}`}>{m.right.score}</span>
        <Golfer golfer={m.right} align="right" />
      </li>)}
    </ul>
  </div>;
}

/** Golf tab → Leaderboard slide: the same top card as Match, then one golfer per row (position badge, golfer, score). */
export function GolfTripLeaderboard({ match }: { match: GolfMatchPreview }) {
  return <div className={styles.match}>
    <MatchupHeader match={match} />
    <ul className={styles.lineup}>
      {match.leaderboard.map(({ position, golfer }, i) => <li key={golfer.name} className={styles.single}>
        <span className={`${styles.badge} ${styles[`badge${i % 4}`]}`}>{position}</span>
        <Golfer golfer={golfer} align="left" />
        <span className={styles.score}>{golfer.score}</span>
      </li>)}
    </ul>
  </div>;
}

/** Shared top of Match and Leaderboard: team matchup card, holes left + round dots, and the "Lineup  ‹ Round 2 ›" header. */
function MatchupHeader({ match }: { match: GolfMatchPreview }) {
  const [left, right] = match.sides;

  return <>
    <section className={styles.versus} aria-label="Team matchup">
      <div className={styles.teams}>
        <TeamSide side={left} align="left" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className={styles.crest}><img src="/assets/crest-white.svg" alt="" /></span>
        <TeamSide side={right} align="right" />
      </div>
      <div className={styles.stats}>
        <Stat value={left.fairwaysPct} label="fairways hit" align="left" />
        <div className={styles.avg}>
          <span className={styles.avgLabel}>AVG. SCORE</span>
          <span className={styles.avgValues}><span>{left.avgScore}</span><span>{right.avgScore}</span></span>
        </div>
        <Stat value={right.fairwaysPct} label="fairways hit" align="right" />
      </div>
    </section>

    <div className={styles.progress}>
      <p className={styles.left}>holes left ({left.holesLeft})</p>
      <div className={styles.dots} aria-label={`Round ${match.round} of ${match.roundCount}`}>
        {Array.from({ length: match.roundCount }, (_, i) =>
          <span key={i} className={i + 1 === match.round ? styles.dotActive : styles.dot} />)}
      </div>
      <p className={styles.right}>holes left ({right.holesLeft})</p>
    </div>

    <div className={styles.lineupHeader}>
      <h3 className={styles.lineupTitle}>Lineup</h3>
      {/* Look only for now: there's one round of preview data. */}
      <div className={styles.roundSwitch}>
        <button type="button" aria-label="Previous round"><ChevronLeft size={22} strokeWidth={2.25} aria-hidden /></button>
        <span>Round {match.round}</span>
        <button type="button" aria-label="Next round"><ChevronRight size={22} strokeWidth={2.25} aria-hidden /></button>
      </div>
    </div>
  </>;
}

function TeamSide({ side, align }: { side: GolfMatchSide; align: "left" | "right" }) {
  return <div className={`${styles.side} ${styles[align]}`}>
    <div className={styles.sideTop}>
      <span className={`${styles.avatar} ${align === "right" ? styles.avatarRight : ""}`}>{side.initials}</span>
      <span className={styles.win}>{side.winPct}% WIN</span>
      <span className={styles.points}>{side.points}</span>
    </div>
    <div className={styles.bar}><span className={align === "right" ? styles.barFillRight : styles.barFill} style={{ width: `${side.winPct}%` }} /></div>
    <p className={styles.teamName}>{side.name}</p>
    <p className={styles.teamMeta}>{align === "left" ? <>{side.handle} • <b>{side.record}</b></> : <><b>{side.record}</b> • {side.handle}</>}</p>
  </div>;
}

function Stat({ value, label, align }: { value: string; label: string; align: "left" | "right" }) {
  return <p className={`${styles.stat} ${styles[align]}`}><span className={styles.statValue}>{value} avg</span><span>{label}</span></p>;
}

function Golfer({ golfer, align }: { golfer: GolfMatchGolfer; align: "left" | "right" }) {
  return <div className={`${styles.golfer} ${styles[align]}`}>
    <span className={styles.golferName}>{golfer.name}</span>
    <span className={styles.golferMeta}><span className={styles.hcp}>HCP {golfer.hcp}</span> • {golfer.thru}</span>
    <span className={styles.tee}>{golfer.teeTime} <span className={styles.course}>@ {golfer.course}</span></span>
  </div>;
}
