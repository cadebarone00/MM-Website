"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole, LockKeyholeOpen, Minus, Plus } from "lucide-react";
import { useScoringView } from "@/lib/platform/scoringViewPreference";
import { GolfGpsScreen } from "./gps/GolfGpsScreen";
import styles from "./GolfTripScoring.module.css";

const HOLES = 18;
/** How far a drag has to travel before it counts as a drag rather than a tap on the handle. */
const TAP_SLOP = 6;
/** "Hold for scoring": how long a press must last, and how far the finger may wander, before scoring opens. */
const HOLD_MS = 2000;
const HOLD_SLOP = 10;

/**
 * Golf Trip Home, Scoring: a pull-up sheet that runs to the bottom of the screen under the floating bottom menu.
 * Collapsed, just its "Scoring" handle shows above the menu; drag it
 * up (or tap it) to open score entry, drag it down (or tap) to tuck it away again. Look only for now: strokes live in
 * this page only and are never saved. `par` (holes 1–18) and `initialHoles` (strokes, null = not played) come from
 * the /dev/tournament preview; supplied scores are retained; untouched holes display par but remain unrecorded until submission.
 * Save & Submit (on the Scorecard view) only appears once every hole has both scores and my stats (fairway not needed on
 * par 3s) and `opponentCardMatches` says the opponent's own card agrees; submitting locks the card until the page reloads.
 */
export function GolfTripScoring({ par, initialHoles, playerName = "You", opponentCardMatches = false }: {
  par?: number[]; initialHoles?: (number | null)[]; playerName?: string; opponentCardMatches?: boolean;
}) {
  const [open, updateOpen] = useState(false);
  const [holes, setHoles] = useState<(number | null)[]>(() => Array.from({ length: HOLES }, (_, i) => initialHoles?.[i] ?? null));
  const [holesCompetitor, setHolesCompetitor] = useState<(number | null)[]>(() => Array.from({ length: HOLES }, (_, i) => initialHoles?.[i] ?? null));
  const [current, setCurrent] = useState(() => { const next = Array.from({ length: HOLES }, (_, i) => initialHoles?.[i] ?? null).findIndex((h) => h === null); return next === -1 ? HOLES - 1 : next; });
  // My stats for each hole: putts, and where the drive (fairway) and approach (green) finished; "center" = hit.
  const [putts, setPutts] = useState<(number | null)[]>(() => Array<number | null>(HOLES).fill(null));
  const [fairways, setFairways] = useState<(Direction | null)[]>(() => Array<Direction | null>(HOLES).fill(null));
  const [greens, setGreens] = useState<(Direction | null)[]>(() => Array<Direction | null>(HOLES).fill(null));
  const [penalties, setPenalties] = useState(() => Array.from({ length: HOLES }, () => ({ fairway: false, green: false })));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [opponentName] = useState(() => randomOpponentName());
  // The GPS and Scorecard pills swap the pulled-up sheet to their own view (same sheet, no page change); tapping again returns to scoring.
  const [view, setView] = useState<"scoring" | "gps" | "scorecard">("scoring");
  const [lockedView, setLockedView] = useState<"gps" | "scorecard" | null>(() => {
    try { const saved = localStorage.getItem("golfTripScoringLockedView"); return saved === "gps" || saved === "scorecard" ? saved : null; } catch { return null; }
  });
  const setOpen = useCallback((next: boolean | ((value: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (value && !open) setView(lockedView ?? "scoring");
    updateOpen(value);
  }, [open, lockedView]);
  function toggleLock(next: "gps" | "scorecard") {
    const value = lockedView === next ? null : next;
    setLockedView(value);
    if (value) setView(value);
    try { if (value) localStorage.setItem("golfTripScoringLockedView", value); else localStorage.removeItem("golfTripScoringLockedView"); } catch { /* Keep the preference in memory for this mount. */ }
  }
  const toggleView = (next: "gps" | "scorecard") => setView((value) => value === next ? "scoring" : next);
  const sheetRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const spacerRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ startY: number; startOffset: number; closedOffset: number; moved: boolean } | null>(null);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  /** How far the sheet travels between open and closed, for the grow-to-full-screen progress while dragging. */
  const [dragRange, setDragRange] = useState(0);
  const chipsRef = useRef<HTMLDivElement>(null);
  // The player's scorecard view (General settings). "slide" is the pull-up sheet; the others open scoring full screen.
  const scoringView = useScoringView();
  const fullScreen = scoringView !== "slide";

  // Hold for scoring: pressing an empty spot anywhere on the page for HOLD_MS opens scoring. Buttons, links, fields
  // and scrolling still work normally; moving the finger or lifting it early cancels.
  useEffect(() => {
    if (scoringView !== "hold" || open) return;
    let timer: number | undefined, start: { x: number; y: number } | null = null;
    const cancel = () => { window.clearTimeout(timer); timer = undefined; start = null; };
    const down = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, label, [role=switch], [role=tab], [role=dialog]")) return;
      start = { x: event.clientX, y: event.clientY };
      timer = window.setTimeout(() => { cancel(); setView("scoring"); setOpen(true); }, HOLD_MS);
    };
    const move = (event: globalThis.PointerEvent) => { if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > HOLD_SLOP) cancel(); };
    const menu = (event: Event) => { if (timer !== undefined) event.preventDefault(); }; // no phone long-press menu mid-hold
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", cancel);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("scroll", cancel, true);
    document.addEventListener("contextmenu", menu);
    return () => {
      cancel();
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", cancel);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("scroll", cancel, true);
      document.removeEventListener("contextmenu", menu);
    };
  }, [scoringView, open, setOpen]);

  // Keep the current hole's chip in view in the sideways hole picker (on open and whenever the hole changes).
  useEffect(() => {
    const strip = chipsRef.current;
    const chip = strip?.children[current] as HTMLElement | undefined;
    if (strip && chip) strip.scrollTo({ left: chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }, [current, open]);

  // Collapsed, the sheet is pushed down so only its handle shows above the strip the bottom menu covers.
  const closedOffset = () => (sheetRef.current?.offsetHeight ?? 0) - (handleRef.current?.offsetHeight ?? 0) - (spacerRef.current?.offsetHeight ?? 0);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    const closed = closedOffset();
    drag.current = { startY: event.clientY, startOffset: open ? 0 : closed, closedOffset: closed, moved: false };
    setDragRange(closed);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < TAP_SLOP) return;
    d.moved = true;
    setDragOffset(Math.min(Math.max(d.startOffset + dy, 0), d.closedOffset));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) setOpen((value) => !value); // a tap toggles
    else setOpen((dragOffset ?? d.startOffset) < d.closedOffset / 2); // a drag snaps to whichever end is closer
    setDragOffset(null);
  }

  const strokes = holes[current];
  const holePar = par?.[current];
  const played = holes.map((h, i) => ({ h, p: par?.[i] })).filter((x): x is { h: number; p: number | undefined } => x.h !== null);
  const thru = played.length;
  const toPar = par ? played.reduce((sum, x) => sum + x.h - (x.p ?? 0), 0) : null;

  function step(delta: number) {
   setHoles((current_) => current_.map((h, i) => {
     if (i !== current) return h;
     const start = h ?? holePar ?? 4; // untouched scores display par until edited or submitted
     return Math.min(Math.max(start + delta, 1), 15);
   }));
  }

  function stepCompetitor(delta: number) {
   setHolesCompetitor((current_) => current_.map((h, i) => {
     if (i !== current) return h;
     const start = h ?? holePar ?? 4;
     return Math.min(Math.max(start + delta, 1), 15);
   }));
  }

  const setForHole = <T,>(setter: (update: (values: T[]) => T[]) => void, value: T) => setter((values) => values.map((v, i) => i === current ? value : v));
  const submittedHoles = holes.map((h, i) => h ?? par?.[i] ?? null);
  const submittedOpponentHoles = holesCompetitor.map((h, i) => h ?? par?.[i] ?? null);
  const complete = submittedHoles.every((h, i) => h !== null && submittedOpponentHoles[i] !== null && putts[i] !== null && greens[i] !== null && (par?.[i] === 3 || fairways[i] !== null));
  const readyToSubmit = complete && opponentCardMatches;

  // While dragging, the sheet follows the finger and grows toward full screen as it rises (--sheet-open: 0 closed → 1 open).
  const style = dragOffset !== null
    ? { transform: `translateY(${dragOffset}px)`, transition: "none", "--sheet-open": dragRange > 0 ? 1 - dragOffset / dragRange : 1 } as CSSProperties
    : undefined;

  // Full-screen views: closed shows nothing ("hold") or a Scoring button where Next hole sits ("button").
  if (fullScreen && !open) return scoringView === "button"
    ? <div className={styles.frame}><button type="button" className={`${styles.nextHoleButton} ${styles.openScoringButton}`} onClick={() => { setView("scoring"); setOpen(true); }}>Scoring</button></div>
    : null;

  // Pulled up (or being dragged), a dimmed layer covers the rest of the page, bottom menu included, so nothing
  // behind the sheet can be tapped; the sheet sits above it.
  const blocking = !fullScreen && (open || dragOffset !== null);
  return <>{blocking && <div className={styles.backdrop} aria-hidden />}<div className={`${styles.frame} ${fullScreen ? styles.frameFull : ""} ${blocking ? styles.frameAbove : ""}`}><section ref={sheetRef} className={`${styles.sheet} ${open ? styles.open : ""} ${dragOffset !== null ? styles.dragging : ""} ${fullScreen ? styles.sheetFull : ""} ${fullScreen && view === "gps" ? styles.gpsFullScreen : ""}`} style={style} aria-label="Scoring">
    {/* GPS pill (left, red) mirrors the Scorecard pill (right); both show while the sheet is pulled up. */}
    {open && (["gps", "scorecard"] as const).map((target) => {
      const label = target === "gps" ? "GPS" : "Card";
      const locked = lockedView === target;
      const Icon = locked ? LockKeyhole : LockKeyholeOpen;
      return <div key={target} className={[styles.scorecardButton, target === "gps" ? styles.scorecardButtonLeft + " " + styles.gpsButton : fullScreen ? styles.scorecardButtonCenter : ""].join(" ")} data-active={view === target}>
        <button type="button" className={styles.pillLabel} aria-pressed={view === target} aria-label={view === target ? "Back to scoring" : "Open " + label} onClick={() => toggleView(target)}>{label}</button>
        <button type="button" className={styles.pillLock} aria-pressed={locked} aria-label={locked ? "Unlock " + label + " default scoring view" : "Lock " + label + " as default scoring view"} onClick={() => toggleLock(target)}><Icon size={14} aria-hidden="true" /></button>
      </div>;
    })}
    {fullScreen && <button type="button" className={styles.exitButton} onClick={() => setOpen(false)}>EXIT</button>}
    {fullScreen ? <div className={styles.fullTopBar} aria-hidden /> : <button ref={handleRef} type="button" className={styles.handle} aria-expanded={open} aria-controls="trip-scoring-body"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen((value) => !value); } }}>
      <span className={styles.grabber} aria-hidden />
      <span className={styles.handleMeta}>
        {/* The score line hides while open so it doesn't sit under the left Scorecard pill. */}
        {thru > 0 && !open && <>
          <span>{toPar !== null ? formatToPar(toPar) : "—"}</span>
          <span aria-hidden>•</span>
          <span>Thru {thru}</span>
        </>}
      </span>
      <span className={styles.handleLabel}>Scoring</span>
    </button>}

    <div id="trip-scoring-body" className={styles.body} inert={!open}>
      {/* GPS prototype (satellite map, live yardages, mock hole) in development; real trips keep the placeholder until course data exists. */}
      {view === "gps" ? process.env.NODE_ENV === "development" ? <GolfGpsScreen holeNumber={current + 1} className={`${styles.gpsMap} ${fullScreen ? styles.gpsMapFull : ""}`} /> : <GpsSection hole={current + 1} holePar={holePar} />
        : view === "scorecard" ? <>
          <ScorecardSection par={par} holes={holes} opponentHoles={holesCompetitor} opponentName={opponentName} putts={putts} fairways={fairways} greens={greens} />
          {/* Both cards complete and agreeing: final scores in green, then Save & Submit. */}
          {(readyToSubmit || submitted) && <>
            <div className={styles.finalScores}>
              <div><span>{playerName}</span><strong>{sumOf(submittedHoles)}</strong></div>
              <div><span>{opponentName}</span><strong>{sumOf(submittedOpponentHoles)}</strong></div>
            </div>
            <button type="button" className={styles.nextHoleButton} disabled={submitted} onClick={() => setConfirmOpen(true)}>{submitted ? "Submitted" : "Save & Submit"}</button>
          </>}
        </>
        : <>
      {/* One row: Thru on the left, the hole in the middle, To Par on the right, all lined up vertically. */}
      <div className={styles.holeHeader}>
        <dl className={styles.holeStat}><dt>Thru</dt><dd>{thru}</dd></dl>
        <div className={styles.holeTitle}>
          <span className={styles.holeNumber}>Hole {current + 1}</span>
          <span className={styles.holePar}>Par {holePar ?? "—"}</span>
        </div>
        <dl className={styles.holeStat}><dt>To Par</dt><dd>{toPar !== null && thru ? formatToPar(toPar) : "—"}</dd></dl>
      </div>

      <div ref={chipsRef} className={styles.holes} role="group" aria-label="Holes">
        {holes.map((h, i) => <button key={i} type="button" aria-pressed={i === current} aria-label={`Hole ${i + 1}${h !== null ? `, ${h} strokes` : ""}`}
          className={`${styles.holeChip} ${h !== null ? styles.holeChipFilled : ""} ${i === current ? styles.holeChipActive : ""}`} onClick={() => setCurrent(i)}>
          <span className={styles.holeChipNumber}>{i + 1}</span>
        </button>)}
      </div>

      <div className={styles.stepperWrap}>

        <div className={styles.scoreSplit}>
          <ScoreCard label="My Score" strokes={strokes} holePar={holePar} step={step} disabled={submitted} compact />
          <ScoreCard label={`${opponentName} Score`} strokes={holesCompetitor[current]} holePar={holePar} step={stepCompetitor} disabled={submitted} compact />
        </div>
      </div>

      <div className={styles.puttsWrap} aria-label="Putts">
        <span className={styles.puttsLabel}>Putts</span>
        <div className={styles.putts} role="group" aria-label="Putts selector">
          {[0, 1, 2, 3, 4].map((value) => <button key={value} type="button" className={styles.puttOption} aria-pressed={putts[current] === value} disabled={submitted}
            onClick={() => setForHole(setPutts, value)}>{value === 4 ? "4+" : value}</button>)}
        </div>
      </div>

      <div className={styles.compassRow} aria-label="Shot direction">
        {/* No fairway to hit on a par 3. */}
        <Compass label="FWY" value={fairways[current]} onChange={(value) => setForHole(setFairways, value)} disabled={submitted || holePar === 3} />
        <div className={styles.penaltyColumn} role="group" aria-label="Penalties">
          <span className={styles.compassLabel}>PEN</span>
          <div className={styles.penaltyButtons}>
            {([['fairway', 'FWY'], ['green', 'GRN']] as const).map(([key, label]) => <button key={key} type="button"
              className={`${styles.compassCenter} ${styles.penaltyButton}`} aria-label={`${label} penalty`} aria-pressed={penalties[current][key]}
              disabled={submitted || (key === "fairway" && holePar === 3)}
              onClick={() => setPenalties((values) => values.map((value, i) => i === current ? { ...value, [key]: !value[key] } : value))}>{label}</button>)}
          </div>
        </div>
        <Compass label="GIR" value={greens[current]} onChange={(value) => setForHole(setGreens, value)} disabled={submitted} />
      </div>

      <button type="button" className={styles.nextHoleButton} aria-label="Next hole" disabled={current === HOLES - 1} onClick={() => setCurrent((value) => Math.min(value + 1, HOLES - 1))}>
        Next hole
      </button>
      </>}
      <span ref={spacerRef} className={styles.navSpacer} aria-hidden />
    </div>
    {confirmOpen && createPortal(<div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-label="Submit score confirmation">
      <div className={styles.confirmDialog}>
        <p className={styles.confirmPrompt}>Are you sure?</p>
        <button type="button" className={styles.keepEditingButton} onClick={() => setConfirmOpen(false)}>Keep Editing</button>
        <button type="button" className={styles.submitScoreButton} onClick={() => { setHoles(submittedHoles); setHolesCompetitor(submittedOpponentHoles); setSubmitted(true); setConfirmOpen(false); }}>Submit Score</button>
      </div>
    </div>, document.body)}
  </section></div></>;
}

type Direction = "up" | "left" | "center" | "right" | "down";
const DIRECTION_MARK: Record<Direction, string> = { up: "↑", left: "←", center: "✓", right: "→", down: "↓" };

/** A score total, or "—" until any hole has a number. */
function sumOf(values: (number | null | undefined)[]): number | "—" {
  return values.some((v) => v != null) ? values.reduce<number>((total, v) => total + (v ?? 0), 0) : "—";
}

/** The GPS section of the scoring sheet: the current hole's yardages. Look only for now: no GPS data yet, so distances show "—". */
function GpsSection({ hole, holePar }: { hole: number; holePar: number | undefined }) {
  return <section className={styles.gps} aria-label="GPS">
    <div className={styles.holeTitle}>
      <span className={styles.holeNumber}>Hole {hole}</span>
      <span className={styles.holePar}>Par {holePar ?? "—"}</span>
    </div>
    <dl className={styles.summary}>
      <div><dt>Front</dt><dd>—</dd></div>
      <div><dt>Middle</dt><dd>—</dd></div>
      <div><dt>Back</dt><dd>—</dd></div>
    </dl>
    <p className={styles.gpsNote}>Yards to the green will show here once GPS is connected.</p>
  </section>;
}

/**
 * The Scorecard section of the scoring sheet, one row per hole (Out after 9, In after 18, then Total). Columns, left to right:
 * the hole (number, yardage, par), my round (score, fairway, green, putts), then the opponent's score; lines split the three groups.
 * Fairway / green show ✓ for a hit or an arrow for the miss (blank fairway on par 3s); totals count hits. Yardage isn't known yet ("—").
 */
function ScorecardSection({ par, holes, opponentHoles, opponentName, putts, fairways, greens }: {
  par?: number[]; holes: (number | null)[]; opponentHoles: (number | null)[]; opponentName: string;
  putts: (number | null)[]; fairways: (Direction | null)[]; greens: (Direction | null)[];
}) {
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
  const mark = (value: Direction | null) => value ? DIRECTION_MARK[value] : "—";
  const hits = (values: (Direction | null)[], index: number[]) => index.some((i) => values[i] !== null) ? index.filter((i) => values[i] === "center").length : "—";
  const holeRow = (i: number) => <tr key={i}>
    <th scope="row">{i + 1}</th><td>—</td><td className={styles.groupEnd}>{par?.[i] ?? "—"}</td>
    <td className={styles.myScore}>{holes[i] ?? "—"}</td><td>{par?.[i] === 3 ? "" : mark(fairways[i])}</td><td>{mark(greens[i])}</td><td className={styles.groupEnd}>{putts[i] ?? "—"}</td>
    <td>{opponentHoles[i] ?? "—"}</td>
  </tr>;
  const totalRow = (label: string, index: number[]) => <tr key={label} className={styles.totalRow}>
    <th scope="row">{label}</th><td>—</td><td className={styles.groupEnd}>{sumOf(index.map((i) => par?.[i]))}</td>
    <td className={styles.myScore}>{sumOf(index.map((i) => holes[i]))}</td><td>{hits(fairways, index)}</td><td>{hits(greens, index)}</td><td className={styles.groupEnd}>{sumOf(index.map((i) => putts[i]))}</td>
    <td>{sumOf(index.map((i) => opponentHoles[i]))}</td>
  </tr>;
  return <section className={styles.scorecardView} aria-label="Scorecard">
    <table className={styles.scorecardTable}>
      {/* The opponent column gets extra room so their name fits. */}
      <colgroup>{["12%", "11%", "10%", "11%", "10%", "10%", "10%", "26%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
      <thead><tr>
        <th scope="col">Hole</th><th scope="col">Yds</th><th scope="col" className={styles.groupEnd}>Par</th>
        <th scope="col">Me</th><th scope="col">FWY</th><th scope="col">GRN</th><th scope="col" className={styles.groupEnd}>PUT</th>
        <th scope="col" className={styles.opponentHead}>{opponentName}</th>
      </tr></thead>
      <tbody>
        {range(0, 9).map(holeRow)}
        {totalRow("Out", range(0, 9))}
        {range(9, 18).map(holeRow)}
        {totalRow("In", range(9, 18))}
        {totalRow("Total", range(0, 18))}
      </tbody>
    </table>
  </section>;
}

function ScoreCard({ label, strokes, holePar, step, disabled = false, compact = false }: { label: string; strokes: number | null; holePar: number | undefined; step: (delta: number) => void; disabled?: boolean; compact?: boolean }) {
  return <div className={`${styles.scoreCard} ${compact ? styles.scoreCardCompact : ""}`}>
    <span className={styles.scoreCardLabel}>{label}</span>
    <div className={styles.stepper}>
      <button type="button" className={styles.stepButton} aria-label={`One less stroke for ${label}`} disabled={disabled} onClick={() => step(-1)}><Minus size={compact ? 20 : 26} strokeWidth={2.5} aria-hidden /></button>
      <div className={`${styles.strokes} ${compact ? styles.strokesCompact : ""}`} aria-live="polite">
        <span className={strokes === null && holePar === undefined ? styles.strokesEmpty : ""}>{strokes ?? holePar ?? "—"}</span>
      </div>
      <button type="button" className={styles.stepButton} aria-label={`One more stroke for ${label}`} disabled={disabled} onClick={() => step(1)}><Plus size={compact ? 20 : 26} strokeWidth={2.5} aria-hidden /></button>
    </div>
  </div>;
}

/** Where the shot finished: ✓ in the middle for a hit, or the arrow for the miss. Tapping the picked one again clears it. */
function Compass({ label, value, onChange, disabled = false }: { label: string; value: Direction | null; onChange: (value: Direction | null) => void; disabled?: boolean }) {
  const button = (direction: Direction, className: string, name: string) => <button type="button" className={className} aria-label={`${label} ${name}`}
    aria-pressed={value === direction} disabled={disabled} onClick={() => onChange(value === direction ? null : direction)}>
    <span>{DIRECTION_MARK[direction]}</span>
  </button>;
  return <div className={styles.compass} aria-label={label}>
    <span className={styles.compassLabel}>{label}</span>
    <div className={styles.compassDial}>
      {button("up", `${styles.compassButton} ${styles.directionUp}`, "long")}
      {button("left", `${styles.compassButton} ${styles.directionLeft}`, "left")}
      {button("center", styles.compassCenter, "hit")}
      {button("right", `${styles.compassButton} ${styles.directionRight}`, "right")}
      {button("down", `${styles.compassButton} ${styles.directionDown}`, "short")}
    </div>
  </div>;
}

function randomOpponentName(): string {
  const names = ["Higgins", "Mason", "Patel", "Nguyen", "Bennett", "Walters", "Miller", "Chavez"];
  return names[Math.floor(Math.random() * names.length)];
}

function formatToPar(value: number): string {
  return value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
}

