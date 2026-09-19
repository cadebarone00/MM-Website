"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, X, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { firstIncompleteHole, isRoundComplete, scorecardTotals, type ScorecardHoleRow, type ScorecardShotDirection, type ScorecardTotals } from "@/lib/portal/scorecard";
import { formatToPar } from "@/lib/handicap/format";
import { HoleMarkerForDiff } from "@/components/scorecard/HoleMarker";
import { RoundStatsBox } from "@/components/scorecard/RoundStatsBox";
import { ScoreToParHeader } from "./ScoreToParHeader";

const ROW_LABELS = ["Hole", "Yardage", "Score", "Putts", "Fairway", "Green"] as const;
const CELL_HEIGHT = "h-9";
const COLUMN_WIDTH = "w-12";

function Cell({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${CELL_HEIGHT} ${last ? "" : "border-b border-ink-100"}`}>
      {children}
    </div>
  );
}

function Dash() {
  return <span className="font-sans text-xs text-ink-300">{"–"}</span>;
}

/** Hit = green check; a recorded miss direction becomes the matching arrow; anything else that counts as a miss (a plain false, or GIR's "penalty") falls back to a red X. Null means "not applicable" or "not entered yet" and both render the same em dash here — the row headers already say which stat this is, and completeness is shown by the banner/Submit gating below the grid. */
function ShotCell({ hit, direction, notApplicable }: { hit: boolean | null; direction: ScorecardShotDirection | null; notApplicable?: boolean }) {
  if (notApplicable) return <span className="font-sans text-2xs text-ink-300">N/A</span>;
  if (hit == null) return <Dash />;
  if (hit) return <Check size={16} aria-label="Hit" className="text-emerald-600" />;
  const DirectionIcon = direction === "long" ? ArrowUp : direction === "short" ? ArrowDown : direction === "left" ? ArrowLeft : direction === "right" ? ArrowRight : null;
  return DirectionIcon
    ? <DirectionIcon size={16} aria-label={"Missed " + direction} className="text-red-600" />
    : <X size={16} aria-label="Missed" className="text-red-600" />;
}

function ScoreCell({ score, par }: { score: number | null; par: number }) {
  if (score == null) return <Dash />;
  return <HoleMarkerForDiff diff={score - par} size={26}>{score}</HoleMarkerForDiff>;
}

function LabelColumn() {
  return (
    <div className="flex w-[76px] shrink-0 flex-col border-r border-ink-200 bg-cream-50">
      {ROW_LABELS.map((label, i) => (
        <Cell key={label} last={i === ROW_LABELS.length - 1}>
          <span className="w-full px-2 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{label}</span>
        </Cell>
      ))}
    </div>
  );
}

function HoleColumn({ row, onEdit }: { row: ScorecardHoleRow; onEdit: () => void }) {
  const par3 = row.par === 3;
  return (
    <div className={`flex ${COLUMN_WIDTH} shrink-0 flex-col border-r border-ink-100 last:border-r-0`}>
      <Cell><button type="button" onClick={onEdit} aria-label={"Edit hole " + row.hole} className="font-sans text-sm font-bold text-maroon-800">{row.hole}</button></Cell>
      <Cell><span className="font-sans text-2xs text-ink-500">{row.yards}</span></Cell>
      <Cell><ScoreCell score={row.score} par={row.par} /></Cell>
      <Cell><span className="font-sans text-xs text-ink-700">{row.putts ?? <Dash />}</span></Cell>
      <Cell><ShotCell hit={row.fir} direction={row.firDirection} notApplicable={par3} /></Cell>
      <Cell last><ShotCell hit={row.gir} direction={row.girDirection} /></Cell>
    </div>
  );
}

/** The horizontal grid itself: a fixed row-label column, then one scrollable column per hole. Reused for both "my" scorecard and (in live scoring) the competitor's. */
function ScorecardGrid({ rows, onEditHole }: { rows: ScorecardHoleRow[]; onEditHole: (hole: number) => void }) {
  return (
    <div className="flex overflow-hidden rounded-sm border border-ink-200">
      <LabelColumn />
      <div className="flex flex-1 overflow-x-auto">
        {rows.map((row) => <HoleColumn key={row.hole} row={row} onEdit={() => onEditHole(row.hole)} />)}
      </div>
    </div>
  );
}

function percent({ hit, total }: { hit: number; total: number }): string {
  return total > 0 ? Math.round((hit / total) * 100) + "%" : "\u2014";
}

/** The same five-across box as the player profiles' archived rounds, for this round so far. */
function totalsStats(totals: ScorecardTotals) {
  return [
    { label: "Score", value: totals.score == null ? "\u2014" : String(totals.score) },
    { label: "To Par", value: formatToPar(totals.toPar) },
    { label: "Putts", value: totals.putts == null ? "\u2014" : String(totals.putts) },
    { label: "Fairways", value: percent(totals.fairways), note: totals.fairways.total > 0 ? `${totals.fairways.hit}/${totals.fairways.total}` : undefined },
    { label: "Greens", value: percent(totals.greens), note: totals.greens.total > 0 ? `${totals.greens.hit}/${totals.greens.total}` : undefined },
  ];
}

/** "After you submit you can't edit" - the last check before a round is sent in. Keep editing is the default focus so a stray tap can't submit. */
function ConfirmSubmitDialog({ submitting, error, onSubmit, onKeepEditing }: { submitting?: boolean; error?: string | null; onSubmit: () => void; onKeepEditing: () => void }) {
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { keepEditingRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitting) onKeepEditing(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onKeepEditing]);
  // Portaled to the page root so no ancestor's stacking context can put the site header on top of it.
  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-submit-title" aria-describedby="confirm-submit-body" className="w-full max-w-sm rounded-md bg-white p-5 shadow-xl">
        <h2 id="confirm-submit-title" className="font-serif text-xl font-bold text-ink-900">Confirm</h2>
        <p id="confirm-submit-body" className="mt-2 font-sans text-sm text-ink-700">After you submit scores you will not be able to edit them.</p>
        {error && <p aria-live="polite" className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" disabled={submitting} onClick={onSubmit} className="w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50">
            {submitting ? "Submitting\u2026" : "Submit Scores"}
          </button>
          <button ref={keepEditingRef} type="button" disabled={submitting} onClick={onKeepEditing} className="w-full rounded-pill border border-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-maroon-700 disabled:opacity-50">
            Keep editing
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export interface ScorecardCompetitor {
  label: string;
  rows: ScorecardHoleRow[];
}

/**
 * Full hole-by-hole scorecard: a horizontally-scrolling grid (Hole/Yardage/
 * Score/Putts/Fairway/Green as rows, one column per hole) — tap a hole
 * number to jump back and fix it. Shared by the handicap "Submit a score"
 * flow and live scoring — live scoring passes `competitor` to show the
 * playing partner's own scorecard underneath, and omits `onSubmit` since
 * it still submits hole-by-hole as it does today. `showTotals` adds the
 * round-totals box under the grid (handicap only for now); `onSubmit`
 * adds the Submit Round pill, which asks for confirmation first.
 */
export function Scorecard({
  rows,
  totalScore,
  toPar,
  onEditHole,
  onBack,
  competitor,
  showTotals,
  onSubmit,
  submitting,
  submitError,
}: {
  rows: ScorecardHoleRow[];
  totalScore: number;
  toPar: number | null;
  onEditHole: (hole: number) => void;
  onBack: () => void;
  competitor?: ScorecardCompetitor;
  showTotals?: boolean;
  onSubmit?: () => void;
  submitting?: boolean;
  submitError?: string | null;
}) {
  const complete = isRoundComplete(rows);
  const nextIncomplete = firstIncompleteHole(rows);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-md border border-ink-100 bg-white p-3">
      <button type="button" onClick={onBack} disabled={submitting} className="mb-2 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Back</button>
      <ScoreToParHeader totalScore={totalScore} toPar={toPar} />
      <p className="mt-2 text-center font-sans text-2xs uppercase tracking-wide text-ink-400">Tap hole number to edit</p>

      <div className="mt-3"><ScorecardGrid rows={rows} onEditHole={onEditHole} /></div>

      {competitor && (
        <div className="mt-4">
          <p className="mb-1 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">{competitor.label}</p>
          <ScorecardGrid rows={competitor.rows} onEditHole={onEditHole} />
        </div>
      )}

      {!complete && nextIncomplete != null && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-sm bg-gold-200 px-3 py-2">
          <span className="font-sans text-sm text-ink-700">Not every hole is entered yet.</span>
          <button type="button" onClick={() => onEditHole(nextIncomplete)} className="shrink-0 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700 underline">
            Go to hole {nextIncomplete}
          </button>
        </div>
      )}

      {showTotals && <div className="mt-4"><RoundStatsBox stats={totalsStats(scorecardTotals(rows))} /></div>}

      {onSubmit && (
        <div className="mt-3">
          <button
            type="button"
            disabled={!complete || submitting}
            onClick={() => setConfirming(true)}
            className="w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
          >
            {complete ? "Submit Round" : "Finish all 18 holes to submit"}
          </button>
        </div>
      )}
      {onSubmit && confirming && <ConfirmSubmitDialog submitting={submitting} error={submitError} onSubmit={onSubmit} onKeepEditing={() => setConfirming(false)} />}
    </div>
  );
}
