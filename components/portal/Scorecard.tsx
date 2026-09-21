"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, X, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { firstIncompleteHole, isRoundComplete, scorecardTotals, type ScorecardHoleRow, type ScorecardShotDirection, type ScorecardTotals } from "@/lib/portal/scorecard";
import { formatToPar } from "@/lib/handicap/format";
import { HoleMarkerForDiff } from "@/components/scorecard/HoleMarker";
import { RoundStatsBox } from "@/components/scorecard/RoundStatsBox";
import { ScoreToParHeader } from "./ScoreToParHeader";

type HoleState = "empty" | "submitted" | "confirmed" | "disputed";
type LiveCardState = "waiting" | "disputed" | "match";

const CELL_HEIGHT = "h-9";
const COLUMN_WIDTH = "w-12";

function Cell({ children, last, alert }: { children: ReactNode; last?: boolean; alert?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${CELL_HEIGHT} ${last ? "" : "border-b border-ink-100"} ${alert ? "bg-red-100" : ""}`}>
      {children}
    </div>
  );
}

function Dash() {
  return <span className="font-sans text-xs text-ink-300">{"–"}</span>;
}

/** Hit = green check; a recorded miss direction becomes the matching arrow; anything else that counts as a miss (a plain false, or GIR's "penalty") falls back to a red X. Null means "not applicable" or "not entered yet" and both render the same dash here. */
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

function LabelColumn({ labels }: { labels: string[] }) {
  return (
    <div className="flex w-[76px] shrink-0 flex-col border-r border-ink-200 bg-cream-50">
      {labels.map((label, i) => (
        <Cell key={label} last={i === labels.length - 1}>
          <span className="w-full truncate px-2 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{label}</span>
        </Cell>
      ))}
    </div>
  );
}

/** Live: a hole where you and your scorer disagree turns red; one still waiting on your scorer is muted. */
function holeNumberClass(state: HoleState | undefined): string {
  if (state === "disputed") return "bg-red-600 text-white";
  if (state === "submitted") return "text-ink-400";
  return "text-maroon-800";
}

function HoleColumn({ row, holeState, showOpponent, yourAlert, opponentAlert, onEdit }: { row: ScorecardHoleRow; holeState?: HoleState; showOpponent: boolean; yourAlert?: boolean; opponentAlert?: boolean; onEdit: () => void }) {
  const par3 = row.par === 3;
  return (
    <div className={`flex ${COLUMN_WIDTH} shrink-0 flex-col border-r border-ink-100 last:border-r-0`}>
      <Cell><button type="button" onClick={onEdit} aria-label={"Edit hole " + row.hole} className={`min-w-7 rounded px-1.5 py-0.5 font-sans text-sm font-bold ${holeNumberClass(holeState)}`}>{row.hole}</button></Cell>
      <Cell><span className="font-sans text-2xs text-ink-500">{row.yards}</span></Cell>
      <Cell alert={yourAlert}><ScoreCell score={row.score} par={row.par} /></Cell>
      {showOpponent && <Cell alert={opponentAlert}>{row.opponentScore != null ? <span className="font-sans text-xs font-semibold text-ink-700">{row.opponentScore}</span> : <Dash />}</Cell>}
      <Cell><span className="font-sans text-xs text-ink-700">{row.putts ?? <Dash />}</span></Cell>
      <Cell><ShotCell hit={row.fir} direction={row.firDirection} notApplicable={par3} /></Cell>
      <Cell last><ShotCell hit={row.gir} direction={row.girDirection} /></Cell>
    </div>
  );
}

/** The horizontal grid: a fixed row-label column, then one scrollable column per hole. Live scoring adds a row for the score you entered for your opponent. */
function ScorecardGrid({ rows, live, onEditHole }: { rows: ScorecardHoleRow[]; live?: LiveScorecard; onEditHole: (hole: number) => void }) {
  const labels = live
    ? ["Hole", "Yardage", "Score", live.opponentLabel, "Putts", "Fairway", "Green"]
    : ["Hole", "Yardage", "Score", "Putts", "Fairway", "Green"];
  return (
    <div className="flex overflow-hidden rounded-sm border border-ink-200">
      <LabelColumn labels={labels} />
      <div className="flex flex-1 overflow-x-auto">
        {rows.map((row) => (
          <HoleColumn
            key={row.hole}
            row={row}
            holeState={live?.holeStates[row.hole]}
            showOpponent={!!live}
            yourAlert={live?.yourDisputedHoles.includes(row.hole)}
            opponentAlert={live?.opponentDisputedHoles.includes(row.hole)}
            onEdit={() => onEditHole(row.hole)}
          />
        ))}
      </div>
    </div>
  );
}

function percent({ hit, total }: { hit: number; total: number }): string {
  return total > 0 ? Math.round((hit / total) * 100) + "%" : "—";
}

/** The same five-across box as the player profiles' archived rounds, for this round so far. */
function totalsStats(totals: ScorecardTotals) {
  return [
    { label: "Score", value: totals.score == null ? "—" : String(totals.score) },
    { label: "To Par", value: formatToPar(totals.toPar) },
    { label: "Putts", value: totals.putts == null ? "—" : String(totals.putts) },
    { label: "Fairways", value: percent(totals.fairways), note: totals.fairways.total > 0 ? `${totals.fairways.hit}/${totals.fairways.total}` : undefined },
    { label: "Greens", value: percent(totals.greens), note: totals.greens.total > 0 ? `${totals.greens.hit}/${totals.greens.total}` : undefined },
  ];
}

/** "After you submit you can't edit" - the last check before a round is sent in. Keep editing is the default focus so a stray tap can't submit. */
function ConfirmSubmitDialog({ message, label, submitting, error, onSubmit, onKeepEditing }: { message: string; label: string; submitting?: boolean; error?: string | null; onSubmit: () => void; onKeepEditing: () => void }) {
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
        <p id="confirm-submit-body" className="mt-2 font-sans text-sm text-ink-700">{message}</p>
        {error && <p aria-live="polite" className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" disabled={submitting} onClick={onSubmit} className="w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50">
            {submitting ? "Submitting…" : label}
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

/** Live scoring's view of the round: your own entries plus a color for whether you and your scorer agree — never your scorer's numbers. */
export interface LiveScorecard {
  /** Last name of the person you are scoring, used for the second score row and the status text. */
  opponentLabel: string;
  holeStates: Record<number, HoleState>;
  /** white = data missing, red = a hole disagrees, green = everything matches. */
  state: LiveCardState;
  /** The same colors, judged separately for your own score and for the score you entered for your opponent. */
  yourState: LiveCardState;
  opponentState: LiveCardState;
  yourDisputedHoles: number[];
  opponentDisputedHoles: number[];
  yourTotal: number | null;
  opponentTotal: number | null;
  /** Why Submit Round is unavailable right now (null once the card matches). */
  blocker: string | null;
  /** You already pressed Submit Round: the card is read-only. */
  submitted: boolean;
  note: string | null;
}

const STATE_TONES: Record<LiveCardState, string> = {
  waiting: "border-ink-200 bg-white text-ink-700",
  disputed: "border-red-500 bg-red-50 text-red-700",
  match: "border-emerald-500 bg-emerald-50 text-emerald-700",
};

function ScoreBox({ which, label, total, state }: { which: "you" | "opponent"; label: string; total: number | null; state: LiveCardState }) {
  return (
    <div data-score-box={which} data-score-state={state} className={`rounded-sm border px-3 py-2 text-center ${STATE_TONES[state]}`}>
      <p className="truncate font-condensed text-2xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="font-sans text-xl font-black tabular-nums">{total ?? "—"}</p>
    </div>
  );
}

/**
 * Full hole-by-hole scorecard: a horizontally-scrolling grid — tap a hole
 * number to jump back and fix it. Shared by the handicap "Submit a score"
 * flow and live scoring. `showTotals` adds the round-totals box; `onSubmit`
 * adds the Submit Round pill, which asks for confirmation first. `live`
 * switches on live-scoring mode: a second score row (what you entered for
 * your opponent), red/muted hole numbers, and a white/red/green status for
 * whether you and your scorer agree.
 */
export function Scorecard({
  rows,
  totalScore,
  toPar,
  onEditHole,
  onBack,
  showTotals,
  live,
  onSubmit,
  submitting,
  submitError,
}: {
  rows: ScorecardHoleRow[];
  totalScore: number;
  toPar: number | null;
  onEditHole: (hole: number) => void;
  onBack: () => void;
  showTotals?: boolean;
  live?: LiveScorecard;
  onSubmit?: () => void;
  submitting?: boolean;
  submitError?: string | null;
}) {
  const complete = isRoundComplete(rows);
  const nextIncomplete = firstIncompleteHole(rows);
  const [confirming, setConfirming] = useState(false);
  const pillEnabled = live ? live.state === "match" && !live.submitted : complete;

  return (
    <div className="rounded-md border border-ink-100 bg-white p-3">
      <button type="button" onClick={onBack} disabled={submitting} className="mb-2 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Back</button>
      <ScoreToParHeader totalScore={totalScore} toPar={toPar} />
      <p className="mt-2 text-center font-sans text-2xs uppercase tracking-wide text-ink-400">Tap hole number to edit</p>
      {live && <p className="text-center font-sans text-2xs uppercase tracking-wide text-ink-400">Scores as you entered them</p>}

      <div className="mt-3"><ScorecardGrid rows={rows} live={live} onEditHole={onEditHole} /></div>

      {live && (
        <div data-round-state={live.state} className="mt-3">
          <div className="grid grid-cols-2 gap-3">
            <ScoreBox which="you" label="Your score" total={live.yourTotal} state={live.yourState} />
            <ScoreBox which="opponent" label={`${live.opponentLabel}'s score`} total={live.opponentTotal} state={live.opponentState} />
          </div>
          <p className={`mt-2 text-center font-sans text-xs ${live.state === "disputed" ? "text-red-700" : live.state === "match" ? "text-emerald-700" : "text-ink-700"}`}>{live.note ?? (live.state === "match" ? "Your card matches. You can submit your round." : live.blocker)}</p>
        </div>
      )}

      {!complete && nextIncomplete != null && !live?.submitted && (
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
            disabled={!pillEnabled || submitting}
            onClick={() => setConfirming(true)}
            className={`w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white ${live ? "disabled:bg-ink-200 disabled:text-ink-500" : "disabled:opacity-50"}`}
          >
            {live ? (live.submitted ? "Submitted" : "Submit Round") : complete ? "Submit Round" : "Finish all 18 holes to submit"}
          </button>
        </div>
      )}
      {onSubmit && confirming && !live?.submitted && (
        <ConfirmSubmitDialog
          message={live ? "After you submit your round you will not be able to edit it. Tiger can correct it later if something is wrong." : "After you submit scores you will not be able to edit them."}
          label={live ? "Submit Round" : "Submit Scores"}
          submitting={submitting}
          error={submitError}
          onSubmit={onSubmit}
          onKeepEditing={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
