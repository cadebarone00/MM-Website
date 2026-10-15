import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
import { MatchDraftStatus } from "./MatchDraftStatus";

/**
 * Golf tab, Sleeper's fantasy Match screen translated to golf, on the trip's maroon.
 * Dynamic presentation adapts to format metadata (Singles, Fourball, Alternate Shot, Scramble, Stableford).
 * GolfMatchup (round dots + team card) sits above the Golf slide tabs;
 * the Match and Leaderboard slides below them each show their own header control and rows.
 */
/** `roundStarted`: the organizer has begun the current round (its matches show THRU rather than tee times). */
export function GolfTripMatch({ match: fullMatch, viewRound: shownRound, roundStarted = false, draftScope }: { match: GolfMatchPreview; viewRound?: number; roundStarted?: boolean; draftScope?: string }) {
  const [net, setNet] = useState(false);
  // Which round's matches: `viewRound` from the round picker under the big box (Golf tab), else this list's own picker.
  // Matches without a round count as the current round's.
  const [ownRound, setViewRound] = useState(fullMatch.round);
  const viewRound = shownRound ?? ownRound;
  // Swiping anywhere on the matches steps the round like the picker's arrows (left = next, right = previous).
  const swipe = useSwipe(() => setViewRound(round => Math.min(fullMatch.roundCount, round + 1)), () => setViewRound(round => Math.max(1, round - 1)));
  const match = { ...fullMatch, round: viewRound,
    matches: fullMatch.matches.filter(pairing => (pairing.round ?? fullMatch.round) === viewRound) };
  // Gross only: gross, no control. Net only: net, "Net Scoring". Both: the GROSS / NET switch.
  const scoring = matchScoring(match);
  const showNet = scoring === "Net" || (scoring === "Both" && net);
  const sideNames = match.matches.map(m => [normalizeCompetitor(m.left).name, m.right ? normalizeCompetitor(m.right).name : undefined]);
  // The two teams: the matches' own side names when every match is the same two, else (or with no matches set yet) the
  // competition's two sides.
  const sameSides = sideNames.length && sideNames[0][0] && sideNames[0][1] && sideNames.every(([left, right]) => left === sideNames[0][0] && right === sideNames[0][1]);
  const teamNames = !match.matches.length ? (match.sides?.[0]?.name && match.sides[1]?.name ? [match.sides[0].name, match.sides[1].name] as const : null) : sameSides ? [sideNames[0][0], sideNames[0][1]] as const
    : match.sides?.[0]?.name && match.sides[1]?.name ? [match.sides[0].name, match.sides[1].name] as const : null;

  return <div className={`${styles.match} ${styles.matchesList}`}>
    {scoring !== "Gross" && <div className={styles.matchScoringControl}>
      <ScoringControl scoring={scoring} net={net} onNet={setNet} />
    </div>}
    {/* The two teams' names once, above the matches, with this list's own round picker between them (it moves only the
        matches below; the picker under the big box moves only the box). */}
    {teamNames ? <div className={styles.teamNames}>
      <span>{teamNames[0]}</span>
      {shownRound === undefined && <RoundNav round={viewRound} current={fullMatch.round} count={fullMatch.roundCount} onRound={setViewRound} />}
      <span>{teamNames[1]}</span>
    </div> : shownRound === undefined && <RoundNav round={viewRound} current={fullMatch.round} count={fullMatch.roundCount} onRound={setViewRound} />}
    <ul className={`${styles.lineup} ${shownRound === undefined ? styles.swipeArea : ""}`} {...(shownRound === undefined ? swipe : {})}>
      {match.matches.map((m, i) => {
        const standing = showNet ? m.net : m.gross;
        const leftComp = normalizeCompetitor(m.left);
        const rightComp = m.right ? normalizeCompetitor(m.right) : undefined;
        const status = pairingStatus(leftComp, rightComp, standing, m.result, roundStarted && viewRound === fullMatch.round);
        // Before the match starts, no lead fill.
        const shown = status.kind === "tee" ? null : standing;
        return <li key={i} className={styles.pairing}>
          <MatchSide competitor={leftComp} side="left" standing={shown} score={sideScore(status, shown, "left")} />
          {/* The middle: the match number in gold over its status (TEE TIME, THRU), no box. */}
          <span className={styles.matchCenter}>
            <span className={styles.matchNumber}>Match {i + 1}</span>
            <MatchStatus status={status} plain />
          </span>
          {rightComp && <MatchSide competitor={rightComp} side="right" standing={shown} score={sideScore(status, shown, "right")} />}
        </li>;
      })}
      {/* No matches set for this round yet: the same row, with placeholders. */}
      {!match.matches.length && <MatchDraftStatus scope={draftScope} round={viewRound} />}
    </ul>
  </div>;
}

/**
 * The match score a side shows at the inner middle of its half (its lead fill): the leader's "2 UP" while playing or its
 * result ("4&3", "1 UP") once over; "AS" on both sides when neither leads. Nothing before the match starts.
 */
function sideScore(status: ReturnType<typeof matchStatus>, standing: GolfMatchStanding, side: "left" | "right"): string {
  if (status.kind === "tee" || (status.kind === "thru" && status.holes === 0)) return "";
  if (status.kind === "final") return status.text === "AS" ? "AS" : standing?.leader === side ? status.text : "";
  return standing?.leader === null ? "AS" : standing?.leader === side ? `${standing.up} UP` : "";
}

/** A "Thru 12" / "F" as holes done (F = 18; anything else = 0). */
function holesDone(thru: string | undefined): number {
  return thru === "F" ? 18 : Number(/^Thru (\d+)$/.exec(thru ?? "")?.[1]) || 0;
}

/**
 * A match's status for its middle: the last hole every player in it has finished (so THRU only moves once both sides
 * have the hole), the left side's tee time before it starts, THRU once `started` even with no hole done.
 */
function pairingStatus(left: GolfMatchCompetitor, right: GolfMatchCompetitor | undefined, standing: GolfMatchStanding, result: string | undefined, started: boolean) {
  const players = [left, right].flatMap(side => !side ? [] : side.thru ? [side.thru] : side.golfers.map(golfer => golfer.thru));
  const holes = players.length ? Math.min(...players.map(holesDone)) : 0;
  return matchStatus({ thru: holes >= 18 ? "F" : holes ? `Thru ${holes}` : "", teeTime: left.teeTime || left.golfers[0]?.teeTime, standing, result, started });
}

/** One competitor side's half of a match row: player(s) against its edge of the screen, the match score toward center. */
function MatchSide({ competitor, side, standing, score }: { competitor: GolfMatchCompetitor | GolfMatchGolfer; side: "left" | "right"; standing: GolfMatchStanding; score: string }) {
  const comp = normalizeCompetitor(competitor);
  const leading = standing?.leader === side;
  const isMulti = comp.golfers.length > 1;

  return <div className={`${styles.pairSide} ${styles[side]} ${leading ? styles.leading : ""}`}>
    <span className={styles.standing}>{score}</span>
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
/** `byToday` (no competition): ranked by the day's score, best first, rather than the trip total. */
export function GolfTripLeaderboard({ match, byToday = false }: { match: GolfMatchPreview; byToday?: boolean }) {
  const leaderboardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = leaderboardRef.current;
    if (!list) return;
    let previousY: number | null = null, stretch = 0;
    const scrollContainer = () => {
      for (let parent = list.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
      }
      return document.scrollingElement as HTMLElement;
    };
    const start = (event: TouchEvent) => {
      previousY = event.touches.length === 1 ? event.touches[0].clientY : null;
      stretch = 0;
      list.style.transition = "none";
    };
    const move = (event: TouchEvent) => {
      if (previousY === null || event.touches.length !== 1) return;
      const y = event.touches[0].clientY, delta = y - previousY;
      previousY = y;
      const container = scrollContainer();
      const atTop = container.scrollTop <= 0;
      const atBottom = container.scrollTop >= container.scrollHeight - container.clientHeight - 1;
      if (!stretch && !((atTop && delta > 0) || (atBottom && delta < 0))) return;
      event.preventDefault();
      stretch += delta;
      list.style.translate = `0 ${Math.sign(stretch) * 60 * (1 - Math.exp(-Math.abs(stretch) / 140))}px`;
    };
    const release = () => {
      previousY = null; stretch = 0;
      list.style.transition = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "translate 380ms cubic-bezier(.2,.85,.25,1.15)";
      list.style.translate = "0 0";
    };
    list.addEventListener("touchstart", start, { passive: true });
    list.addEventListener("touchmove", move, { passive: false });
    list.addEventListener("touchend", release);
    list.addEventListener("touchcancel", release);
    return () => {
      list.removeEventListener("touchstart", start); list.removeEventListener("touchmove", move);
      list.removeEventListener("touchend", release); list.removeEventListener("touchcancel", release);
    };
  }, []);
  const [net, setNet] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const formatDef = resolveGolfFormat(match.formatDef?.key ?? match.format);
  const isStableford = formatDef.scoringMethod === "stableford";
  const scoring = matchScoring(match);
  const showNet = scoring === "Net" || (scoring === "Both" && net);
  // Always best → worst (alphabetical by last name before anyone has a score), for Gross and Net alike.
  const rows = rankLeaderboard(match.leaderboard, { net: showNet, stableford: isStableford, today: byToday });

  const selectedCard = rows.find(row => row.golfer.name === selectedPlayer);

  return <div ref={leaderboardRef} className={`${styles.match} ${styles.leaderboard}`}>
    {/* The course / round line sits at the top of the Golf tab (GolfRoundHeader); here only the Gross / Net control. */}
    {scoring !== "Gross" && <div className={`${styles.lineupHeader} ${styles.scoringRow}`}>
      <ScoringControl scoring={scoring} net={net} onNet={setNet} />
    </div>}
    <div>
      <div className={`${styles.single} ${showNet ? styles.singleNet : ""} ${styles.columns}`} aria-hidden>
        <span className={styles.columnPlayer} />
        {showNet && <span>HCP</span>}
        <span className={styles.columnLabel}>{isStableford ? "PTS" : "TOT"}</span>
        <span className={styles.columnLabel}>THRU</span>
        <span className={styles.columnLabel}>TDY</span>
      </div>
      <ul className={styles.lineup}>
        {rows.map(({ position, golfer, total, thru, today, netTotal, netToday, pointsTotal, pointsToday }) => {


          const totDisplay = isStableford ? (pointsTotal !== undefined ? `${pointsTotal} PTS` : total) : parLabel(showNet ? netTotal : total);
          const tdyDisplay = isStableford ? (pointsToday !== undefined ? `${pointsToday} PTS` : today) : parLabel(showNet ? netToday : today);
          return <li key={golfer.name} className={`${styles.single} ${showNet ? styles.singleNet : ""}`}>
            <span className={styles.rank}>{position}</span>
            <button type="button" className={styles.playerCardTrigger} onClick={() => setSelectedPlayer(golfer.name)} aria-haspopup="dialog" aria-label={golfer.name + " public trip profile"}>
              <Golfer golfer={golfer} align="left" showThru={false} showHcp={false} />
            </button>
            {showNet && <span className={styles.number} aria-label={`Handicap ${golfer.hcp}`}>{golfer.hcp}</span>}
            <span className={styles.number} data-par={isStableford ? undefined : parColor(totDisplay)} aria-label={`Total ${totDisplay}`}>{totDisplay}</span>
            <span className={styles.number} aria-label={`Thru ${thru}`}>{thru}</span>
            <span className={styles.number} data-par={isStableford ? undefined : parColor(tdyDisplay)} aria-label={`Today ${tdyDisplay}`}>{tdyDisplay}</span>

          </li>;
        })}
      </ul>
    </div>
    {selectedCard && <PlayerPublicTripProfile key={match.round + selectedCard.golfer.name} name={selectedCard.golfer.name} round={match.round} roundCount={match.roundCount} par={match.par} holes={selectedCard.holes} snapshot={{ position: selectedCard.position, total: parLabel(showNet ? selectedCard.netTotal : selectedCard.total), roundScore: parLabel(showNet ? selectedCard.netToday : selectedCard.today), thru: selectedCard.thru }} onClose={() => setSelectedPlayer(null)} />}
  </div>;
}

function PlayerPublicTripProfile({ name, round, roundCount, par, holes, snapshot, onClose }: { name: string; round: number; roundCount: number; par: number[]; holes: (number | null)[]; snapshot: { position: string; total: string; roundScore: string; thru: string }; onClose: () => void }) {
  const [selectedRound, setSelectedRound] = useState(round);
  const roundTabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = roundTabsRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (strip && active) strip.scrollTo({ left: active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [selectedRound]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(<dialog ref={dialogRef} className={styles.leaderboardScoreSheet} aria-label={name + " public trip profile"} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientY < r.top || event.clientX < r.left || event.clientX > r.right) onClose(); } }}>
    <div className={styles.playerTripProfileHeader}>
      <div className={styles.scoreSheetHandle} aria-hidden />
      <div className={styles.scoreSheetHeading}><div><p className={styles.playerTripProfileLabel}>Player public trip profile</p><h2>{name}</h2></div><button type="button" onClick={onClose} autoFocus aria-label="Close player profile"><X size={18} strokeWidth={2.25} aria-hidden /></button></div>
    </div>
    <div ref={roundTabsRef} className={styles.profileRoundTabs} role="tablist" aria-label="Player rounds">
      {Array.from({ length: Math.max(roundCount, round) }, (_, index) => index + 1).map(number => <button key={number} type="button" role="tab" id={"profile-round-tab-" + number} aria-controls="profile-round-panel" aria-selected={selectedRound === number} onClick={() => setSelectedRound(number)}>Round {number}</button>)}
    </div>
    <section id="profile-round-panel" className={styles.playerTripProfileScorecard} role="tabpanel" aria-labelledby={"profile-round-tab-" + selectedRound}>
      <Scorecard id="leaderboard-player-scorecard" par={selectedRound === round ? par : []} holes={selectedRound === round ? holes : Array<null>(18).fill(null)} name={name} />
      {selectedRound !== round && <p className={styles.profileRoundEmpty}>Scores for this round are not available.</p>}
    </section>
    <section className={styles.profileRoundSnapshot} aria-label="Round snapshot">
      <div className={styles.snapshotSections}>
        <div className={styles.snapshotColumn} role="group" aria-label={"Round " + selectedRound + " snapshot"}>
          <h4>Round {selectedRound}</h4>
          <dl className={styles.snapshotPill}>
            <div><dt>+/&minus;</dt><dd>{selectedRound === round ? snapshot.roundScore || "\u2014" : "\u2014"}</dd></div>
            <div><dt>Thru</dt><dd>{selectedRound === round ? snapshot.thru || "\u2014" : "\u2014"}</dd></div>
          </dl>
        </div>
        <span className={styles.snapshotDivider} aria-hidden />
        <div className={styles.snapshotColumn} role="group" aria-label="Overall snapshot">
          <h4>Overall</h4>
          <dl className={styles.snapshotPill}>
            <div><dt>Position</dt><dd>{snapshot.position || "\u2014"}</dd></div>
            <div><dt>+/&minus;</dt><dd>{snapshot.total || "\u2014"}</dd></div>
          </dl>
        </div>
      </div>
    </section>
  </dialog>, document.body);
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

export function GolfMatchup({ match, compact = false, below, swipe, featured = 0, roundStarted = false }: {
  match: GolfMatchPreview; compact?: boolean; below?: ReactNode; swipe?: ReturnType<typeof useSwipe>;
  /** Which of the round's matches the box shows (0-based). */
  featured?: number;
  /** The organizer has begun this round: THRU rather than the tee time. */
  roundStarted?: boolean;
}) {
  const [left, right] = match.sides;
  const pairing: GolfMatchPairing | undefined = match.matches[featured];
  const leftComp = pairing ? normalizeCompetitor(pairing.left) : undefined;
  const rightComp = pairing?.right ? normalizeCompetitor(pairing.right) : leftComp;
  const gross = pairing?.gross ?? null;
  // The box is about the chosen match: its own win chances and stats when the data has them; otherwise win chances from
  // its standing and no stats yet ("—"). Without any match, the competition's two sides.
  const status = pairing && leftComp ? pairingStatus(leftComp, pairing.right ? rightComp : undefined, gross, pairing.result, roundStarted) : null;
  // Before the match starts, no lead fill.
  const shown = status?.kind === "tee" ? null : gross;
  const leftPct = status ? matchWinPct(gross, status.kind === "thru" ? status.holes : status.kind === "final" ? 18 : 0, status.kind === "final") : left.winPct;
  const blank = (side: GolfMatchSide, name: string, winPct: number): GolfMatchSide => ({ ...side, name, winPct, fairwayPct: "—", greenPct: "—", putts: "—", score: "—" });
  const [boxLeft, boxRight] = pairing?.sides ?? (pairing && leftComp
    ? [blank(left, leftComp.name ?? left.name, leftPct), blank(right, rightComp?.name ?? right.name, 100 - leftPct)]
    : [blank(left, left.name, 50), blank(right, right.name, 50)]);

  return <div className={`${styles.matchup} ${compact ? styles.matchupCompact : ""}`}>
    <section className={`${styles.versus} ${compact ? styles.boardBox : ""}`} aria-label="Match" {...swipe}>
      <div className={styles.teams}>
        {leftComp ? <>
          <PlayerSide competitor={leftComp} align="left" standing={shown} score={status ? sideScore(status, shown, "left") : ""} />
          <span className={styles.boxStatus}>{status && <MatchStatus status={status} plain />}</span>
          {rightComp && <PlayerSide competitor={rightComp} align="right" standing={shown} score={status ? sideScore(status, shown, "right") : ""} />}
        </> : <>
          {/* No match set yet: the same box with placeholders. */}
          <div className={`${styles.side} ${styles.left}`}><p className={styles.teamName}>TBD</p></div>
          <span className={styles.boxStatus}><span className={`${styles.status} ${styles.statusPlain}`} aria-label="Not set yet">—</span></span>
          <div className={`${styles.side} ${styles.right}`}><p className={styles.teamName}>TBD</p></div>
        </>}
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
      {/* Never more than 2 lines: longer names a little smaller, anything still too long ends in "…". */}
      <h3 className={styles.headerTitle} title={title} data-length={title.length > 40 ? "longer" : title.length > 26 ? "long" : undefined}>{title}</h3>
      <p className={styles.headerDetail}>{detail}</p>
    </div>
    {children}
  </div>;
}

/** Top of the Golf tab: the course, with the round's day, number and format under it. */
export function GolfRoundHeader({ match, competitive = true, today, day, previousDisabled, nextDisabled, onPrevious, onNext }: {
  match: GolfMatchPreview; competitive?: boolean; today?: string; day?: number;
  previousDisabled?: boolean; nextDisabled?: boolean; onPrevious?: () => void; onNext?: () => void;
}) {
  const formatDef = resolveGolfFormat(match.formatDef?.key ?? match.format);
  const [localToday] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  return <header className={styles.golfRoundHeader}>
    <button type="button" className={styles.golfCourseArrow} aria-label="Previous golf round" disabled={previousDisabled || !onPrevious} onClick={onPrevious}><ChevronLeft size={22} aria-hidden /></button>
    <div className={styles.golfCourseText}>
      <p className={styles.headerDetail}>{match.roundDate === (today ?? localToday) && <span>(Today) </span>}{roundDay(match.roundDate)}</p>
      <h3 className={styles.headerTitle} title={match.course}><span className={styles.courseNameMeasure}>{match.course}</span></h3>
      <p className={styles.headerDetail}>{day !== undefined && <>Day {day}{competitive && " \u00b7 "}</>}{competitive && <>Round {match.round} &middot; {formatDef.label}</>}</p>
    </div>
    <button type="button" className={styles.golfCourseArrow} aria-label="Next golf round" disabled={nextDisabled || !onNext} onClick={onNext}><ChevronRight size={22} aria-hidden /></button>
  </header>;
}

/** "2027-04-23" → "Fri, Apr 23" (read as a calendar date, so no time zone can shift it). */
/**
 * Top box on Overview: the whole tournament at a glance — both teams with their overall score (names in the top
 * corners), the win % bar and team stats. Same box as the round matchup card on Competition.
 */
export function GolfTournamentSummary({ match, onPredict }: { match: GolfMatchPreview; onPredict?: () => void }) {
  const [left, right] = match.sides;
  // Tapping the team boxes drops down every player's match points, best first (owner request 2026-10-15).
  const [pointsOpen, setPointsOpen] = useState(false);
  const ranking = pointsOpen ? playerPoints(match) : [];
  return <div className={styles.matchup} data-points-open={pointsOpen || undefined}>
    <section className={`${styles.versus} ${styles.boardBox}`} aria-label="Tournament standings">
      <div className={`${styles.summaryTeams} ${styles.summaryTap}`} role="button" tabIndex={0} aria-expanded={pointsOpen} aria-label="Points by player"
        onClick={() => setPointsOpen(!pointsOpen)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPointsOpen(!pointsOpen); } }}>
        {/* Each team sits in its own color fill (like a lead fill, but always there) from its edge in toward TO WIN. */}
        {[left, right].map((side, i) => <div key={side.name} className={`${styles.summaryFill} ${i ? `${styles.summaryRight} ${styles.summaryFillRight}` : styles.summaryFillLeft}`}>
          <FitName name={side.name} />
          <p className={styles.summaryScore}>{side.score || "—"}</p>
          {/* Open: the box extends down with this team's players, most points first. */}
          {pointsOpen && <ol className={styles.teamPoints} aria-label={`${side.name} points by player`}>
            {ranking.filter((row) => row.side === (i ? "right" : "left")).map((row) => <li key={row.name}><span>{row.name}</span><b>{row.points}</b></li>)}
          </ol>}
        </div>)}
        {/* Between the teams, like THRU on the Matches box: the points needed to win (not wired up yet). */}
        <span className={`${styles.status} ${styles.statusPlain} ${styles.summaryToWin}`} aria-label="Points to win">
          <small>TO WIN</small>—
        </span>
      </div>
      <div className={styles.stats}>
        <WinBar left={left.winPct} right={right.winPct} />
        {onPredict ? <div className={styles.predictRow}>
          <SummaryStats align="left" />
          <button type="button" className={styles.predictPill} onClick={onPredict}>Predict</button>
          <SummaryStats align="right" />
        </div> : <><RoundStats side={left} align="left" /><RoundStats side={right} align="right" /></>}
      </div>
    </section>
  </div>;
}

/**
 * Each player's match points across the trip's matches, best first: the points the data gives a side, otherwise a
 * finished match is worth 1 to each winner and ½ each when halved (net standing when the round is net only).
 */
function playerPoints(match: GolfMatchPreview): { name: string; side: "left" | "right"; points: number }[] {
  const totals = new Map<string, { name: string; side: "left" | "right"; points: number }>();
  const net = matchScoring(match) === "Net";
  for (const pairing of match.matches) {
    const sides = [normalizeCompetitor(pairing.left), pairing.right ? normalizeCompetitor(pairing.right) : null] as const;
    const standing = net ? pairing.net : pairing.gross;
    const status = matchStatus({ thru: sides[0].thru ?? sides[0].golfers[0]?.thru, standing, result: pairing.result });
    sides.forEach((side, i) => {
      if (!side) return;
      const key = i ? "right" : "left";
      const earned = side.points ?? side.golfers[0]?.points ?? (status.kind !== "final" ? 0
        : standing?.leader == null ? 0.5 : standing.leader === key ? 1 : 0);
      for (const golfer of side.golfers) {
        const row = totals.get(golfer.name) ?? { name: golfer.name, side: key, points: 0 };
        row.points += earned;
        totals.set(golfer.name, row);
      }
    });
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/**
 * A team name in its fill: one line as large as fits the fill's width (20px down to 15px); if even 15px can't hold it,
 * two 14px lines (cut off after the second). Re-measured whenever the fill's width changes.
 */
function FitName({ name }: { name: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      element.removeAttribute("data-fit");
      for (let size = 20; size >= 15; size--) {
        element.style.fontSize = `${size}px`;
        if (element.scrollWidth <= element.clientWidth) return;
      }
      element.style.fontSize = "";
      element.setAttribute("data-fit", "wrap");
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element.parentElement ?? element);
    return () => observer.disconnect();
  }, [name]);
  return <p ref={ref} className={styles.teamName} title={name}>{name}</p>;
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
 * `topFive` (individual only): the box splits down the middle — the round on the left, the leaderboard's top 5 on the right.
 */
export function GolfRoundInfo({ match, sittingOut, topFive = false }: { match: GolfMatchPreview; sittingOut?: ReadonlySet<string>; topFive?: boolean }) {
  const teeTimes = teeSheet(match, sittingOut).map(([time, golfers]) => [time, golfers.map(golfer => golfer.name)] as const);
  const round = <>
    {/* Split (half width): the date and the round on their own lines rather than wrapping mid-phrase. */}
    <p className={styles.summaryLabel}>{roundDay(match.roundDate)}{topFive ? <br /> : " · "}Round {match.round} of {match.roundCount}</p>
    <p className={styles.roundInfoCourse}>{match.course}</p>
    {teeTimes.length ? <ul className={styles.roundInfoTimes}>
      {teeTimes.map(([time, players]) => <li key={time}>
        <span className={styles.roundInfoTime}>{time}</span>
        <span className={styles.roundInfoPlayers}>{players.join(", ")}</span>
      </li>)}
    </ul> : <p className={styles.summaryNote}>No one is playing this round yet.</p>}
  </>;
  if (!topFive) return <div className={styles.matchup}>
    <section className={`${styles.versus} ${styles.roundInfo}`} aria-label="Today's round">{round}</section>
  </div>;
  // The leaderboard's order (best first, ties shown as T2), its first five; points for Stableford, else to par.
  const stableford = resolveGolfFormat(match.formatDef?.key ?? match.format).scoringMethod === "stableford";
  const leaders = rankLeaderboard(match.leaderboard, { stableford }).slice(0, 5);
  return <div className={styles.matchup}>
    <section className={`${styles.versus} ${styles.roundInfo} ${styles.roundInfoSplit}`} aria-label="Today's round and top 5">
      <div className={styles.roundInfoHalf}>{round}</div>
      <div className={styles.roundInfoHalf}>
        <p className={styles.summaryLabel}>Top 5</p>
        <ol className={styles.topFive}>
          {leaders.map(({ position, golfer, total, pointsTotal }) => {
            const score = stableford && pointsTotal !== undefined ? `${pointsTotal} PTS` : parLabel(total);
            return <li key={golfer.name}>
              <span className={styles.topFivePlace}>{position}</span>
              <span className={styles.topFiveName}>{golfer.name}</span>
              <span className={styles.number} data-par={stableford ? undefined : parColor(score)}>{score}</span>
            </li>;
          })}
        </ol>
      </div>
    </section>
  </div>;
}

/** The round's tee times in order, each with its players (no one who chose Sit out); no tee time yet → "Tee time TBD". */
function teeSheet(match: GolfMatchPreview, sittingOut?: ReadonlySet<string>): [string, GolfMatchGolfer[]][] {
  const groups = new Map<string, GolfMatchGolfer[]>();
  for (const { golfer } of match.leaderboard) {
    if (sittingOut?.has(golfer.name)) continue;
    const time = golfer.teeTime || "Tee time TBD";
    groups.set(time, [...(groups.get(time) ?? []), golfer]);
  }
  return [...groups].sort(([a], [b]) => teeMinutes(a) - teeMinutes(b));
}

/** Under Overview (team only): the tee sheet — each tee time, then its players one per line with their handicaps. */
export function GolfTeeSheet({ match, sittingOut }: { match: GolfMatchPreview; sittingOut?: ReadonlySet<string> }) {
  const teeTimes = teeSheet(match, sittingOut);
  return <div className={styles.match}>
    <SlideHeader title="Tee Sheet" detail={`${match.course} • ${roundDay(match.roundDate)} • Round ${match.round}`} />
    {teeTimes.length ? <ul className={styles.lineup}>
      {teeTimes.map(([time, golfers]) => <li key={time} className={styles.teeSheetRow}>
        <span className={styles.teeSheetTime}>{time}</span>
        <ul className={styles.teeSheetPlayers}>
          {golfers.map(golfer => <li key={golfer.name}><span>{golfer.name}</span><span className={styles.teeSheetHcp}>HCP {golfer.hcp}</span></li>)}
        </ul>
      </li>)}
    </ul> : <p className={styles.summaryNote}>No one is playing this round yet.</p>}
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
function MatchStatus({ status, plain = false }: { status: ReturnType<typeof matchStatus>; plain?: boolean }) {
  const className = plain ? `${styles.status} ${styles.statusPlain}` : `${styles.rank} ${styles.status}`;
  // Before it starts: TEE TIME over the time. Once begun: THRU over the last hole both sides have finished (blank until
  // the first), then F once it's over (the score sits in the sides' fills).
  if (status.kind === "tee") return <span className={className} aria-label={`Tees off ${status.time}`}>
    <small>TEE TIME</small><span className={styles.statusTime}>{status.time || "—"}</span>
  </span>;
  return <span className={className} aria-label={status.kind === "final" ? `Final ${status.text}` : status.holes ? `Thru ${status.holes}` : "Started, no hole finished yet"}>
    <small>THRU</small>{status.kind === "final" ? "F" : status.holes || "\u00a0"}
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

/** One half of the top Matchup box: the match score (see sideScore), avatar/initials, name, points. */
function PlayerSide({ competitor, align, standing, score }: { competitor: GolfMatchCompetitor | GolfMatchGolfer; align: "left" | "right"; standing: GolfMatchStanding; score: string }) {
  const comp = normalizeCompetitor(competitor);
  const leading = standing?.leader === align;
  // This match's players, one per line (a team name only when there are no players listed).
  const players = comp.golfers.map((g) => g.name);
  const name = players.length ? players.join(" & ") : comp.name ?? "";
  const points = comp.points ?? comp.golfers[0]?.points;

  return <div className={`${styles.side} ${styles[align]} ${leading ? styles.sideLeading : ""}`}>
    <span className={styles.boxStanding}>{score}</span>
    <span className={`${styles.avatar} ${align === "right" ? styles.avatarRight : ""}`}>{players.length > 1 ? players.map(player => player[0]).join("").slice(0, 2).toUpperCase() : initials(name)}</span>
    <div className={styles.sideNames}>
      {players.length > 1 ? players.map(player => <p key={player} className={styles.teamName}>{player}</p>) : <p className={styles.teamName}>{name}</p>}
      {points !== undefined && <p className={styles.teamMeta}>{points} {points === 1 ? "PT" : "PTS"}</p>}
    </div>
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

/** Beside the Predict pill on the tournament box: PPG · FWY · GIR (mirrored on the right), values not wired up yet. */
function SummaryStats({ align }: { align: "left" | "right" }) {
  const labels = ["PPG", "FWY", "GIR"];
  return <dl className={styles.summaryStats}>
    {(align === "right" ? [...labels].reverse() : labels).map(label => <div key={label} className={styles.roundStat}>
      <dt>{label}</dt><dd>—%</dd>
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
