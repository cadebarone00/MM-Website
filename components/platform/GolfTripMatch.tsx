import { useState, type ReactNode } from "react";
import { resolveGolfFormat } from "@/lib/platform/formats";
import {
  GOLF_PREVIEW_COURSE_WEATHER,
  normalizeCompetitor,
  type GolfLeaderboardEntry,
  type GolfMatchCompetitor,
  type GolfMatchGolfer,
  type GolfMatchPairing,
  type GolfMatchPreview,
  type GolfMatchSide,
  type GolfMatchStanding,
} from "@/lib/platform/golfTripPreviewFixture";
import styles from "./GolfTripMatch.module.css";

/**
 * Golf tab, Sleeper's fantasy Match screen translated to golf, on the trip's maroon.
 * Dynamic presentation adapts to format metadata (Singles, Fourball, Alternate Shot, Scramble, Stableford).
 * GolfMatchup (round dots + team card) sits above the Golf slide tabs;
 * the Match and Leaderboard slides below them each show their own header control and rows.
 */
export function GolfTripMatch({ match }: { match: GolfMatchPreview }) {
  const [net, setNet] = useState(false);
  const showNet = match.handicap && net;
  const formatDef = resolveGolfFormat(match.formatDef?.key ?? match.format);

  return <div className={styles.match}>
    <SlideHeader title={match.course} detail={`Round ${match.round} of ${match.roundCount} • ${formatDef.label}`}>
      {match.handicap && <ScoringSwitch net={net} onNet={setNet} />}
    </SlideHeader>
    <ul className={styles.lineup}>
      {match.matches.map((m, i) => {
        const standing = showNet ? m.net : m.gross;
        const leftComp = normalizeCompetitor(m.left);
        const rightComp = m.right ? normalizeCompetitor(m.right) : undefined;
        return <li key={i} className={styles.pairing}>
          <MatchSide competitor={leftComp} side="left" standing={standing} />
          <MatchStatus competitor={leftComp} />
          {rightComp && <MatchSide competitor={rightComp} side="right" standing={standing} />}
        </li>;
      })}
    </ul>
  </div>;
}

/** One competitor side's half of a match row: standing on outside, player(s) toward center. */
function MatchSide({ competitor, side, standing }: { competitor: GolfMatchCompetitor | GolfMatchGolfer; side: "left" | "right"; standing: GolfMatchStanding }) {
  const comp = normalizeCompetitor(competitor);
  const leading = standing?.leader === side;
  const label = !standing ? "" : standing.leader === null ? "AS" : leading ? `${standing.up} UP` : "";
  const isMulti = comp.golfers.length > 1;

  return <div className={`${styles.pairSide} ${styles[side]} ${leading ? styles.leading : ""}`}>
    <span className={styles.standing}>{label}</span>
    {isMulti ? (
      <div className={`${styles.golfer} ${styles[side]}`}>
        <span className={styles.golferName}>{comp.name || comp.golfers.map((g) => g.name).join(" / ")}</span>
        <span className={styles.golferMeta}>
          {comp.golfers.map((g) => `${g.name}${g.hcp ? ` (${g.hcp})` : ""}`).join(" • ")}
        </span>
        <span className={styles.tee}>{comp.teeTime || comp.golfers[0]?.teeTime} <span className={styles.course}>@ {comp.course || comp.golfers[0]?.course}</span></span>
      </div>
    ) : (
      <Golfer golfer={comp.golfers[0]} align={side === "left" ? "right" : "left"} showThru={false} showHcp={false} />
    )}
  </div>;
}

/**
 * Leaderboard slide: a PLAYER / TOT (or PTS) / THRU / TDY header, then one competitor per row.
 * Stableford formats display PTS columns; stroke play formats display TOT relative to par.
 */
export function GolfTripLeaderboard({ match }: { match: GolfMatchPreview }) {
  const [net, setNet] = useState(false);
  const [openCards, setOpenCards] = useState<ReadonlySet<string>>(new Set());
  const formatDef = resolveGolfFormat(match.formatDef?.key ?? match.format);
  const isStableford = formatDef.scoringMethod === "stableford";
  const showNet = match.handicap && net;
  const rows = showNet ? netRanked(match.leaderboard, isStableford) : match.leaderboard;

  function toggleCard(name: string) {
    setOpenCards((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  return <div className={styles.match}>
    <SlideHeader title={match.course} detail={`${roundDay(match.roundDate)} • Round ${match.round} • ${formatDef.label}`}>
      {match.handicap && <ScoringSwitch net={net} onNet={setNet} />}
    </SlideHeader>
    <div>
      <div className={`${styles.single} ${showNet ? styles.singleNet : ""} ${styles.columns}`} aria-hidden>
        <span className={styles.columnPlayer}>{formatDef.teamStructure === "team" ? "Team / Player" : "Player"}</span>
        {showNet && <span>HCP</span>}
        <span>{isStableford ? "PTS" : "TOT"}</span>
        <span>THRU</span>
        <span>TDY</span>
      </div>
      <ul className={styles.lineup}>
        {rows.map(({ position, golfer, total, thru, today, netTotal, netToday, pointsTotal, pointsToday, holes }) => {
          const open = openCards.has(golfer.name);
          const cardId = `scorecard-${golfer.name.replace(/\W+/g, "-")}`;
          const totDisplay = isStableford ? (pointsTotal !== undefined ? `${pointsTotal} PTS` : total) : (showNet ? netTotal : total);
          const tdyDisplay = isStableford ? (pointsToday !== undefined ? `${pointsToday} PTS` : today) : (showNet ? netToday : today);
          return <li key={golfer.name} className={`${styles.single} ${showNet ? styles.singleNet : ""} ${open ? styles.singleOpen : ""}`}>
            <span className={styles.rank}>{position}</span>
            <button type="button" className={`${styles.cardButton} ${open ? styles.cardButtonOpen : ""}`} onClick={() => toggleCard(golfer.name)}
              aria-expanded={open} aria-controls={open ? cardId : undefined} aria-label={`${golfer.name} scorecard`}>CARD</button>
            <Golfer golfer={golfer} align="left" showThru={false} showHcp={false} />
            {showNet && <span className={styles.number} aria-label={`Handicap ${golfer.hcp}`}>{golfer.hcp}</span>}
            <span className={styles.number} aria-label={`Total ${totDisplay}`}>{totDisplay}</span>
            <span className={styles.number} aria-label={`Thru ${thru}`}>{thru}</span>
            <span className={styles.number} aria-label={`Today ${tdyDisplay}`}>{tdyDisplay}</span>
            {open && <Scorecard id={cardId} par={match.par} holes={holes} name={golfer.name} />}
          </li>;
        })}
      </ul>
    </div>
  </div>;
}

const scoreValue = (score: string) => {
  const clean = score.replace(/\s*PTS/i, "");
  return clean === "E" ? 0 : Number(clean) || 0;
};

/** Sorts by net score with "T" for ties (lowest first for stroke play, highest first for Stableford). */
function netRanked(rows: GolfLeaderboardEntry[], isStableford = false): GolfLeaderboardEntry[] {
  const sorted = [...rows].sort((a, b) => {
    const valA = scoreValue(a.netTotal);
    const valB = scoreValue(b.netTotal);
    return isStableford ? valB - valA : valA - valB;
  });
  return sorted.map((row) => {
    const value = scoreValue(row.netTotal);
    const place = sorted.findIndex((r) => scoreValue(r.netTotal) === value) + 1;
    const tied = sorted.filter((r) => scoreValue(r.netTotal) === value).length > 1;
    return { ...row, position: `${tied ? "T" : ""}${place}` };
  });
}

/**
 * Above the Golf slide tabs: the Match box for the featured matchup (first pair).
 */
export function GolfMatchup({ match, showDots }: { match: GolfMatchPreview; showDots: boolean }) {
  const [left, right] = match.sides;
  const featured = 0;
  const pairing: GolfMatchPairing | undefined = match.matches[featured];
  const leftComp = pairing ? normalizeCompetitor(pairing.left) : undefined;
  const rightComp = pairing?.right ? normalizeCompetitor(pairing.right) : leftComp;
  const gross = pairing?.gross ?? null;

  return <div className={styles.matchup}>
    <section className={styles.versus} aria-label="Match">
      <div className={styles.teams}>
        {leftComp && <PlayerSide competitor={leftComp} align="left" standing={gross} />}
        {leftComp && <span className={styles.boxStatus}><MatchStatus competitor={leftComp} plain /></span>}
        {rightComp && <PlayerSide competitor={rightComp} align="right" standing={gross} />}
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

/** Slide header: course name on left, round / format detail underneath; optional child controls on right. */
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

/** Status box between competitors on the Match slide, or bare cream text at the top of the Match box. */
function MatchStatus({ competitor, plain = false }: { competitor: GolfMatchCompetitor | GolfMatchGolfer; plain?: boolean }) {
  const comp = normalizeCompetitor(competitor);
  const thru = comp.thru || comp.golfers[0]?.thru || "";
  const teeTime = comp.teeTime || comp.golfers[0]?.teeTime || "";
  const className = plain ? `${styles.status} ${styles.statusPlain}` : `${styles.rank} ${styles.status}`;
  const holes = Number(thru.match(/^Thru (\d+)$/)?.[1]);
  if (thru === "F" || holes >= 18) return <span className={className} aria-label="Finished">F</span>;
  if (holes > 0) return <span className={className} aria-label={`Thru ${holes}`}>
    <small>THRU</small>{holes}
  </span>;
  const [time, period] = teeTime.split(" ");
  return <span className={className} aria-label={`Tees off ${teeTime}`}>
    {time}{period && <small>{period}</small>}
  </span>;
}

function ScoringSwitch({ net, onNet }: { net: boolean; onNet: (net: boolean) => void }) {
  return <div className={styles.scoring} role="group" aria-label="Scoring">
    <button type="button" aria-pressed={!net} className={!net ? styles.scoringActive : ""} onClick={() => onNet(false)}>GROSS</button>
    <button type="button" aria-pressed={net} className={net ? styles.scoringActive : ""} onClick={() => onNet(true)}>NET</button>
  </div>;
}

/** One golfer's scorecard popout table. */
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

/** Course weather preview card on Overview slide. */
export function GolfCourseWeather({ match }: { match: GolfMatchPreview }) {
  const formatDef = resolveGolfFormat(match.formatDef?.key ?? match.format);
  return <section className={styles.weather} aria-label="Course weather">
    <div className={styles.weatherTop}>
      <div className={styles.headerText}>
        <h3 className={styles.headerTitle}>{match.course}</h3>
        <p className={styles.headerDetail}>{roundDay(match.roundDate)} • Round {match.round} • {formatDef.label}</p>
      </div>
      <span className={styles.weatherTemp}>{GOLF_PREVIEW_COURSE_WEATHER.temperature}°</span>
    </div>
    <div className={styles.weatherStats}>
      {GOLF_PREVIEW_COURSE_WEATHER.stats.map(([label, value]) => <p key={label} className={styles.weatherStat}><span>{label}</span>{value}</p>)}
    </div>
    <div className={styles.weatherHours} aria-label="Hourly forecast">
      {GOLF_PREVIEW_COURSE_WEATHER.hours.map(([hour, temp]) => <p key={hour} className={styles.weatherHour}><span>{hour}</span>{temp}</p>)}
    </div>
    <p className={styles.weatherNote}>Sample forecast</p>
  </section>;
}

/** One half of the top Matchup box: avatar/initials, name, points or standing. */
function PlayerSide({ competitor, align, standing }: { competitor: GolfMatchCompetitor | GolfMatchGolfer; align: "left" | "right"; standing: GolfMatchStanding }) {
  const comp = normalizeCompetitor(competitor);
  const leading = standing?.leader === align;
  const label = !standing ? "" : standing.leader === null ? "AS" : leading ? `${standing.up} UP` : "";
  const name = comp.name || comp.golfers.map((g) => g.name).join(" & ");
  const points = comp.points ?? comp.golfers[0]?.points;

  return <div className={`${styles.side} ${styles[align]} ${leading ? styles.sideLeading : ""}`}>
    <span className={styles.boxStanding}>{label}</span>
    <span className={`${styles.avatar} ${align === "right" ? styles.avatarRight : ""}`}>{initials(name)}</span>
    <p className={styles.teamName}>{name}</p>
    {points !== undefined && <p className={styles.teamMeta}>{points} {points === 1 ? "PT" : "PTS"}</p>}
  </div>;
}

function initials(name: string): string {
  return name.split(/[\s.&/]+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function WinBar({ left, right }: { left: number; right: number }) {
  const fill = (pct: number) => `${Math.min(Math.max((pct - 50) * 2, 0), 100)}%`;
  const leader = left > right ? "left" : right > left ? "right" : null;
  return <div className={styles.win} role="img" aria-label={`Win probability ${left}% to ${right}%`}>
    <span className={`${styles.winPct} ${leader ? styles[`winPct_${leader}`] : ""}`} aria-hidden>
      {leader === "left" && <span className={styles.winArrow}>&lsaquo;</span>}
      {leader === "right" ? right : left}%
      {leader === "right" && <span className={styles.winArrow}>&rsaquo;</span>}
    </span>
    <div className={styles.winBar}>
      <span className={styles.winHalf}><span className={styles.winFillLeft} style={{ width: fill(left) }} /></span>
      <span className={styles.winHalf}><span className={styles.winFillRight} style={{ width: fill(right) }} /></span>
    </div>
  </div>;
}

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

function scoreMark(toPar: number): string {
  if (toPar <= -2) return `${styles.mark} ${styles.circle} ${styles.double}`;
  if (toPar === -1) return `${styles.mark} ${styles.circle}`;
  if (toPar === 1) return `${styles.mark} ${styles.box}`;
  if (toPar >= 2) return `${styles.mark} ${styles.box} ${styles.double}`;
  return styles.mark;
}
