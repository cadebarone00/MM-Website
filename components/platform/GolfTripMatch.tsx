import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GolfMatchGolfer, GolfMatchPreview, GolfMatchSide } from "@/lib/platform/golfTripPreviewFixture";
import styles from "./GolfTripMatch.module.css";

/**
 * Golf tab, Sleeper's fantasy Match screen translated to golf, on the trip's maroon. Look only, fed by made-up
 * data from the /dev/tournament preview. GolfMatchup (round dots + team card) sits above the Golf slide tabs;
 * the Match and Leaderboard slides below them each show the "Lineup ‹ Round 2 ›" header and their own rows.
 *
 * Match slide: one row per match (golfer vs golfer, M1/M2/… badge between).
 */
export function GolfTripMatch({ match }: { match: GolfMatchPreview }) {
  return <div className={styles.match}>
    <LineupHeader round={match.round} />
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

/** Leaderboard slide: a PLAYER / TOT / THRU / TDY header, then one golfer per row (position box, golfer, the 3 numbers). */
export function GolfTripLeaderboard({ match }: { match: GolfMatchPreview }) {
  return <div className={styles.match}>
    <LineupHeader round={match.round} />
    <div>
      <div className={`${styles.single} ${styles.columns}`} aria-hidden>
        <span className={styles.columnPlayer}>Player</span><span>TOT</span><span>THRU</span><span>TDY</span>
      </div>
      <ul className={styles.lineup}>
        {match.leaderboard.map(({ position, golfer, total, thru, today }) => <li key={golfer.name} className={styles.single}>
          <span className={styles.rank}>{position}</span>
          <Golfer golfer={golfer} align="left" showThru={false} />
          <span className={styles.number} aria-label={`Total ${total}`}>{total}</span>
          <span className={styles.number} aria-label={`Thru ${thru}`}>{thru}</span>
          <span className={styles.number} aria-label={`Today ${today}`}>{today}</span>
        </li>)}
      </ul>
    </div>
  </div>;
}

/**
 * Above the Golf slide tabs: the team matchup card, with one small cream oval per match tucked just under it
 * (`showDots`; not on Leaderboard). The current match's oval widens to read "Match 2". The ovals sit in the gap
 * under the card without taking up space, so the card and tabs stay in the same place on every slide.
 */
export function GolfMatchup({ match, showDots }: { match: GolfMatchPreview; showDots: boolean }) {
  const [left, right] = match.sides;

  return <div className={styles.matchup}>
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

    {showDots && <div className={styles.dots} aria-label={`Match ${match.round} of ${match.roundCount}`}>
      {Array.from({ length: match.roundCount }, (_, i) => i + 1 === match.round
        ? <span key={i} className={`${styles.dot} ${styles.dotActive}`}>Match {i + 1}</span>
        : <span key={i} className={styles.dot} />)}
    </div>}
  </div>;
}

function LineupHeader({ round }: { round: number }) {
  return <div className={styles.lineupHeader}>
    <h3 className={styles.lineupTitle}>Lineup</h3>
    {/* Look only for now: there's one round of preview data. */}
    <div className={styles.roundSwitch}>
      <button type="button" aria-label="Previous round"><ChevronLeft size={22} strokeWidth={2.25} aria-hidden /></button>
      <span>Round {round}</span>
      <button type="button" aria-label="Next round"><ChevronRight size={22} strokeWidth={2.25} aria-hidden /></button>
    </div>
  </div>;
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

function Golfer({ golfer, align, showThru = true }: { golfer: GolfMatchGolfer; align: "left" | "right"; showThru?: boolean }) {
  return <div className={`${styles.golfer} ${styles[align]}`}>
    <span className={styles.golferName}>{golfer.name}</span>
    <span className={styles.golferMeta}><span className={styles.hcp}>HCP {golfer.hcp}</span>{showThru && <> • {golfer.thru}</>}</span>
    <span className={styles.tee}>{golfer.teeTime} <span className={styles.course}>@ {golfer.course}</span></span>
  </div>;
}
