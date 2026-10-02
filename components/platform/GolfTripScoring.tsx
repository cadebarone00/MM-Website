"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import styles from "./GolfTripScoring.module.css";

const HOLES = 18;
/** How far a drag has to travel before it counts as a drag rather than a tap on the handle. */
const TAP_SLOP = 6;

/**
 * Golf Trip Home, Scoring: a pull-up sheet that runs to the bottom of the screen under the floating bottom menu.
 * Collapsed, just its "Scoring" handle shows above the menu; drag it
 * up (or tap it) to open score entry, drag it down (or tap) to tuck it away again. Look only for now: strokes live in
 * this page only and are never saved. `par` (holes 1–18) and `initialHoles` (strokes, null = not played) come from
 * the /dev/tournament preview; without them par shows as a dash and every hole starts empty.
 */
export function GolfTripScoring({ par, initialHoles }: { par?: number[]; initialHoles?: (number | null)[] }) {
  const [open, setOpen] = useState(false);
  const [scoreMode, setScoreMode] = useState<"self" | "match" | "none">("match");
  const [holes, setHoles] = useState<(number | null)[]>(() => Array.from({ length: HOLES }, (_, i) => initialHoles?.[i] ?? null));
  const [holesCompetitor, setHolesCompetitor] = useState<(number | null)[]>(() => Array.from({ length: HOLES }, (_, i) => initialHoles?.[i] ?? null));
  const [current, setCurrent] = useState(() => { const next = holes.findIndex((h) => h === null); return next === -1 ? HOLES - 1 : next; });
  const [currentCompetitor] = useState(() => { const next = holesCompetitor.findIndex((h) => h === null); return next === -1 ? HOLES - 1 : next; });
  const sheetRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const spacerRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ startY: number; startOffset: number; closedOffset: number; moved: boolean } | null>(null);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

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
  const total = played.reduce((sum, x) => sum + x.h, 0);
  const toPar = par ? played.reduce((sum, x) => sum + x.h - (x.p ?? 0), 0) : null;

  function step(delta: number) {
   setHoles((current_) => current_.map((h, i) => {
     if (i !== current) return h;
     const start = h ?? holePar ?? 4; // the first tap starts from par
     return Math.min(Math.max(h === null ? start + Math.min(delta, 0) : start + delta, 1), 15);
   }));
  }

  function stepCompetitor(delta: number) {
   setHolesCompetitor((current_) => current_.map((h, i) => {
     if (i !== currentCompetitor) return h;
     const start = h ?? holePar ?? 4;
     return Math.min(Math.max(h === null ? start + Math.min(delta, 0) : start + delta, 1), 15);
   }));
  }

  const style = dragOffset !== null ? { transform: `translateY(${dragOffset}px)`, transition: "none" } : undefined;

  return <div className={styles.frame}><section ref={sheetRef} className={`${styles.sheet} ${open ? styles.open : ""} ${dragOffset !== null ? styles.dragging : ""}`} style={style} aria-label="Scoring">
    <button ref={handleRef} type="button" className={styles.handle} aria-expanded={open} aria-controls="trip-scoring-body"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen((value) => !value); } }}>
      <span className={styles.grabber} aria-hidden />
      <span className={styles.handleLabel}>Scoring</span>
      <span className={styles.handleMeta}>{thru > 0 ? `Thru ${thru}${toPar !== null ? ` • ${formatToPar(toPar)}` : ""}` : "Tap or pull up"}</span>
    </button>

    <div id="trip-scoring-body" className={styles.body} inert={!open}>
      <div className={styles.holeHeader}>
        <button type="button" className={styles.arrow} aria-label="Previous hole" disabled={current === 0} onClick={() => setCurrent(current - 1)}>
          <ChevronLeft size={22} strokeWidth={2.25} aria-hidden />
        </button>
        <div className={styles.holeTitle}>
          <span className={styles.holeNumber}>Hole {current + 1}</span>
          <span className={styles.holePar}>Par {holePar ?? "—"}</span>
        </div>
        <button type="button" className={styles.arrow} aria-label="Next hole" disabled={current === HOLES - 1} onClick={() => setCurrent(current + 1)}>
          <ChevronRight size={22} strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      <div ref={chipsRef} className={styles.holes} role="group" aria-label="Holes">
        {holes.map((h, i) => <button key={i} type="button" aria-pressed={i === current} aria-label={`Hole ${i + 1}${h !== null ? `, ${h} strokes` : ""}`}
          className={`${styles.holeChip} ${i === current ? styles.holeChipActive : ""}`} onClick={() => setCurrent(i)}>
          <span>{i + 1}</span><b>{h ?? "·"}</b>
        </button>)}
      </div>

      <div className={styles.stepperWrap}>
        <div className={styles.previewMode} role="group" aria-label="Developer score preview">
          {[
            { value: "match", label: "Match" },
            { value: "none", label: "Single" },
          ].map((option) => <button key={option.value} type="button" className={`${styles.previewChip} ${scoreMode === option.value ? styles.previewChipActive : ""}`} aria-pressed={scoreMode === option.value} onClick={() => setScoreMode(option.value as typeof scoreMode)}>{option.label}</button>)}
        </div>

        {scoreMode === "match" ? (
          <div className={styles.scoreSplit}>
            <ScoreCard label="His Score" strokes={strokes} holePar={holePar} step={step} compact />
            <ScoreCard label="Opponent Score" strokes={holesCompetitor[currentCompetitor]} holePar={holePar} step={stepCompetitor} compact />
          </div>
        ) : (
          <ScoreCard label="His Score" strokes={strokes} holePar={holePar} step={step} compact />
        )}
      </div>

      <div className={styles.puttsWrap} aria-label="Putts">
        <span className={styles.puttsLabel}>Putts</span>
        <div className={styles.putts} role="group" aria-label="Putts selector">
          {[0, 1, 2, 3, "4+"].map((value) => <button key={String(value)} type="button" className={styles.puttOption} aria-pressed={value === 2}>{value}</button>)}
        </div>
      </div>

      <div className={styles.compassRow} aria-label="Shot direction">
        <Compass label="Fairway" />
        <Compass label="GIR" />
      </div>

      <dl className={styles.summary}>
        <div><dt>Thru</dt><dd>{thru}</dd></div>
        <div><dt>Strokes</dt><dd>{thru ? total : "—"}</dd></div>
        <div><dt>To Par</dt><dd>{toPar !== null && thru ? formatToPar(toPar) : "—"}</dd></div>
      </dl>
      <p className={styles.note}>Practice only: scores aren&apos;t saved yet.</p>
      <span ref={spacerRef} className={styles.navSpacer} aria-hidden />
    </div>
  </section></div>;
}

function ScoreCard({ label, strokes, holePar, step, compact = false }: { label: string; strokes: number | null; holePar: number | undefined; step: (delta: number) => void; compact?: boolean }) {
  return <div className={`${styles.scoreCard} ${compact ? styles.scoreCardCompact : ""}`}>
    <span className={styles.scoreCardLabel}>{label}</span>
    <div className={styles.stepper}>
      <button type="button" className={styles.stepButton} aria-label={`One less stroke for ${label}`} onClick={() => step(-1)}><Minus size={compact ? 20 : 26} strokeWidth={2.5} aria-hidden /></button>
      <div className={`${styles.strokes} ${compact ? styles.strokesCompact : ""}`} aria-live="polite">
        <span className={strokes === null ? styles.strokesEmpty : ""}>{strokes ?? holePar ?? "—"}</span>
        <small>{strokes === null ? "Tap + or −" : scoreName(strokes, holePar)}</small>
      </div>
      <button type="button" className={styles.stepButton} aria-label={`One more stroke for ${label}`} onClick={() => step(1)}><Plus size={compact ? 20 : 26} strokeWidth={2.5} aria-hidden /></button>
    </div>
  </div>;
}

function Compass({ label }: { label: string }) {
  return <div className={styles.compass} aria-label={label}>
    <span className={styles.compassLabel}>{label}</span>
    <div className={styles.compassDial} aria-hidden="true">
      <button type="button" className={`${styles.compassButton} ${styles.directionUp}`} aria-label={`${label} up`}>
        <span>↑</span>
      </button>
      <button type="button" className={`${styles.compassButton} ${styles.directionLeft}`} aria-label={`${label} left`}>
        <span>←</span>
      </button>
      <button type="button" className={styles.compassCenter} aria-label={`${label} center`}>
        <span>✓</span>
      </button>
      <button type="button" className={`${styles.compassButton} ${styles.directionRight}`} aria-label={`${label} right`}>
        <span>→</span>
      </button>
      <button type="button" className={`${styles.compassButton} ${styles.directionDown}`} aria-label={`${label} down`}>
        <span>↓</span>
      </button>
    </div>
  </div>;
}

function formatToPar(value: number): string {
  return value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
}

function scoreName(strokes: number, par: number | undefined): string {
  if (par === undefined) return `${strokes} strokes`;
  if (strokes === 1) return "Hole in one";
  const diff = strokes - par;
  return diff <= -3 ? "Albatross" : diff === -2 ? "Eagle" : diff === -1 ? "Birdie" : diff === 0 ? "Par"
    : diff === 1 ? "Bogey" : diff === 2 ? "Double bogey" : `+${diff}`;
}
