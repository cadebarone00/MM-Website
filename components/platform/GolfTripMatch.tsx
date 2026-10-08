import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSwipe } from "./useSwipe";
import { resolveGolfFormat } from "@/lib/platform/formats";
import { rankLeaderboard } from "@/lib/platform/golfLeaderboardOrder";
import {
  GOLF_PREVIEW_COURSE_WEATHER,
  matchScoring,
  matchStatus,
  matchWinPct,
  normalizeCompetitor,
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
export function GolfTripMatch({ match: fullMatch, viewRound: shownRound }: { match: GolfMatchPreview; viewRound?: number }) {
  const [net, setNet] = useState(false);
  // Which round's matches: `viewRound` from the round picker under the big box (Golf tab), else this list's own picker.
  // Matches without a round count as the current round's.
  const [ownRound, setViewRound] = useState(fullMatch.round);
  const viewRound = shownRound ?? ownRound;
  // Swiping anywhere on the matches steps the round like the picker's arrows (left = next, right = previous).
  const swipe = useSwipe(() => setViewRound(round => Math.min(fullMatch.roundCount, round + 1)), () => setViewRound(round => Math.max(1, round - 1)));
  const match = { ...fullMatch, round: viewRound,
    matches: fullMatch.matches.filter(pairing => (pairing.round ?? fullMatch.round) === viewRound) };
  const roundLabel = viewRound === fullMatch.round ? "Current Round" : `Round ${viewRound}`;
  // Gross only: gross, no control. Net only: net, "Net Scoring". Both: the GROSS / NET switch.
  const scoring = matchScoring(match);
  const showNet = scoring === "Net" || (scoring === "Both" && net);
  const formatDef = resolveGolfFormat(match.formatDef?.key ?? match.format);
  const sideNames = match.matches.map(m => [normalizeCompetitor(m.left).name, m.right ? normalizeCompetitor(m.right).name : undefined]);
  // The two teams: the matches' own side names when every match is the same two, else the competition's two sides.
  const sameSides = sideNames.length && sideNames[0][0] && sideNames[0][1] && sideNames.every(([left, right]) => left === sideNames[0][0] && right === sideNames[0][1]);
  const teamNames = !match.matches.length ? null : sameSides ? [sideNames[0][0], sideNames[0][1]] as const
    : match.sides?.[0]?.name && match.sides[1]?.name ? [match.sides[0].name, match.sides[1].name] as const : null;

  return <div className={styles.match}>
    <SlideHeader title={match.course} detail={`Round ${match.round} of ${match.roundCount} • ${formatDef.label}`}>
      <ScoringControl scoring={scoring} net={net} onNet={setNet} />
    </SlideHeader>
    {/* The two teams' names once, above the matches, with this list's own round picker between them (it moves only the
        matches below; the picker under the big box moves only the box). */}
    {teamNames ? <div className={styles.teamNames}>
      <span>{teamNames[0]}</span>
      {shownRound === undefined && <RoundNav round={viewRound} current={fullMatch.round} count={fullMatch.roundCount} onRound={setViewRound} />}
      <span>{teamNames[1]}</span>
    </div> : shownRound === undefined && <RoundNav round={viewRound} current={fullMatch.round} count={fullMatch.roundCount} onRound={setViewRound} />}
    {!match.matches.length && <p className={styles.noMatches}>No matches set for {roundLabel === "Current Round" ? "this round" : roundLabel} yet.</p>}
    <ul className={`${styles.lineup} ${shownRound === undefined ? styles.swipeArea : ""}`} {...(shownRound === undefined ? swipe : {})}>
      {match.matches.map((m, i) => {
        const standing = showNet ? m.net : m.gross;
        const leftComp = normalizeCompetitor(m.left);
        const rightComp = m.right ? normalizeCompetitor(m.right) : undefined;
        // A finished match says its result in the middle, so the sides drop their own "2 UP" / "AS".
        const finished = matchStatus({ thru: leftComp.thru || leftComp.golfers[0]?.thru, standing, result: m.result }).kind === "final";
        return <li key={i} className={styles.pairing}>
          <MatchSide competitor={leftComp} side="left" standing={standing} hideLabel={finished} />
          {/* The middle: the match number in gold over its status (tee time, THRU, or the final result), no box. */}
          <span className={styles.matchCenter}>
            <span className={styles.matchNumber}>Match {i + 1}</span>
            <MatchStatus competitor={leftComp} plain standing={standing} result={m.result} />
          </span>
          {rightComp && <MatchSide competitor={rightComp} side="right" standing={standing} hideLabel={finished} />}
        </li>;
      })}
    </ul>
  </div>;
}

/** One competitor side's half of a match row: standing on outside, player(s) toward center. */
function MatchSide({ competitor, side, standing, hideLabel = false }: { competitor: GolfMatchCompetitor | GolfMatchGolfer; side: "left" | "right"; standing: GolfMatchStanding; hideLabel?: boolean }) {
  const comp = normalizeCompetitor(competitor);
  const leading = standing?.leader === side;
  const label = !standing || hideLabel ? "" : standing.leader === null ? "AS" : leading ? `${standing.up} UP` : "";
  const isMulti = comp.golfers.length > 1;

  return <div className={`${styles.pairSide} ${styles[side]} ${leading ? styles.leading : ""}`}>
    <span className={styles.standing}>{label}</span>
    {isMulti ? (
      <div className={`${styles.golfer} ${styles[side]}`}>
        {/* The side's players, one name per line (the team name sits above the matches). */}
        {comp.golfers.map((g) => <span key={g.name} className={styles.golferName}>{g.name}</span>)}
      </div>
    ) : (
      <Golfer golfer={comp.golfers[0]} align={side} showThru={false} showHcp={false} showTee={false} />
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
  const scoring = matchScoring(match);
  const showNet = scoring === "Net" || (scoring === "Both" && net);
  // Always best → worst (alphabetical by last name before anyone has a score), for Gross and Net alike.
  const rows = rankLeaderboard(match.leaderboard, { net: showNet, stableford: isStableford });

  function toggleCard(name: string) {
    setOpenCards((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  return <div className={styles.match}>
    <SlideHeader title={match.course} detail={`${roundDay(match.roundDate)} • Round ${match.round} • ${formatDef.label}`}>
      <ScoringControl scoring={scoring} net={net} onNet={setNet} />
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
          const totDisplay = isStableford ? (pointsTotal !== undefined ? `${pointsTotal} PTS` : total) : parLabel(showNet ? netTotal : total);
          const tdyDisplay = isStableford ? (pointsToday !== undefined ? `${pointsToday} PTS` : today) : parLabel(showNet ? netToday : today);
          return <li key={golfer.name} className={`${styles.single} ${showNet ? styles.singleNet : ""} ${open ? styles.singleOpen : ""}`}>
            <span className={styles.rank}>{position}</span>
            <button type="button" className={`${styles.cardButton} ${open ? styles.cardButtonOpen : ""}`} onClick={() => toggleCard(golfer.name)}
              aria-expanded={open} aria-controls={open ? cardId : undefined} aria-label={`${golfer.name} scorecard`}>CARD</button>
            <Golfer golfer={golfer} align="left" showThru={false} showHcp={false} />
            {showNet && <span className={styles.number} aria-label={`Handicap ${golfer.hcp}`}>{golfer.hcp}</span>}
            <span className={styles.number} data-par={isStableford ? undefined : parColor(totDisplay)} aria-label={`Total ${totDisplay}`}>{totDisplay}</span>
            <span className={styles.number} aria-label={`Thru ${thru}`}>{thru}</span>
            <span className={styles.number} data-par={isStableford ? undefined : parColor(tdyDisplay)} aria-label={`Today ${tdyDisplay}`}>{tdyDisplay}</span>
            {open && <Scorecard id={cardId} par={match.par} holes={holes} name={golfer.name} />}
          </li>;
        })}
      </ul>
    </div>
  </div>;
}

function parLabel(score: string): string {
  const value = score.trim() === "E" ? 0 : Number(score);
  if (!score.trim() || !Number.isFinite(value)) return score;
  return value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
}

function parColor(score: string): string | undefined {
  if (score === "E") return "even";
  if (score.startsWith("-")) return "under";
  if (score.startsWith("+")) return "over";
  return undefined;
}

/**
 * Above the Golf slide tabs: the Match box for the featured matchup (first pair).
 */
/** `compact`: tighter layout so it fits the Golf tab's top box (the same size as the tournament summary). */
/** ‹ label ›: the shared look of the round / match pickers. */
function StepNav({ label, name, value, count, onValue }: { label: string; name: string; value: number; count: number; onValue: (value: number) => void }) {
  return <div className={styles.roundNav} role="group" aria-label={name}>
    <button type="button" aria-label={`Previous ${name.toLowerCase()}`} disabled={value <= 1} onClick={() => onValue(Math.max(1, value - 1))}><ChevronLeft size={16} strokeWidth={2.5} aria-hidden /></button>
    <span aria-live="polite">{label}</span>
    <button type="button" aria-label={`Next ${name.toLowerCase()}`} disabled={value >= count} onClick={() => onValue(Math.min(count, value + 1))}><ChevronRight size={16} strokeWidth={2.5} aria-hidden /></button>
  </div>;
}

/** < Current Round >: steps to past rounds (their results) and future rounds (their matchups); "Round N" off the current one. */
export function RoundNav({ round, current, count, onRound }: { round: number; current: number; count: number; onRound: (round: number) => void }) {
  return <StepNav name="Round" label={round === current ? "Current Round" : `Round ${round}`} value={round} count={count} onValue={onRound} />;
}

/** < Match N >: steps through the round's matches (1-based). */
export function MatchNav({ match, count, onMatch }: { match: number; count: number; onMatch: (match: number) => void }) {
  return <StepNav name="Match" label={`Match ${match}`} value={match} count={count} onValue={onMatch} />;
}

export function GolfMatchup({ match, compact = false, below, swipe, featured = 0 }: {
  match: GolfMatchPreview; compact?: boolean; below?: ReactNode; swipe?: ReturnType<typeof useSwipe>;
  /** Which of the round's matches the box shows (0-based). */
  featured?: number;
}) {
  const [left, right] = match.sides;
  const pairing: GolfMatchPairing | undefined = match.matches[featured];
  const leftComp = pairing ? normalizeCompetitor(pairing.left) : undefined;
  const rightComp = pairing?.right ? normalizeCompetitor(pairing.right) : leftComp;
  const gross = pairing?.gross ?? null;
  // The box is about the chosen match: its own win chances and stats when the data has them; otherwise win chances from
  // its standing and no stats yet ("—"). Without any match, the competition's two sides.
  const status = pairing && leftComp ? matchStatus({ thru: leftComp.thru || leftComp.golfers[0]?.thru, standing: gross, result: pairing.result }) : null;
  const leftPct = status ? matchWinPct(gross, status.kind === "thru" ? status.holes : status.kind === "final" ? 18 : 0, status.kind === "final") : left.winPct;
  const blank = (side: GolfMatchSide, name: string, winPct: number): GolfMatchSide => ({ ...side, name, winPct, fairwayPct: "—", greenPct: "—", putts: "—", score: "—" });
  const [boxLeft, boxRight] = pairing?.sides ?? (pairing && leftComp
    ? [blank(left, leftComp.name ?? left.name, leftPct), blank(right, rightComp?.name ?? right.name, 100 - leftPct)]
    : [left, right]);

  return <div className={`${styles.matchup} ${compact ? styles.matchupCompact : ""}`}>
    <section className={styles.versus} aria-label="Match" {...swipe}>
      <div className={styles.teams}>
        {leftComp && <PlayerSide competitor={leftComp} align="left" standing={gross} />}
        {leftComp && <span className={styles.boxStatus}><MatchStatus competitor={leftComp} plain standing={gross} result={pairing?.result} /></span>}
        {rightComp && <PlayerSide competitor={rightComp} align="right" standing={gross} />}
      </div>
      <div className={styles.stats}>
        <WinBar left={boxLeft.winPct} right={boxRight.winPct} />
        <RoundStats side={boxLeft} align="left" />
        <RoundStats side={boxRight} align="right" />
      </div>
    </section>

    {/* Under the big box: the round picker (where the match ovals used to be). */}
    {below}
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
/**
 * Top box on Overview: the whole tournament at a glance — both teams with their overall score, where the event is
 * (round N of M), the win % bar and team stats. Same box as the round matchup card on Competition.
 */
export function GolfTournamentSummary({ match }: { match: GolfMatchPreview }) {
  const [left, right] = match.sides;
  return <div className={styles.matchup}>
    <section className={styles.versus} aria-label="Tournament standings">
      <p className={styles.summaryLabel}>Tournament · Round {match.round} of {match.roundCount}</p>
      <div className={styles.summaryTeams}>
        {[left, right].map((side, i) => <div key={side.name} className={i ? styles.summaryRight : ""}>
          <p className={styles.teamName}>{side.name}</p>
          <p className={styles.summaryScore}>{side.score || "—"}</p>
        </div>)}
      </div>
      <div className={styles.stats}>
        <WinBar left={left.winPct} right={right.winPct} />
        <RoundStats side={left} align="left" />
        <RoundStats side={right} align="right" />
      </div>
    </section>
  </div>;
}

/** A "8:30 AM"-style time as minutes after midnight, for ordering tee times (unknown times go last). */
function teeMinutes(time: string): number {
  const found = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(time.trim());
  if (!found) return Number.MAX_SAFE_INTEGER;
  return (Number(found[1]) % 12 + (found[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(found[2]);
}

/**
 * Top box on Overview with no competition: just the day's round — the course, then each tee time with who's in it.
 * Players who chose Sit out for this round are left off.
 */
export function GolfRoundInfo({ match, sittingOut }: { match: GolfMatchPreview; sittingOut?: ReadonlySet<string> }) {
  const groups = new Map<string, string[]>();
  for (const { golfer } of match.leaderboard) {
    if (sittingOut?.has(golfer.name)) continue;
    const time = golfer.teeTime || "Tee time TBD";
    groups.set(time, [...(groups.get(time) ?? []), golfer.name]);
  }
  const teeTimes = [...groups].sort(([a], [b]) => teeMinutes(a) - teeMinutes(b));
  return <div className={styles.matchup}>
    <section className={`${styles.versus} ${styles.roundInfo}`} aria-label="Today's round">
      <p className={styles.summaryLabel}>{roundDay(match.roundDate)} · Round {match.round} of {match.roundCount}</p>
      <p className={styles.roundInfoCourse}>{match.course}</p>
      {teeTimes.length ? <ul className={styles.roundInfoTimes}>
        {teeTimes.map(([time, players]) => <li key={time}>
          <span className={styles.roundInfoTime}>{time}</span>
          <span className={styles.roundInfoPlayers}>{players.join(", ")}</span>
        </li>)}
      </ul> : <p className={styles.summaryNote}>No one is playing this round yet.</p>}
    </section>
  </div>;
}

/** Top box on Games: placeholder until the games leaderboard exists. */
export function GolfGamesSummary() {
  return <div className={styles.matchup}>
    <section className={`${styles.versus} ${styles.summaryPlaceholder}`} aria-label="Games leaderboard">
      <p className={styles.summaryLabel}>Games leaderboard</p>
      <p className={styles.teamName}>Coming soon</p>
      <p className={styles.summaryNote}>Standings for your side games will show here.</p>
    </section>
  </div>;
}

export function roundDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Status box between competitors on the Match slide, or bare cream text at the top of the Match box. */
function MatchStatus({ competitor, plain = false, standing = null, result }: {
  competitor: GolfMatchCompetitor | GolfMatchGolfer; plain?: boolean; standing?: GolfMatchStanding; result?: string;
}) {
  const comp = normalizeCompetitor(competitor);
  const className = plain ? `${styles.status} ${styles.statusPlain}` : `${styles.rank} ${styles.status}`;
  // Tee time before the round, THRU and holes played during it, the final result ("4&2", "1 UP", "AS") after.
  const status = matchStatus({ thru: comp.thru || comp.golfers[0]?.thru, teeTime: comp.teeTime || comp.golfers[0]?.teeTime, standing, result });
  if (status.kind === "final") return <span className={`${className} ${styles.statusFinal}`} aria-label={`Final ${status.text}`}>{status.text}</span>;
  if (status.kind === "thru") return <span className={className} aria-label={`Thru ${status.holes}`}>
    <small>THRU</small>{status.holes}
  </span>;
  const teeTime = status.time;
  const [time, period] = teeTime.split(" ");
  return <span className={className} aria-label={`Tees off ${teeTime}`}>
    {time}{period && <small>{period}</small>}
  </span>;
}

/** The header's scoring control: nothing for Gross only, a "Net Scoring" label for Net only, the switch for Both. */
function ScoringControl({ scoring, net, onNet }: { scoring: "Gross" | "Net" | "Both"; net: boolean; onNet: (net: boolean) => void }) {
  if (scoring === "Gross") return null;
  if (scoring === "Net") return <span className={styles.scoringLabel}>Net Scoring</span>;
  return <ScoringSwitch net={net} onNet={onNet} />;
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
  // This match's players, one per line (a team name only when there are no players listed).
  const players = comp.golfers.map((g) => g.name);
  const name = players.length ? players.join(" & ") : comp.name ?? "";
  const points = comp.points ?? comp.golfers[0]?.points;

  return <div className={`${styles.side} ${styles[align]} ${leading ? styles.sideLeading : ""}`}>
    <span className={styles.boxStanding}>{label}</span>
    <span className={`${styles.avatar} ${align === "right" ? styles.avatarRight : ""}`}>{players.length > 1 ? players.map(player => player[0]).join("").slice(0, 2).toUpperCase() : initials(name)}</span>
    {players.length > 1 ? players.map(player => <p key={player} className={styles.teamName}>{player}</p>) : <p className={styles.teamName}>{name}</p>}
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

function Golfer({ golfer, align, showThru = true, showHcp = true, showTee = true }:
  { golfer: GolfMatchGolfer; align: "left" | "right"; showThru?: boolean; showHcp?: boolean; showTee?: boolean }) {
  return <div className={`${styles.golfer} ${styles[align]}`}>
    <span className={styles.golferName}>{golfer.name}</span>
    {(showHcp || showThru) && <span className={styles.golferMeta}>
      {showHcp && <span className={styles.hcp}>HCP {golfer.hcp}</span>}{showHcp && showThru && " • "}{showThru && golfer.thru}
    </span>}
    {showTee && <span className={styles.tee}>{golfer.teeTime} <span className={styles.course}>@ {golfer.course}</span></span>}
  </div>;
}

function scoreMark(toPar: number): string {
  if (toPar <= -2) return `${styles.mark} ${styles.circle} ${styles.double}`;
  if (toPar === -1) return `${styles.mark} ${styles.circle}`;
  if (toPar === 1) return `${styles.mark} ${styles.box}`;
  if (toPar >= 2) return `${styles.mark} ${styles.box} ${styles.double}`;
  return styles.mark;
}
