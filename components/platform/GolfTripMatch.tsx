import { competitionMatchOffset } from "@/lib/platform/competitionMatchNumber";
import { nonIndividualRound } from "@/lib/platform/nonIndividualRound";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
import homeStyles from "./GolfTripHome.module.css";
import { value as statValue, type TripStatsView } from "./GolfTripStats";
import { PLAYER_STAT_DEFS, playerStats } from "@/lib/platform/tripInsights";
import { MatchDraftStatus } from "./MatchDraftStatus";
import { hasHoleScores, matchCard, winCurve, winNow, withHoleStandings, type MatchCard, type WinPoint } from "@/lib/platform/matchCenter";
import { usePredictSettings } from "@/lib/platform/predictSetting";
import { shapeForToPar } from "@/lib/golf/holeResult";
import { teamPoints } from "@/lib/platform/teamPoints";
import { usePlayerStats } from "@/lib/platform/playerStatsSetting";
import { skinsCount } from "@/lib/platform/tripSkins";

/**
 * Golf tab, Sleeper's fantasy Match screen translated to golf, on the trip's maroon.
 * Dynamic presentation adapts to format metadata (Singles, Fourball, Alternate Shot, Scramble, Stableford).
 * GolfMatchup (round dots + team card) sits above the Golf slide tabs;
 * the Match and Leaderboard slides below them each show their own header control and rows.
 */
/** `roundStarted`: the organizer has begun the current round (its matches show THRU rather than tee times). */
export function GolfTripMatch({ match: fullMatch, viewRound: shownRound, roundStarted = false, draftScope, matchOffset }: { match: GolfMatchPreview; viewRound?: number; roundStarted?: boolean; draftScope?: string; matchOffset?: number }) {
  const [net, setNet] = useState(false);
  // Which round's matches: `viewRound` from the round picker under the big box (Golf tab), else this list's own picker.
  // Matches without a round count as the current round's.
  const [ownRound, setViewRound] = useState(fullMatch.round);
  const viewRound = shownRound ?? ownRound;
  const numberOffset = matchOffset ?? competitionMatchOffset(fullMatch, viewRound);
  // Swiping anywhere on the matches steps the round like the picker's arrows (left = next, right = previous).
  const swipe = useSwipe(() => setViewRound(round => Math.min(fullMatch.roundCount, round + 1)), () => setViewRound(round => Math.max(1, round - 1)));
  // This round's matches, with status worked out from the players' hole scores where the leaderboard has them.
  const scored = withHoleStandings(fullMatch);
  const match = { ...scored, round: viewRound,
    matches: scored.matches.filter(pairing => (pairing.round ?? fullMatch.round) === viewRound) };
  const original = fullMatch.matches.filter(pairing => (pairing.round ?? fullMatch.round) === viewRound);
  const [opened, setOpened] = useState<number | null>(null);
  // Predict on: each match's chance to win right now (Predict's model with the holes played; a finished match is certain).
  const predictOn = usePredictSettings().on;
  const chances = useMemo(() => !predictOn ? [] : original.map((pairing) => {
    const net = matchScoring(fullMatch) === "Net";
    if (hasHoleScores(fullMatch, pairing)) { const now = winNow(fullMatch, matchCard(fullMatch, pairing, net)); return now ? now.left + now.halved / 2 : 0.5; }
    const left = normalizeCompetitor(pairing.left), standing = net ? pairing.net : pairing.gross;
    const status = matchStatus({ thru: left.thru ?? left.golfers[0]?.thru, standing, result: pairing.result });
    return matchWinPct(standing, status.kind === "thru" ? status.holes : status.kind === "final" ? 18 : 0, status.kind === "final") / 100;
  }), [predictOn, original, fullMatch]);
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
    {shownRound === undefined && <RoundNav round={viewRound} current={fullMatch.round} count={fullMatch.roundCount} onRound={setViewRound} />}
    <div className={styles.matchListHeading}>
      {teamNames && <div className={styles.teamNames}><span>{teamNames[0]}</span><span>{teamNames[1]}</span></div>}
      {scoring !== "Gross" && <div className={styles.matchScoringControl}><ScoringControl scoring={scoring} net={net} onNet={setNet} /></div>}
    </div>
    <ul className={`${styles.lineup} ${shownRound === undefined ? styles.swipeArea : ""}`} {...(shownRound === undefined ? swipe : {})}>
      {match.matches.map((m, i) => {
        const standing = showNet ? m.net : m.gross;
        const leftComp = normalizeCompetitor(m.left);
        const rightComp = m.right ? normalizeCompetitor(m.right) : undefined;
        const status = pairingStatus(leftComp, rightComp, standing, m.result, roundStarted && viewRound === fullMatch.round);
        // Before the match starts, no lead fill.
        const shown = status.kind === "tee" ? null : standing;
        return <li key={i} className={`${styles.pairing} ${styles.pairingTap}`} role="button" tabIndex={0} aria-label={`Open match ${numberOffset + i + 1}`}
          onClick={() => setOpened(i)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpened(i); } }}>
          <MatchSide competitor={leftComp} side="left" standing={shown} score={sideScore(status, shown, "left")} />
          {/* The middle: the match number in gold over its status (TEE TIME, THRU), no box. */}
          <span className={styles.matchCenter}>
            <span className={styles.matchNumber}>Match {numberOffset + i + 1}</span>
            <MatchStatus status={status} plain />
          </span>
          {rightComp && <MatchSide competitor={rightComp} side="right" standing={shown} score={sideScore(status, shown, "right")} />}
          {predictOn && chances[i] !== undefined && <WinLine left={chances[i]} />}
        </li>;
      })}
      {/* No matches set for this round yet: the same row, with placeholders. */}
      {!match.matches.length && <MatchDraftStatus scope={draftScope} round={viewRound} />}
    </ul>
    {opened !== null && match.matches[opened] && <MatchDetail match={fullMatch} pairing={original[opened]} number={numberOffset + opened + 1} round={viewRound}
      net={showNet} teamNames={[teamNames?.[0] ?? match.sides[0].name, teamNames?.[1] ?? match.sides[1].name]}
      onClose={() => setOpened(null)} />}
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
export function GolfTripLeaderboard({ match, byToday = false, tripStats }: { match: GolfMatchPreview; byToday?: boolean; tripStats?: TripStatsView }) {
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
  // Skins this round (organizer's Competition → Skins): a column next to TOT. Players not in skins show "—".
  const skins = skinsCount(match);
  const rowClass = `${styles.single} ${showNet ? styles.singleNet : ""} ${skins ? styles.singleSkins : ""}`;

  const selectedCard = rows.find(row => row.golfer.name === selectedPlayer);

  return <div ref={leaderboardRef} className={`${styles.match} ${styles.leaderboard}`}>
    <div>
      <div className={styles.leaderboardListHeading}>
        {scoring !== "Gross" && <div className={styles.matchScoringControl}><ScoringControl scoring={scoring} net={net} onNet={setNet} /></div>}
      <div className={`${rowClass} ${styles.columns}`} aria-hidden>
        <span className={styles.columnPlayer} />
        {showNet && <span>HCP</span>}
        <span className={styles.columnLabel}>{isStableford ? "PTS" : "TOT"}</span>
        {skins && <span className={styles.columnLabel}>SKINS</span>}
        <span className={styles.columnLabel}>THRU</span>
        <span className={styles.columnLabel}>TDY</span>
      </div>
      </div>
      <ul className={styles.lineup}>
        {rows.map(({ position, golfer, total, thru, today, netTotal, netToday, pointsTotal, pointsToday }) => {


          const totDisplay = isStableford ? (pointsTotal !== undefined ? `${pointsTotal} PTS` : total) : parLabel(showNet ? netTotal : total);
          const tdyDisplay = isStableford ? (pointsToday !== undefined ? `${pointsToday} PTS` : today) : parLabel(showNet ? netToday : today);
          return <li key={golfer.name} className={rowClass}>
            <span className={styles.rank}>{position}</span>
            <button type="button" className={styles.playerCardTrigger} onClick={() => setSelectedPlayer(golfer.name)} aria-haspopup="dialog" aria-label={golfer.name + " public trip profile"}>
              <Golfer golfer={golfer} align="left" showThru={false} showHcp={false} />
            </button>
            {showNet && <span className={styles.number} aria-label={`Handicap ${golfer.hcp}`}>{golfer.hcp}</span>}
            <span className={styles.number} data-par={isStableford ? undefined : parColor(totDisplay)} aria-label={`Total ${totDisplay}`}>{totDisplay}</span>
            {skins && <span className={styles.number} aria-label={`Skins ${skins.get(golfer.name) ?? "not in skins"}`}>{skins.has(golfer.name) ? skins.get(golfer.name) : "—"}</span>}
            <span className={styles.number} aria-label={`Thru ${thru}`}>{thru}</span>
            <span className={styles.number} data-par={isStableford ? undefined : parColor(tdyDisplay)} aria-label={`Today ${tdyDisplay}`}>{tdyDisplay}</span>

          </li>;
        })}
      </ul>
    </div>
    {selectedCard && <PlayerPublicTripProfile match={match} key={match.round + selectedCard.golfer.name} name={selectedCard.golfer.name} avatarUrl={selectedCard.golfer.avatarUrl ?? null} username={selectedCard.golfer.username ?? null} round={match.round} roundCount={match.roundCount} roundStandings={match.roundStandings} net={showNet} stableford={isStableford} par={match.par} holes={selectedCard.holes} snapshot={{ position: selectedCard.position, total: parLabel(showNet ? selectedCard.netTotal : selectedCard.total), roundScore: parLabel(showNet ? selectedCard.netToday : selectedCard.today), thru: selectedCard.thru }} tripStats={tripStats} onClose={() => setSelectedPlayer(null)} />}
  </div>;
}

function PlayerPublicTripProfile({ match, name, avatarUrl, username, round, roundCount, par, holes, snapshot, roundStandings, net = false, stableford = false, tripStats, onClose }: { match: GolfMatchPreview; name: string; avatarUrl: string | null; username: string | null; round: number; roundCount: number; roundStandings?: GolfMatchPreview["roundStandings"]; net?: boolean; stableford?: boolean; par: number[]; holes: (number | null)[]; snapshot: { position: string; total: string; roundScore: string; thru: string }; tripStats?: TripStatsView; onClose: () => void }) {
  // Organizer → Player Scoring → Player Stats off: no stats anywhere on the Golf tab.
  const showStats = usePlayerStats();
  const [selectedRound, setSelectedRound] = useState(round);
  const teamRound = nonIndividualRound(match, selectedRound, name);
  const past = roundStandings?.find(item => item.round === selectedRound && (item.standingsRound ?? item.round) === selectedRound);
  const pastRow = past ? rankLeaderboard(past.leaderboard, { net, stableford }).find(row => row.golfer.name === name) : undefined;
  const available = selectedRound === round || !!pastRow;
  const shownSnapshot = selectedRound !== round && pastRow ? {position:pastRow.position,total:parLabel(net ? pastRow.netTotal : pastRow.total),roundScore:parLabel(net ? pastRow.netToday : pastRow.today),thru:pastRow.thru} : snapshot;
  const roundTabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = roundTabsRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (strip && active) strip.scrollTo({ left: active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [selectedRound]);
  // Handicap · Sc. Avg. (scoring average) · Career Low, from their profile rounds (a tripmate's always come through). "—" until loaded,
  // when there's no data, and on sample trips (no username).
  const [stats, setStats] = useState<{ handicapIndex: number | null; average18: number | null; best18: { total: number } | null;
    driving?: { fairwayPct: number } | null; approach?: { girPct: number } | null; putting?: { perRound: number; threePuttPct: number } | null } | null>(null);
  useEffect(() => {
    if (!username) return;
    let live = true;
    fetch("/api/profile/compare?u=" + encodeURIComponent(username)).then(response => response.json())
      .then(body => { if (live && body?.ok && body.result?.status === "ok" && body.result.stats) setStats(body.result.stats); })
      .catch(() => {});
    return () => { live = false; };
  }, [username]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  // Put it away: slide the sheet down, then close. Same for the X, a tap on the line at the top, and a drag down.
  const dismiss = () => {
    const dialog = dialogRef.current;
    if (!dialog || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    dialog.style.transition = "translate 200ms ease-in";
    dialog.style.translate = "0 100%";
    window.setTimeout(onClose, 200);
  };
  // Drag the header down: the sheet follows the finger; let go past 90px (or with a quick flick) and it goes away,
  // otherwise it springs back. A press on the line that doesn't move is a tap. Presses on the X are left to the X.
  const drag = useRef<{ startY: number; startTime: number; dy: number; onHandle: boolean } | null>(null);
  const onDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startTime: event.timeStamp, dy: 0, onHandle: !!target.closest("[data-handle]") };
    if (dialogRef.current) dialogRef.current.style.transition = "none";
  };
  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    if (!gesture || !dialogRef.current) return;
    gesture.dy = Math.max(0, event.clientY - gesture.startY);
    dialogRef.current.style.translate = `0 ${gesture.dy}px`;
  };
  const onDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    drag.current = null;
    const dialog = dialogRef.current;
    if (!gesture || !dialog) return;
    const flick = gesture.dy / Math.max(1, event.timeStamp - gesture.startTime) > 0.5;
    if (gesture.dy > 90 || (gesture.dy > 20 && flick) || (gesture.dy < 6 && gesture.onHandle)) { dismiss(); return; }
    dialog.style.transition = "translate 200ms ease-out";
    dialog.style.translate = "0 0";
  };
  return createPortal(<dialog ref={dialogRef} className={styles.leaderboardScoreSheet} aria-label={name + " public trip profile"} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientY < r.top || event.clientX < r.left || event.clientX > r.right) onClose(); } }}>
    <div className={styles.playerTripProfileHeader} onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
      <span className={styles.playerTripProfileHandle} data-handle aria-hidden><span className={styles.scoreSheetHandle} /></span>
      {/* Photo on the left (initials when there's none), a hair cut off by the top, the left edge and the line below; name to its right. */}
      <span className={styles.playerTripProfileAvatar} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- a stored photo URL, shown as-is */}
        {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}
      </span>
      {/* Name, then the numbers under it (like the profile page's top). */}
      <div className={styles.playerTripProfileIdentity}>
        <h2>{name}</h2>
        <dl className={styles.playerTripProfileStats} aria-label="Player numbers">
          {([["Handicap", stats?.handicapIndex], ["Sc. Avg.", stats?.average18], ["Career Low", stats?.best18?.total]] as const).map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd>{value == null ? "—" : String(value)}</dd></div>)}
        </dl>
      </div>
      <button type="button" className={styles.playerTripProfileClose} onClick={dismiss} autoFocus aria-label="Close player profile"><X size={18} strokeWidth={2.25} aria-hidden /></button>
    </div>
    <div ref={roundTabsRef} className={styles.profileRoundTabs} role="tablist" aria-label="Player rounds">
      {Array.from({ length: Math.max(roundCount, round) }, (_, index) => index + 1).map(number => <button key={number} type="button" role="tab" id={"profile-round-tab-" + number} aria-controls="profile-round-panel" aria-selected={selectedRound === number} onClick={() => setSelectedRound(number)}>Round {number}</button>)}
    </div>
    <section id="profile-round-panel" className={styles.playerTripProfileScorecard} role="tabpanel" aria-labelledby={"profile-round-tab-" + selectedRound}>
      {teamRound ? <div className={styles.nonIndividualCard} aria-label="Team round summary">
        <p>No Individual data due to {teamRound.format}</p>
        <dl><div><dt>Partner</dt><dd>{teamRound.partners.join(" & ") || "Not assigned"}</dd></div>
          <div><dt>Competitors</dt><dd>{teamRound.competitors.join(" & ") || "Not assigned"}</dd></div></dl>
        <strong>{teamRound.result}</strong>
      </div> : <><Scorecard id="leaderboard-player-scorecard" par={selectedRound === round ? par : past?.par ?? par} holes={selectedRound === round ? holes : pastRow?.holes ?? Array<null>(18).fill(null)} name={name} />
      {!available && <p className={styles.profileRoundEmpty}>Scores for this round are not available.</p>}</>}
    </section>
    <section className={styles.profileRoundSnapshot} aria-label="Round snapshot">
      <div className={styles.snapshotSections}>
        <div className={styles.snapshotColumn} role="group" aria-label={"Round " + selectedRound + " snapshot"}>
          <h4>Round {selectedRound}</h4>
          <dl className={styles.snapshotPill}>
            <div><dt>+/&minus;</dt><dd>{!teamRound && available ? shownSnapshot.roundScore || "\u2014" : "\u2014"}</dd></div>
            <div><dt>Thru</dt><dd>{!teamRound && available ? shownSnapshot.thru || "\u2014" : "\u2014"}</dd></div>
          </dl>
        </div>
        <span className={styles.snapshotDivider} aria-hidden />
        <div className={styles.snapshotColumn} role="group" aria-label="Overall snapshot">
          <h4>Overall</h4>
          <dl className={styles.snapshotPill}>
            <div><dt>Position</dt><dd>{shownSnapshot.position || "\u2014"}</dd></div>
            <div><dt>+/&minus;</dt><dd>{shownSnapshot.total || "\u2014"}</dd></div>
          </dl>
        </div>
      </div>
    </section>
    {showStats && <PlayerTripStats name={name} stats={tripStats} />}
    {/* Their own fairway / green / putt numbers, from their profile rounds (owner request 2026-10-16). */}
    {showStats && <section className={styles.profileGameStats} aria-label="Fairways, greens and putts">
      <h4>Their game</h4>
      <dl>
        {([["Fairways", stats?.driving ? `${stats.driving.fairwayPct}%` : null], ["Greens", stats?.approach ? `${stats.approach.girPct}%` : null],
          ["Putts / round", stats?.putting ? stats.putting.perRound.toFixed(1) : null], ["3-putts", stats?.putting ? `${stats.putting.threePuttPct}%` : null]] as const).map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value ?? "\u2014"}</dd></div>)}
      </dl>
      <p>From their rounds on The Maroon.</p>
    </section>}
  </dialog>, document.body);
}

const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");

/**
 * The player pop-up's "This trip": their row of the Stats tab's All players table, then every Individual stat with where
 * they rank on the trip (owner request 2026-10-19). Every row is always there, "—" until they have enough holes.
 */
function PlayerTripStats({ name, stats }: { name: string; stats?: TripStatsView }) {
  const leaders = useMemo(() => {
    if (!stats?.rounds?.length) return [];
    const names = new Map(stats.players.map((p) => [p.profileId, p.name]));
    return playerStats(stats.rounds, (id) => names.get(id) ?? id);
  }, [stats]);
  const me = stats?.players.find((p) => p.name === name);
  const one = (n: number | null | undefined) => n == null ? null : n.toFixed(1);
  const pct = (n: number | null | undefined) => n == null ? null : n + "%";
  return <section className={styles.profileTripStats} aria-label="This trip's stats">
    <h4>This trip</h4>
    <dl className={styles.profileTripStatsTop}>
      {([["Rounds", me ? String(me.rounds) : null], ["Avg", one(me?.scoringAvg)], ["Putts", one(me?.puttsAvg)], ["FWY", pct(me?.fairwayPct)], ["GIR", pct(me?.greenPct)]] as const).map(([label, shown]) =>
        <div key={label}><dt>{label}</dt><dd>{shown ?? "—"}</dd></div>)}
    </dl>
    <ul className={styles.profileTripStatsList}>
      {PLAYER_STAT_DEFS.map((def) => {
        const ranking = leaders.find((s) => s.id === def.id)?.ranking ?? [];
        const mine = ranking.find((r) => r.name === name);
        // Ties share a place: 1 + everyone strictly better.
        const place = mine ? 1 + ranking.filter((r) => def.higher ? r.value > mine.value : r.value < mine.value).length : null;
        return <li key={def.id}>
          <span>{def.label}</span>
          <b>{mine ? statValue(def.unit, mine.value) : "—"}</b>
          <small>{place ? `${ordinal(place)} of ${ranking.length}` : ""}</small>
        </li>;
      })}
    </ul>
    <p>{stats?.trip ? "From this trip's submitted rounds." : "Shows once rounds are submitted."}</p>
  </section>;
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
export function MatchNav({ match, count, onMatch, offset = 0 }: { match: number; count: number; onMatch: (match: number) => void; offset?: number }) {
  return <StepNav name="Match" label={`Match ${offset + match}`} value={match} count={count} onValue={onMatch} />;
}

export function GolfMatchup({ match, compact = false, below, swipe, featured = 0, roundStarted = false }: {
  match: GolfMatchPreview; compact?: boolean; below?: ReactNode; swipe?: ReturnType<typeof useSwipe>;
  /** Which of the round's matches the box shows (0-based). */
  featured?: number;
  /** The organizer has begun this round: THRU rather than the tee time. */
  roundStarted?: boolean;
}) {
  // Organizer → Player Scoring → Player Stats off: no stats anywhere on the Golf tab.
  const showStats = usePlayerStats();
  const predictOn = usePredictSettings().on;
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
    <section className={`${styles.versus} ${compact ? styles.boardBox : ""}`} aria-label="Match" data-board-compact={!predictOn && !showStats || undefined} {...swipe}>
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
      {(predictOn || showStats) && <div className={styles.stats}>
        {predictOn && <WinBar left={boxLeft.winPct} right={boxRight.winPct} />}
        {showStats && <RoundStats side={boxLeft} align="left" />}
        {showStats && <RoundStats side={boxRight} align="right" />}
      </div>}
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

/** Top of the Golf tab: the course, with the round number and format under it. */
export function GolfRoundHeader({ match, competitive = true, today, previousDisabled, nextDisabled, onPrevious, onNext }: {
  match: GolfMatchPreview; competitive?: boolean; today?: string;
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
      <p className={styles.headerDetail}>{competitive && <>Round {match.round} &middot; {formatDef.label}</>}</p>
    </div>
    <button type="button" className={styles.golfCourseArrow} aria-label="Next golf round" disabled={nextDisabled || !onNext} onClick={onNext}><ChevronRight size={22} aria-hidden /></button>
  </header>;
}

/** "2027-04-23" → "Fri, Apr 23" (read as a calendar date, so no time zone can shift it). */
/**
 * Top box on Overview: the whole tournament at a glance — both teams with their overall score (names in the top
 * corners), the win % bar and team stats. Same box as the round matchup card on Competition.
 */
export function GolfTournamentSummary({ match, onPredict, tripStats }: { match: GolfMatchPreview; onPredict?: () => void; tripStats?: TripStatsView }) {
  const [left, right] = match.sides;
  // Tapping the team boxes drops down every player's match points, best first (owner request 2026-10-15).
  // Organizer → Player Scoring → Player Stats off: no stats anywhere on the Golf tab.
  const showStats = usePlayerStats();
  const predictOn = usePredictSettings().on;
  const [pointsOpen, setPointsOpen] = useState(false);
  const [statsTeam, setStatsTeam] = useState<0 | 1 | null>(null);
  const ranking = pointsOpen ? playerPoints(withHoleStandings(match)) : [];
  // Team totals from the organizer's round settings (points per match, Nassau), counted per match.
  const team = teamPoints(match);
  return <div className={styles.matchup} data-points-open={pointsOpen || undefined}>
    <section className={`${styles.versus} ${styles.boardBox}`} aria-label="Tournament standings" data-board-compact={!predictOn && !showStats || undefined}>
      <div className={`${styles.summaryTeams} ${styles.summaryTap}`} role="button" tabIndex={0} aria-expanded={pointsOpen} aria-label="Points by player"
        onClick={() => setPointsOpen(!pointsOpen)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPointsOpen(!pointsOpen); } }}>
        {/* Each team sits in its own color fill (like a lead fill, but always there) from its edge in toward TO WIN. */}
        {[left, right].map((side, i) => <div key={side.name} className={`${styles.summaryFill} ${i ? `${styles.summaryRight} ${styles.summaryFillRight}` : styles.summaryFillLeft}`}>
          <FitName name={side.name} />
          <p className={styles.summaryScore}>{team ? halves(team.points[i]) : side.score || "—"}</p>
          {/* Open: the box extends down with this team's players, most points first. */}
          {pointsOpen && <ol className={styles.teamPoints} aria-label={`${side.name} points by player`}>
            {ranking.filter((row) => row.side === (i ? "right" : "left")).map((row) => <li key={row.name}><span>{row.name}</span><b>{row.points}</b></li>)}
          </ol>}
        </div>)}
        {/* Between the teams, like THRU on the Matches box: the points needed to win (half the points up for grabs, plus ½). */}
        <span className={`${styles.status} ${styles.statusPlain} ${styles.summaryToWin}`} aria-label="Points to win">
          <small>TO WIN</small>{team ? halves(team.available / 2 + 0.5) : "—"}
        </span>
      </div>
      {(predictOn || showStats) && <div className={styles.stats}>
        {predictOn && <WinBar left={left.winPct} right={right.winPct} />}
        {/* Predict off (Organizer → Predict): no button; the team stats stay where they are. */}
        {/* Player Stats off: no team stats; the Predict button (if on) stays in the middle. */}
        {(showStats || onPredict) && <div className={styles.predictRow}>
          {showStats ? <SummaryStats align="left" team={left.name} onOpen={() => setStatsTeam(0)} /> : <span aria-hidden />}
          {onPredict ? <button type="button" className={styles.predictPill} onClick={onPredict}>Predict</button> : <span aria-hidden />}
          {showStats ? <SummaryStats align="right" team={right.name} onOpen={() => setStatsTeam(1)} /> : <span aria-hidden />}
        </div>}
      </div>}
    </section>
    {statsTeam !== null && <TeamStatsSheet match={match} initialTeam={statsTeam} stats={tripStats} onClose={() => setStatsTeam(null)} />}
  </div>;
}

/**
 * Each player's match points across the trip's matches, best first: the points the data gives a side, otherwise a
 * finished match is worth 1 to each winner and ½ each when halved (net standing when the round is net only).
 */
/** 4.5 → "4½", 0.5 → "½", 4 → "4". */
const halves = (n: number) => n % 1 ? `${Math.floor(n) || ""}½` : String(n);

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
    <small>THRU</small><span className={styles.statusValue}>{status.kind === "final" ? "F" : status.holes || "\u00a0"}</span>
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
  type Column = { label: string; par: number | null; score: number | null; total?: boolean };
  const nine = (start: number): Column[] => Array.from({ length: 9 }, (_, i) => ({ label: String(start + i + 1), par: par[start + i] ?? null, score: holes[start + i] ?? null }));
  // Front nine stacked over the back nine (owner request 2026-10-16); both rows have 11 columns so they line up.
  const rows: Column[][] = [
    [...nine(0), { label: "OUT", par: sum(par.slice(0, 9)), score: sum(holes.slice(0, 9)), total: true }, { label: "", par: null, score: null, total: true }],
    [...nine(9), { label: "IN", par: sum(par.slice(9, 18)), score: sum(holes.slice(9, 18)), total: true }, { label: "TOT", par: sum(par), score: sum(holes), total: true }],
  ];
  return <div id={id} className={`${styles.scorecard} ${styles.scorecardStacked}`} role="region" aria-label={`${name} scorecard`}>
    {rows.map((columns, n) => <table key={n} className={styles.scorecardTable} aria-label={n ? "Back nine" : "Front nine"}>
      <tbody>
        <tr><th scope="row">Hole</th>{columns.map((c, i) => <td key={i} className={c.total ? styles.totalCell : ""}>{c.label}</td>)}</tr>
        <tr><th scope="row">Par</th>{columns.map((c, i) => <td key={i} className={c.total ? styles.totalCell : ""}>{c.par ?? ""}</td>)}</tr>
        <tr><th scope="row">Score</th>{columns.map((c, i) => <td key={i} className={c.total ? styles.totalCell : ""}>
          {c.score === null ? "" : c.total || c.par === null ? c.score : <span className={scoreMark(c.score - c.par)}>{c.score}</span>}
        </td>)}</tr>
      </tbody>
    </table>)}
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

/** Team stat entry beside Predict. PPG is a decimal, never a percentage. */
function SummaryStats({ align, team, onOpen }: { align: "left" | "right"; team: string; onOpen: () => void }) {
  const labels = ["PPG", "FWY", "GIR"];
  return <button type="button" className={styles.summaryStatsTrigger} onClick={onOpen} aria-label={team + " player stats"} aria-haspopup="dialog">
    <dl className={styles.summaryStats}>{(align === "right" ? [...labels].reverse() : labels).map(label => <div key={label} className={styles.roundStat}>
      <dt>{label}</dt><dd>{label === "PPG" ? "?" : "?%"}</dd>
    </div>)}</dl>
  </button>;
}

function TeamStatsSheet({ match, initialTeam, stats, onClose }: { match: GolfMatchPreview; initialTeam: 0 | 1; stats?: TripStatsView; onClose: () => void }) {
  const [team, setTeam] = useState(initialTeam);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  const names = [...new Set(match.matches.flatMap(pair => {
    const competitor = team === 0 ? pair.left : pair.right;
    return competitor ? normalizeCompetitor(competitor).golfers.map(g => g.name) : [];
  }))];
  const pct = (n: number | null | undefined) => n == null ? "?" : n + "%";
  return createPortal(<dialog ref={dialogRef} className={styles.teamStatsSheet} aria-label="Team player stats" onCancel={onClose} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const r = event.currentTarget.getBoundingClientRect();
    if (event.clientY < r.top || event.clientY > r.bottom || event.clientX < r.left || event.clientX > r.right) onClose();
  }}>
    <header className={styles.teamStatsHeader}><span>Player stats</span><button type="button" onClick={onClose} aria-label="Close player stats" autoFocus><X size={22} aria-hidden="true" /></button></header>
    <div className={homeStyles.tabs} role="tablist" aria-label="Stats team">{match.sides.map((side, i) => <button key={i} id={"team-stats-tab-" + i} type="button" role="tab" aria-selected={team === i} aria-controls="team-stats-panel" className={homeStyles.tab + " " + (team === i ? homeStyles.tabActive : "")} onClick={() => setTeam(i as 0 | 1)} onKeyDown={event => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : team === 0 ? 1 : 0;
        setTeam(next); dialogRef.current?.querySelector<HTMLButtonElement>("#team-stats-tab-" + next)?.focus();
      }
    }}>{side.name}</button>)}</div>
    <div id="team-stats-panel" role="tabpanel" aria-labelledby={"team-stats-tab-" + team} className={styles.teamStatsBody}>
      <table className={styles.teamStatsTable}><caption>PPG ? Putts Per Green</caption><thead><tr><th scope="col">Player</th><th scope="col">PPG</th><th scope="col">FWY %</th><th scope="col">GIR %</th></tr></thead>
      <tbody>{names.map(name => {
        const player = stats?.players.find(p => p.name === name);
        const holes = player ? stats?.rounds?.filter(r => r.profileId === player.profileId).flatMap(r => r.holes).filter(h => h.putts !== null) ?? [] : [];
        const ppg = holes.length ? (holes.reduce((sum, h) => sum + (h.putts ?? 0), 0) / holes.length).toFixed(2) : "?";
        return <tr key={name}><th scope="row">{name}</th><td>{ppg}</td><td>{pct(player?.fairwayPct)}</td><td>{pct(player?.greenPct)}</td></tr>;
      })}</tbody></table>
      {names.length === 0 && <p>No players assigned to this team.</p>}
    </div>
  </dialog>, document.body);
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

/** Birdie circle / eagle-or-better double circle / bogey box / double box, from the shared hole classifier. */
function scoreMark(toPar: number): string {
  const { outline, rings } = shapeForToPar(toPar);
  if (outline === "none") return styles.mark;
  return `${styles.mark} ${outline === "circle" ? styles.circle : styles.box}${rings === 2 ? ` ${styles.double}` : ""}`;
}

/**
 * Golf → Matches → a match (owner request 2026-10-15): everything about one match for someone not in it — who's
 * playing and where it stands, the match-play scorecard, the chance of winning after every hole (Predict's model), and
 * both sides' stats. Hole scores are this round's leaderboard; other rounds show the data's result only.
 */
function MatchDetail({ match, pairing, number, round, net, teamNames, onClose }: { match: GolfMatchPreview; pairing: GolfMatchPairing; number: number; round: number; net: boolean; teamNames: [string, string]; onClose: () => void }) {
  // Organizer → Player Scoring → Player Stats off: no stats anywhere on the Golf tab.
  const showStats = usePlayerStats();
  const scored = (pairing.round ?? match.round) === match.round;
  const card = useMemo(() => matchCard(scored ? match : { ...match, leaderboard: [] }, pairing, net), [match, pairing, net, scored]);
  const curve = useMemo(() => winCurve(match, card), [match, card]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const lead = card.played ? card.holes[card.played - 1].lead ?? 0 : 0;
  const leader = lead > 0 ? teamNames[0] : teamNames[1];
  const names = (side: "left" | "right") => (side === "left" ? normalizeCompetitor(pairing.left) : pairing.right ? normalizeCompetitor(pairing.right) : null)?.golfers.map(g => g.name) ?? [];
  // Another round (no hole scores here): the data's own result.
  const dataStanding = net ? pairing.net : pairing.gross;
  const status = !scored ? (pairing.result ? (dataStanding?.leader ? `${dataStanding.leader === "left" ? teamNames[0] : teamNames[1]} won ${pairing.result}` : "Halved") : "Not started")
    : card.played === 0 ? "Not started" : card.finished ? (lead === 0 ? "Halved" : `${leader} won ${card.result}`)
    : `${lead === 0 ? "All square" : `${leader} ${Math.abs(lead)} UP`} thru ${card.played}`;
  const statusLead = scored ? (card.played === 0 || lead === 0 ? undefined : lead > 0 ? "left" : "right") : dataStanding?.leader ?? undefined;
  // Stats from the data's per-match numbers (fairways / greens hit %, putts over the holes they cover).
  const statsFor = (i: 0 | 1) => {
    const side = pairing.sides?.[i];
    const comp = i === 0 ? normalizeCompetitor(pairing.left) : pairing.right ? normalizeCompetitor(pairing.right) : null;
    const holes = holesDone(comp?.thru ?? comp?.golfers[0]?.thru);
    const putts = Number(side?.putts);
    return [["Fairways", side?.fairwayPct || "—"], ["Greens", side?.greenPct || "—"], ["Putts / hole", holes && Number.isFinite(putts) && putts > 0 ? (putts / holes).toFixed(1) : "—"]] as const;
  };
  const now = curve.at(-1);
  return <dialog ref={dialogRef} className={`${styles.leaderboardScoreSheet} ${styles.matchSheet}`} aria-label={`Match ${number}`} onCancel={onClose}>
    <div className={styles.matchSheetTop}>
      <button type="button" className={styles.matchSheetBack} onClick={onClose} aria-label="Back to matches" autoFocus><ChevronLeft size={22} aria-hidden /></button>
      <p>Match {number} · Round {round}{net ? " · Net" : ""}</p>
    </div>
    <header className={styles.matchSheetHead}>
      <div data-side="left"><b>{teamNames[0]}</b>{names("left").map(name => <span key={name}>{name}</span>)}</div>
      <p className={styles.matchSheetStatus} data-lead={statusLead}>{status}</p>
      <div data-side="right"><b>{teamNames[1]}</b>{names("right").map(name => <span key={name}>{name}</span>)}</div>
    </header>

    <section aria-label="Match scorecard">
      <h3 className={styles.matchSheetTitle}>Scorecard</h3>
      <MatchScorecard card={card} net={net} />
      {!scored ? <p className={styles.matchSheetNote}>Hole-by-hole scores for this round aren&apos;t available yet.</p>
        : card.played === 0 && <p className={styles.matchSheetNote}>Scores show here hole by hole once the match starts.</p>}
    </section>

    <section aria-label="Chance to win">
      <h3 className={styles.matchSheetTitle}>Chance to win</h3>
      {scored && curve.length > 0 && now ? <>
        <WinChart curve={curve} holes={match.par.length} teamNames={teamNames} />
        <dl className={styles.matchChances}>
          <div data-side="left"><dt>{teamNames[0]}</dt><dd>{Math.round(now.left * 100)}%</dd></div>
          <div><dt>Halved</dt><dd>{Math.round(now.halved * 100)}%</dd></div>
          <div data-side="right"><dt>{teamNames[1]}</dt><dd>{Math.round(now.right * 100)}%</dd></div>
        </dl>
        <p className={styles.matchSheetNote}>From each player&apos;s history and handicap, with the holes played so far locked in (same model as Predict).</p>
      </> : <p className={styles.matchSheetNote}>Odds show for the round being played.</p>}
    </section>

    {showStats && <section aria-label="Team stats">
      <h3 className={styles.matchSheetTitle}>Stats</h3>
      <div className={styles.matchStatsGrid}>
        <b data-side="left">{teamNames[0]}</b><span /><b data-side="right">{teamNames[1]}</b>
        {statsFor(0).map(([label, value], i) => <Fragment key={label}><span>{value}</span><small>{label}</small><span>{statsFor(1)[i][1]}</span></Fragment>)}
      </div>
    </section>}
  </dialog>;
}

/** The match-play scorecard, all holes in one table (swipe sideways; opens on the hole being played): par, every player's score (• = handicap stroke), the running status (colored by who won the hole). */
function MatchScorecard({ card, net }: { card: MatchCard; net: boolean }) {
  const holes = card.holes;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scrollRef.current, cell = box?.querySelector<HTMLElement>(`td:nth-of-type(${Math.max(1, card.played)})`);
    if (box && cell) box.scrollLeft = Math.max(0, cell.offsetLeft - box.clientWidth / 2);
  }, [card.played]);
  const rows = [...card.left.map(p => ({ p, side: "left" })), ...card.right.map(p => ({ p, side: "right" }))];
  const playerRow = ({ p, side }: (typeof rows)[number]) => <tr key={p.name} data-side={side}><th scope="row">{p.name.split(/\s+/)[0]}</th>{holes.map(h => {
    const strokes = p.holes[h.hole - 1];
    return <td key={h.hole}>{strokes == null ? "" : <span className={scoreMark(strokes - h.par)}>{strokes}</span>}{net && p.strokes[h.hole - 1] > 0 && <i className={styles.strokeDot} aria-label="handicap stroke" />}</td>;
  })}</tr>;
  return <div ref={scrollRef} className={styles.scorecard} role="region" aria-label="Match scorecard" tabIndex={0}>
    <table className={`${styles.scorecardTable} ${styles.matchTable}`}>
      <tbody>
        <tr><th scope="row">Hole</th>{holes.map(h => <td key={h.hole}>{h.hole}</td>)}</tr>
        <tr><th scope="row">Par</th>{holes.map(h => <td key={h.hole}>{h.par}</td>)}</tr>
        {/* Left team's players, then where the match stands, then the right team's players. */}
        {rows.filter(({ side }) => side === "left").map(playerRow)}
        <tr className={styles.matchResultRow}><th scope="row">Match</th>{holes.map(h => <td key={h.hole}>
          {h.lead === null ? "" : <span className={styles.leadChip} data-side={h.lead > 0 ? "left" : h.lead < 0 ? "right" : undefined}
            title={h.winner === "halved" ? "Hole halved" : `Hole won by ${h.winner === "left" ? "left" : "right"} side`}>{h.lead === 0 ? "AS" : Math.abs(h.lead)}</span>}
        </td>)}</tr>
        {rows.filter(({ side }) => side === "right").map(playerRow)}
      </tbody>
    </table>
  </div>;
}

/** The left team's chance of winning after each hole: a line over a 50% midline, filled toward whoever's favored. */
function WinChart({ curve, holes, teamNames }: { curve: WinPoint[]; holes: number; teamNames: [string, string] }) {
  const W = 320, H = 140, padX = 10, padY = 14;
  const x = (hole: number) => padX + (hole / holes) * (W - padX * 2);
  const y = (p: number) => padY + (1 - p) * (H - padY * 2);
  const line = curve.map((pt, i) => `${i ? "L" : "M"}${x(pt.hole).toFixed(1)},${y(pt.left).toFixed(1)}`).join(" ");
  const area = `${line} L${x(curve.at(-1)!.hole).toFixed(1)},${y(0.5)} L${x(0)},${y(0.5)} Z`;
  // Press and hold (or drag) on the graph: a mini window with the odds after the nearest hole (owner request 2026-10-15).
  const [held, setHeld] = useState<WinPoint | null>(null);
  const pick = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const hole = Math.round(((event.clientX - box.left) / box.width * W - padX) / (W - padX * 2) * holes);
    setHeld(curve[Math.max(0, Math.min(curve.length - 1, hole))]);
  };
  const label = (pt: WinPoint) => pt.hole === 0 ? "Before hole 1" : `After hole ${pt.hole}`;
  return <div className={styles.winChartWrap}>
    <svg className={styles.winChart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${teamNames[0]} chance to win by hole: ${curve.map(pt => `after ${pt.hole}, ${Math.round(pt.left * 100)}%`).join("; ")}`}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pick(event); }}
      onPointerMove={event => { if (held) pick(event); }}
      onPointerUp={() => setHeld(null)} onPointerCancel={() => setHeld(null)} onLostPointerCapture={() => setHeld(null)}>
      <defs>
        <clipPath id="winTop"><rect x="0" y="0" width={W} height={y(0.5)} /></clipPath>
        <clipPath id="winBottom"><rect x="0" y={y(0.5)} width={W} height={H} /></clipPath>
      </defs>
      {[0, 9, 18].filter(h => h <= holes).map(h => <line key={h} x1={x(h)} x2={x(h)} y1={padY} y2={H - padY} className={styles.winGrid} />)}
      <path d={area} clipPath="url(#winTop)" className={styles.winAreaLeft} />
      <path d={area} clipPath="url(#winBottom)" className={styles.winAreaRight} />
      <line x1={padX} x2={W - padX} y1={y(0.5)} y2={y(0.5)} className={styles.winMid} />
      <path d={line} className={styles.winLine} />
      {held && <line x1={x(held.hole)} x2={x(held.hole)} y1={padY} y2={H - padY} className={styles.winCursor} />}
      {curve.map(pt => <circle key={pt.hole} cx={x(pt.hole)} cy={y(pt.left)} r={pt === held ? 6 : pt === curve.at(-1) ? 4.5 : 2.5} className={styles.winDot} />)}
      <text x={padX} y={padY - 4} className={styles.winLabel}>{teamNames[0]} wins</text>
      <text x={padX} y={H - 2} className={styles.winLabel}>{teamNames[1]} wins</text>
      <text x={W - padX} y={H - 2} textAnchor="end" className={styles.winLabel}>Hole {holes}</text>
    </svg>
    {held && <div className={styles.winTip} role="status" style={{ left: `${Math.min(78, Math.max(22, x(held.hole) / W * 100))}%` }}>
      <b>{label(held)}</b>
      <span data-side="left">{teamNames[0]} <strong>{Math.round(held.left * 100)}%</strong></span>
      <span>Halved <strong>{Math.round(held.halved * 100)}%</strong></span>
      <span data-side="right">{teamNames[1]} <strong>{Math.round(held.right * 100)}%</strong></span>
    </div>}
  </div>;
}

/** A thin line under a match: the favorite's side fills from its edge, as far as their chance to win, with the %. */
function WinLine({ left }: { left: number }) {
  const favorite = left >= 0.5 ? "left" : "right", pct = Math.round((favorite === "left" ? left : 1 - left) * 100);
  return <span className={styles.winLine} data-side={favorite} role="img" aria-label={`${pct}% to win`}>
    <span className={styles.winLineFill} style={{ width: `${pct}%` }} />
    <small>{pct}%</small>
  </span>;
}
