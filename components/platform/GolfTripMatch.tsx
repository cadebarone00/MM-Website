import { useState, type ReactNode } from "react";
import type { GolfMatchGolfer, GolfMatchPreview, GolfMatchSide, GolfMatchStanding } from "@/lib/platform/golfTripPreviewFixture";
import styles from "./GolfTripMatch.module.css";

/**
 * Golf tab, Sleeper's fantasy Match screen translated to golf, on the trip's maroon. Look only, fed by made-up
 * data from the /dev/tournament preview. GolfMatchup (round dots + team card) sits above the Golf slide tabs;
 * the Match and Leaderboard slides below them each show their own header control and rows.
 *
 * Match slide: one row per match, names facing a status box (styled like the Leaderboard's position box: tee time
 * before it starts, THRU + holes while it's on, F when it's finished) with each side's match play standing on the
 * outside ("2 UP" for the leader, "AS" on both when all square, blank before it starts). The leader's side is filled in
 * their team's color (gold left, rose right), running in from their edge of the screen and rounding off past the name.
 * Names show just name and tee time + course. Handicap events get the GROSS / NET switch, which swaps in net standings.
 */
export function GolfTripMatch({ match }: { match: GolfMatchPreview }) {
  const [net, setNet] = useState(false);
  const showNet = match.handicap && net;

  return <div className={styles.match}>
    <SlideHeader title={match.course} detail={`Round ${match.round} of ${match.roundCount} • ${match.format}`}>
      {match.handicap && <ScoringSwitch net={net} onNet={setNet} />}
    </SlideHeader>
    <ul className={styles.lineup}>
      {match.matches.map((m, i) => {
        const standing = showNet ? m.net : m.gross;
        return <li key={i} className={styles.pairing}>
          <MatchSide golfer={m.left} side="left" standing={standing} />
          <MatchStatus golfer={m.left} />
          <MatchSide golfer={m.right} side="right" standing={standing} />
        </li>;
      })}
    </ul>
  </div>;
}

/** One golfer's half of a match row: standing on the outside, name toward the middle; filled in team color when leading. */
function MatchSide({ golfer, side, standing }: { golfer: GolfMatchGolfer; side: "left" | "right"; standing: GolfMatchStanding }) {
  const leading = standing?.leader === side;
  const label = !standing ? "" : standing.leader === null ? "AS" : leading ? `${standing.up} UP` : "";
  return <div className={`${styles.pairSide} ${styles[side]} ${leading ? styles.leading : ""}`}>
    <span className={styles.standing}>{label}</span>
    <Golfer golfer={golfer} align={side === "left" ? "right" : "left"} showThru={false} showHcp={false} />
  </div>;
}

/**
 * Leaderboard slide: a PLAYER / TOT / THRU / TDY header, then one golfer per row (position box, CARD button, golfer,
 * the numbers).
 * Handicap events get a GROSS / NET switch in the header; NET re-ranks by net total, shows net TOT and TDY, and adds
 * an HCP column left of TOT. Names show just two lines (name, tee time + course) in both modes.
 * CARD (gold outline) opens that golfer's scorecard: the button fills gold, the row's boxes move to its top, and a plain
 * card shows under the row, flush left so HOLE / PAR / SCORE line up under the position box. Tap again to close.
 */
export function GolfTripLeaderboard({ match }: { match: GolfMatchPreview }) {
  const [net, setNet] = useState(false);
  const [openCards, setOpenCards] = useState<ReadonlySet<string>>(new Set());
  const showNet = match.handicap && net;
  const rows = showNet ? netRanked(match.leaderboard) : match.leaderboard;

  function toggleCard(name: string) {
    setOpenCards((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  return <div className={styles.match}>
    <SlideHeader title={match.course} detail={`${roundDay(match.roundDate)} • Round ${match.round}`}>
      {match.handicap && <ScoringSwitch net={net} onNet={setNet} />}
    </SlideHeader>
    <div>
      <div className={`${styles.single} ${showNet ? styles.singleNet : ""} ${styles.columns}`} aria-hidden>
        <span className={styles.columnPlayer}>Player</span>{showNet && <span>HCP</span>}<span>TOT</span><span>THRU</span><span>TDY</span>
      </div>
      <ul className={styles.lineup}>
        {rows.map(({ position, golfer, total, thru, today, netTotal, netToday, holes }) => {
          const open = openCards.has(golfer.name);
          const cardId = `scorecard-${golfer.name.replace(/\W+/g, "-")}`;
          return <li key={golfer.name} className={`${styles.single} ${showNet ? styles.singleNet : ""} ${open ? styles.singleOpen : ""}`}>
            <span className={styles.rank}>{position}</span>
            <button type="button" className={`${styles.cardButton} ${open ? styles.cardButtonOpen : ""}`} onClick={() => toggleCard(golfer.name)}
              aria-expanded={open} aria-controls={open ? cardId : undefined} aria-label={`${golfer.name} scorecard`}>CARD</button>
            <Golfer golfer={golfer} align="left" showThru={false} showHcp={false} />
            {showNet && <span className={styles.number} aria-label={`Handicap ${golfer.hcp}`}>{golfer.hcp}</span>}
            <span className={styles.number} aria-label={`Total ${showNet ? netTotal : total}`}>{showNet ? netTotal : total}</span>
            <span className={styles.number} aria-label={`Thru ${thru}`}>{thru}</span>
            <span className={styles.number} aria-label={`Today ${showNet ? netToday : today}`}>{showNet ? netToday : today}</span>
            {open && <Scorecard id={cardId} par={match.par} holes={holes} name={golfer.name} />}
          </li>;
        })}
      </ul>
    </div>
  </div>;
}

type LeaderboardRow = GolfMatchPreview["leaderboard"][number];
const scoreValue = (score: string) => (score === "E" ? 0 : Number(score));

/** Sorts by net total (lowest first) and swaps in net positions, with "T" for ties. */
function netRanked(rows: LeaderboardRow[]): LeaderboardRow[] {
  const sorted = [...rows].sort((a, b) => scoreValue(a.netTotal) - scoreValue(b.netTotal));
  return sorted.map((row) => {
    const value = scoreValue(row.netTotal);
    const place = sorted.findIndex((r) => scoreValue(r.netTotal) === value) + 1;
    const tied = sorted.filter((r) => scoreValue(r.netTotal) === value).length > 1;
    return { ...row, position: `${tied ? "T" : ""}${place}` };
  });
}

/**
 * Above the Golf slide tabs: the Match box for the featured match (the first one: the organizer's). Each side shows the
 * golfer's initials, name and points earned ("3 PTS"), with the match play standing ("2 UP" / "AS") toward the middle; the match status
 * (tee time, THRU + holes, or F) sits at the top center in plain cream text. The leader's half fills with their team color from the box's edge, rounding
 * off before the status box, like the Match slide rows but taller. Below: one win-probability bar that fills from the
 * center toward the favorite, then each side's round stats, FWY % / GREEN % / PUTTS / SCORE to par, labels above a
 * line and values below it, mirrored either side of a thin gold center line.
 * With `showDots` (not on Leaderboard), one small cream oval per match is tucked just under the box; the featured
 * match's oval widens to read "Match 1". The ovals take no space, so the box and tabs stay put on every slide.
 */
export function GolfMatchup({ match, showDots }: { match: GolfMatchPreview; showDots: boolean }) {
  const [left, right] = match.sides;
  const featured = 0;
  const { left: leftGolfer, right: rightGolfer, gross } = match.matches[featured];

  return <div className={styles.matchup}>
    <section className={styles.versus} aria-label="Match">
      <div className={styles.teams}>
        <PlayerSide golfer={leftGolfer} align="left" standing={gross} />
        <span className={styles.boxStatus}><MatchStatus golfer={leftGolfer} plain /></span>
        <PlayerSide golfer={rightGolfer} align="right" standing={gross} />
      </div>
      <div className={styles.stats}>
        <WinBar left={left.winPct} right={right.winPct} />
        <RoundStats side={left} align="left" />
        <RoundStats side={right} align="right" />
      </div>
    </section>

    {showDots && <div className={styles.dots} aria-label={`Match ${featured + 1} of ${match.matches.length}`}>
      {match.matches.map((_, i) => i === featured
        ? <span key={i} className={`${styles.dot} ${styles.dotActive}`}>Match {i + 1}</span>
        : <span key={i} className={styles.dot} />)}
    </div>}
  </div>;
}

/**
 * Slide header: on the left, the round's course (large) over a detail line, styled like a golfer's name and tee line
 * (Leaderboard: date and round; Match: round and format). On the right, GROSS / NET on handicap events.
 */
function SlideHeader({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return <div className={styles.lineupHeader}>
    <div className={styles.headerText}>
      <h3 className={styles.headerTitle}>{title}</h3>
      <p className={styles.headerDetail}>{detail}</p>
    </div>
    {children}
  </div>;
}

/** "2027-04-23" → "Fri, Apr 23" (read as a calendar date, so no time zone can shift it). */
export function roundDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * A match's status, read from the first golfer's progress ("Not started", "Thru 12", "Thru 18" / "F"): a cream box
 * between the golfers on the Match slide, or (`plain`) bare cream text at the top center of the Match box.
 */
function MatchStatus({ golfer, plain = false }: { golfer: GolfMatchGolfer; plain?: boolean }) {
  const className = plain ? `${styles.status} ${styles.statusPlain}` : `${styles.rank} ${styles.status}`;
  const holes = Number(golfer.thru.match(/^Thru (\d+)$/)?.[1]);
  if (golfer.thru === "F" || holes >= 18) return <span className={className} aria-label="Finished">F</span>;
  if (holes > 0) return <span className={className} aria-label={`Thru ${holes}`}>
    <small>THRU</small>{holes}
  </span>;
  const [time, period] = golfer.teeTime.split(" ");
  return <span className={className} aria-label={`Tees off ${golfer.teeTime}`}>
    {time}{period && <small>{period}</small>}
  </span>;
}

function ScoringSwitch({ net, onNet }: { net: boolean; onNet: (net: boolean) => void }) {
  return <div className={styles.scoring} role="group" aria-label="Scoring">
    <button type="button" aria-pressed={!net} className={!net ? styles.scoringActive : ""} onClick={() => onNet(false)}>GROSS</button>
    <button type="button" aria-pressed={net} className={net ? styles.scoringActive : ""} onClick={() => onNet(true)}>NET</button>
  </div>;
}

/**
 * One golfer's card: Hole / Par / Score rows; 1–9, OUT, 10–18, IN, TOT columns. Scrolls sideways on its own.
 * Unplayed holes are blank, and OUT / IN / TOT add up only the holes played (blank until one is).
 * Hole scores are marked the usual way: birdie circle, eagle or better double circle, bogey box, double bogey or worse double box.
 */
function Scorecard({ id, par, holes, name }: { id: string; par: number[]; holes: (number | null)[]; name: string }) {
  const sum = (values: (number | null)[]) => {
    const played = values.filter((v): v is number => v !== null);
    return played.length ? played.reduce((a, b) => a + b, 0) : null;
  };
  const nine = (start: number) => Array.from({ length: 9 }, (_, i) => start + i);
  const columns: { label: string; par: number | null; score: number | null; total?: boolean }[] = [
    ...nine(0).map((i) => ({ label: String(i + 1), par: par[i], score: holes[i] })),
    { label: "OUT", par: sum(par.slice(0, 9)), score: sum(holes.slice(0, 9)), total: true },
    ...nine(9).map((i) => ({ label: String(i + 1), par: par[i], score: holes[i] })),
    { label: "IN", par: sum(par.slice(9, 18)), score: sum(holes.slice(9, 18)), total: true },
    { label: "TOT", par: sum(par), score: sum(holes), total: true },
  ];

  return <div id={id} className={styles.scorecard} role="region" aria-label={`${name} scorecard`} tabIndex={0}>
    <table className={styles.scorecardTable}>
      <tbody>
        <tr><th scope="row">Hole</th>{columns.map((c) => <td key={c.label} className={c.total ? styles.totalCell : ""}>{c.label}</td>)}</tr>
        <tr><th scope="row">Par</th>{columns.map((c) => <td key={c.label} className={c.total ? styles.totalCell : ""}>{c.par ?? ""}</td>)}</tr>
        <tr><th scope="row">Score</th>{columns.map((c) => <td key={c.label} className={c.total ? styles.totalCell : ""}>
          {c.score === null ? "" : c.total || c.par === null ? c.score : <span className={scoreMark(c.score - c.par)}>{c.score}</span>}
        </td>)}</tr>
      </tbody>
    </table>
  </div>;
}

/**
 * Above the Golf slide tabs on Overview (in place of the team card): the weather at the course being played.
 * Placeholder only: no forecast is fetched, so every reading (now, the day, and hour by hour) is a dash.
 */
export function GolfCourseWeather({ match }: { match: GolfMatchPreview }) {
  return <section className={styles.weather} aria-label="Course weather">
    <div className={styles.weatherTop}>
      <div className={styles.headerText}>
        <h3 className={styles.headerTitle}>{match.course}</h3>
        <p className={styles.headerDetail}>{roundDay(match.roundDate)} • Round {match.round}</p>
      </div>
      <span className={styles.weatherTemp}>—°</span>
    </div>
    <div className={styles.weatherStats}>
      {["High", "Low", "Wind", "Rain"].map((label) => <p key={label} className={styles.weatherStat}><span>{label}</span>—</p>)}
    </div>
    <div className={styles.weatherHours} aria-label="Hourly forecast">
      {["8 AM", "10 AM", "12 PM", "2 PM", "4 PM"].map((hour) => <p key={hour} className={styles.weatherHour}><span>{hour}</span>—°</p>)}
    </div>
    <p className={styles.weatherNote}>Forecast coming soon</p>
  </section>;
}

/** One half of the Match box: initials + standing on top, then name and points earned; filled in team color when leading. */
function PlayerSide({ golfer, align, standing }: { golfer: GolfMatchGolfer; align: "left" | "right"; standing: GolfMatchStanding }) {
  const leading = standing?.leader === align;
  const label = !standing ? "" : standing.leader === null ? "AS" : leading ? `${standing.up} UP` : "";
  return <div className={`${styles.side} ${styles[align]} ${leading ? styles.sideLeading : ""}`}>
    <div className={styles.sideTop}>
      <span className={`${styles.avatar} ${align === "right" ? styles.avatarRight : ""}`}>{initials(golfer.name)}</span>
      <span className={styles.boxStanding}>{label}</span>
    </div>
    <p className={styles.teamName}>{golfer.name}</p>
    {golfer.points !== undefined && <p className={styles.teamMeta}>{golfer.points} {golfer.points === 1 ? "PT" : "PTS"}</p>}
  </div>;
}

/** "A. Organizer" → "AO". */
function initials(name: string): string {
  return name.split(/[\s.]+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

/**
 * Win probability as one bar, split at the center line: at 50 / 50 it's empty, and the favorite's team color fills
 * out from the center toward their side (all the way at 100%). Mirrored, so either side can fill.
 */
function WinBar({ left, right }: { left: number; right: number }) {
  const fill = (pct: number) => `${Math.min(Math.max((pct - 50) * 2, 0), 100)}%`;
  return <div className={styles.winBar} role="img" aria-label={`Win probability ${left}% to ${right}%`}>
    <span className={styles.winHalf}><span className={styles.winFillLeft} style={{ width: fill(left) }} /></span>
    <span className={styles.winHalf}><span className={styles.winFillRight} style={{ width: fill(right) }} /></span>
  </div>;
}

/** One side's round stats. The right side runs in reverse, so each stat sits the same distance from the center line. */
function RoundStats({ side, align }: { side: GolfMatchSide; align: "left" | "right" }) {
  const stats = [["FWY", side.fairwayPct], ["GREEN", side.greenPct], ["PUTTS", side.putts], ["SCORE", side.score]];
  return <dl className={`${styles.roundStats} ${styles[align]}`} aria-label={`${side.name} round stats`}>
    {(align === "right" ? [...stats].reverse() : stats).map(([label, value]) => <div key={label} className={styles.roundStat}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>)}
  </dl>;
}

function Golfer({ golfer, align, showThru = true, showHcp = true }:
  { golfer: GolfMatchGolfer; align: "left" | "right"; showThru?: boolean; showHcp?: boolean }) {
  return <div className={`${styles.golfer} ${styles[align]}`}>
    <span className={styles.golferName}>{golfer.name}</span>
    {(showHcp || showThru) && <span className={styles.golferMeta}>
      {showHcp && <span className={styles.hcp}>HCP {golfer.hcp}</span>}{showHcp && showThru && " • "}{showThru && golfer.thru}
    </span>}
    <span className={styles.tee}>{golfer.teeTime} <span className={styles.course}>@ {golfer.course}</span></span>
  </div>;
}

/** Scorecard mark for a hole's score vs par (no mark for par). */
function scoreMark(toPar: number): string {
  if (toPar <= -2) return `${styles.mark} ${styles.circle} ${styles.double}`;
  if (toPar === -1) return `${styles.mark} ${styles.circle}`;
  if (toPar === 1) return `${styles.mark} ${styles.box}`;
  if (toPar >= 2) return `${styles.mark} ${styles.box} ${styles.double}`;
  return styles.mark;
}
