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

function HoleColumn({ row, onEdit }: { row: ScorecardHoleRow; onEdit: () => void }) {
  const par3 = row.par === 3;
  return (
    <div className={`flex ${COLUMN_WIDTH} shrink-0 flex-col border-r border-ink-100 last:border-r-0`}>
      <Cell><button type="button" onClick={onEdit} aria-label={"Edit hole " + row.hole} className="min-w-7 rounded px-1.5 py-0.5 font-sans text-sm font-bold text-maroon-800">{row.hole}</button></Cell>
      <Cell><span className="font-sans text-2xs text-ink-500">{row.yards}</span></Cell>
      <Cell><ScoreCell score={row.score} par={row.par} /></Cell>
      <Cell><span className="font-sans text-xs text-ink-700">{row.putts ?? <Dash />}</span></Cell>
      <Cell><ShotCell hit={row.fir} direction={row.firDirection} notApplicable={par3} /></Cell>
      <Cell last><ShotCell hit={row.gir} direction={row.girDirection} /></Cell>
    </div>
  );
}

/** The horizontal grid: a fixed row-label column, then one scrollable column per hole. Handicap "Submit a score" only — live scoring uses the two split boxes below. */
function ScorecardGrid({ rows, onEditHole }: { rows: ScorecardHoleRow[]; onEditHole: (hole: number) => void }) {
  return (
    <div className="flex overflow-hidden rounded-sm border border-ink-200">
      <LabelColumn labels={["Hole", "Yardage", "Score", "Putts", "Fairway", "Green"]} />
      <div className="flex flex-1 overflow-x-auto">
        {rows.map((row) => <HoleColumn key={row.hole} row={row} onEdit={() => onEditHole(row.hole)} />)}
      </div>
    </div>
  );
}

/** Live: a hole where you and your scorer disagree turns red; one still waiting on your scorer is muted. */
function holeNumberClass(state: HoleState | undefined): string {
  if (state === "disputed") return "bg-red-600 text-white";
  if (state === "submitted") return "text-ink-400";
  return "text-maroon-800";
}

/** Live box 1: Hole/Yardage/Score/opponent-score rows. */
function ScoreHoleColumn({ row, holeState, yourAlert, opponentAlert, onEdit }: { row: ScorecardHoleRow; holeState?: HoleState; yourAlert?: boolean; opponentAlert?: boolean; onEdit: () => void }) {
  return (
    <div className={`flex ${COLUMN_WIDTH} shrink-0 flex-col border-r border-ink-100 last:border-r-0`}>
      <Cell><button type="button" onClick={onEdit} aria-label={"Edit hole " + row.hole} className={`min-w-7 rounded px-1.5 py-0.5 font-sans text-sm font-bold ${holeNumberClass(holeState)}`}>{row.hole}</button></Cell>
      <Cell><span className="font-sans text-2xs text-ink-500">{row.yards}</span></Cell>
      <Cell alert={yourAlert}><ScoreCell score={row.score} par={row.par} /></Cell>
      <Cell last alert={opponentAlert}>{row.opponentScore != null ? <span className="font-sans text-xs font-semibold text-ink-700">{row.opponentScore}</span> : <Dash />}</Cell>
    </div>
  );
}

/** Live box 2: Putts/Fairway/Green rows, scroll-linked to box 1 so the same column is always the same hole. */
function StatsHoleColumn({ row }: { row: ScorecardHoleRow }) {
  const par3 = row.par === 3;
  return (
    <div className={`flex ${COLUMN_WIDTH} shrink-0 flex-col border-r border-ink-100 last:border-r-0`}>
      <Cell><span className="font-sans text-xs text-ink-700">{row.putts ?? <Dash />}</span></Cell>
      <Cell><ShotCell hit={row.fir} direction={row.firDirection} notApplicable={par3} /></Cell>
      <Cell last><ShotCell hit={row.gir} direction={row.girDirection} /></Cell>
    </div>
  );
}

/** Live scoring's two boxes: Hole/Yardage/Score/opponent above, Putts/Fairway/Green below, a little space between — scrolling one scrolls the other so the columns stay lined up on the same hole. */
function LiveScorecardGrids({ rows, live, onEditHole }: { rows: ScorecardHoleRow[]; live: LiveScorecard; onEditHole: (hole: number) => void }) {
  const scoreScroll = useRef<HTMLDivElement>(null);
  const statsScroll = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  function onScoreScroll() {
    if (syncing.current || !scoreScroll.current || !statsScroll.current) return;
    syncing.current = true;
    statsScroll.current.scrollLeft = scoreScroll.current.scrollLeft;
    syncing.current = false;
  }
  function onStatsScroll() {
    if (syncing.current || !scoreScroll.current || !statsScroll.current) return;
    syncing.current = true;
    scoreScroll.current.scrollLeft = statsScroll.current.scrollLeft;
    syncing.current = false;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex overflow-hidden rounded-sm border border-ink-200">
        <LabelColumn labels={["Hole", "Yardage", "Score", live.opponentLabel]} />
        <div ref={scoreScroll} onScroll={onScoreScroll} className="flex flex-1 overflow-x-auto">
          {rows.map((row) => (
            <ScoreHoleColumn
              key={row.hole}
              row={row}
              holeState={live.holeStates[row.hole]}
              yourAlert={live.yourDisputedHoles.includes(row.hole)}
              opponentAlert={live.opponentDisputedHoles.includes(row.hole)}
              onEdit={() => onEditHole(row.hole)}
            />
          ))}
        </div>
      </div>
      <div className="flex overflow-hidden rounded-sm border border-ink-200">
        <LabelColumn labels={["Putts", "Fairway", "Green"]} />
        <div ref={statsScroll} onScroll={onStatsScroll} className="flex flex-1 overflow-x-auto">
          {rows.map((row) => <StatsHoleColumn key={row.hole} row={row} />)}
        </div>
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

/** One side of the match-completeness card: stacked last names, team-filled. */
function TeamNames({ names, isMaroon }: { names: string[]; isMaroon: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col justify-center self-stretch ${isMaroon ? "items-end bg-maroon-700 text-white" : "items-start bg-white text-maroon-700"}`}>
      {names.map((name, i) => (
        <span key={i} className={`block w-full truncate px-2 py-1.5 font-sans text-xs font-semibold ${isMaroon ? "text-right" : "text-left"}`}>{name}</span>
      ))}
    </div>
  );
}

/** How complete the match is: round/format, the two sides, and the match-play score — styled after the "My Matches" card in the player portal, minus the course header (already shown above on this screen). */
export interface MatchCompleteness {
  /** e.g. "Round 1 · Singles" */
  roundFormatLabel: string;
  maroonNames: string[];
  whiteNames: string[];
  /** Bigger center line, e.g. "2 Up", "AS", "3&2". */
  statusLabel: string;
  /** Smaller center line, e.g. "Thru 8" or "Final". */
  progressLabel: string;
  leader: "maroon" | "white" | "tie" | null;
}

function MatchCompletenessCard({ match }: { match: MatchCompleteness }) {
  const fillClass = match.leader === "maroon" ? "bg-maroon-700 text-white" : match.leader === "white" ? "bg-white text-maroon-700" : "bg-cream-100 text-maroon-700";
  const progressClass = match.leader === "maroon" ? "text-white/80" : match.leader === "white" ? "text-maroon-700/70" : "text-ink-500";
  return (
    <div className="overflow-hidden rounded-sm border border-gold-500 bg-white text-maroon-900">
      <p className="border-b border-gold-300 bg-cream-50 px-3 py-1.5 text-center font-condensed text-3xs font-black uppercase tracking-wide text-ink-400">{match.roundFormatLabel}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_74px_minmax(0,1fr)] items-stretch">
        <TeamNames names={match.maroonNames} isMaroon />
        <div className={`flex flex-col items-center justify-center gap-0.5 border-x border-gold-300 px-1 py-2 text-center ${fillClass}`}>
          <span className="font-sans text-base font-black leading-tight">{match.statusLabel}</span>
          <span className={`font-sans text-2xs font-bold leading-tight ${progressClass}`}>{match.progressLabel}</span>
        </div>
        <TeamNames names={match.whiteNames} isMaroon={false} />
      </div>
    </div>
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
  /** You already pressed Submit Round: the card is read-only. */
  submitted: boolean;
  course: string | null;
  rating: number | null;
  slope: number | null;
  matchCompleteness: MatchCompleteness;
}

/** Live scoring's Scorecard: no boxed card, an icon-only Back button, the course/rating above the total, two linked-scroll boxes instead of explanatory text, and the match's live score at the bottom. */
function LiveScorecardView({ rows, totalScore, toPar, onEditHole, onBack, live, onSubmit, submitting, submitError }: {
  rows: ScorecardHoleRow[]; totalScore: number; toPar: number | null; onEditHole: (hole: number) => void; onBack: () => void;
  live: LiveScorecard; onSubmit?: () => void; submitting?: boolean; submitError?: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const pillEnabled = live.state === "match" && !live.submitted;
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} disabled={submitting} aria-label="Back" className="-ml-1 self-start p-1 text-maroon-700">
        <ArrowLeft size={22} />
      </button>
      <div>
        <p className="text-center font-sans text-xs text-ink-500">
          {live.course ?? "Course TBD"}
          <span className="mx-2 text-ink-300">|</span>
          {live.rating != null ? live.rating.toFixed(1) : "—"}/{live.slope ?? "—"}
        </p>
        <div className="mt-1"><ScoreToParHeader totalScore={totalScore} toPar={toPar} /></div>
        <p className="mt-2 text-center font-sans text-2xs uppercase tracking-wide text-ink-400">Scores as you entered them</p>
      </div>

      <LiveScorecardGrids rows={rows} live={live} onEditHole={onEditHole} />

      <RoundStatsBox stats={totalsStats(scorecardTotals(rows))} />

      <div data-round-state={live.state} className="grid grid-cols-2 gap-3">
        <ScoreBox which="you" label="Your score" total={live.yourTotal} state={live.yourState} />
        <ScoreBox which="opponent" label={`${live.opponentLabel}'s score`} total={live.opponentTotal} state={live.opponentState} />
      </div>

      <MatchCompletenessCard match={live.matchCompleteness} />

      {onSubmit && (
        <div>
          <button
            type="button"
            disabled={!pillEnabled || submitting}
            onClick={() => setConfirming(true)}
            className="w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:bg-ink-200 disabled:text-ink-500"
          >
            {live.submitted ? "Submitted" : "Submit Round"}
          </button>
        </div>
      )}
      {onSubmit && confirming && !live.submitted && (
        <ConfirmSubmitDialog
          message="After you submit your round you will not be able to edit it. Tiger can correct it later if something is wrong."
          label="Submit Round"
          submitting={submitting}
          error={submitError}
          onSubmit={onSubmit}
          onKeepEditing={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

/**
 * Full hole-by-hole scorecard: a horizontally-scrolling grid — tap a hole
 * number to jump back and fix it. Shared by the handicap "Submit a score"
 * flow and live scoring, which look and behave quite differently (see
 * LiveScorecardView) since live scoring is showing two players' entries
 * instead of one.
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
  const [confirming, setConfirming] = useState(false);

  if (live) {
    return (
      <LiveScorecardView
        rows={rows}
        totalScore={totalScore}
        toPar={toPar}
        onEditHole={onEditHole}
        onBack={onBack}
        live={live}
        onSubmit={onSubmit}
        submitting={submitting}
        submitError={submitError}
      />
    );
  }

  const complete = isRoundComplete(rows);
  const nextIncomplete = firstIncompleteHole(rows);

  return (
    <div className="rounded-md border border-ink-100 bg-white p-3">
      <button type="button" onClick={onBack} disabled={submitting} className="mb-2 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Back</button>
      <ScoreToParHeader totalScore={totalScore} toPar={toPar} />
      <p className="mt-2 text-center font-sans text-2xs uppercase tracking-wide text-ink-400">Tap hole number to edit</p>

      <div className="mt-3"><ScorecardGrid rows={rows} onEditHole={onEditHole} /></div>

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
      {onSubmit && confirming && (
        <ConfirmSubmitDialog
          message="After you submit scores you will not be able to edit them."
          label="Submit Scores"
          submitting={submitting}
          error={submitError}
          onSubmit={onSubmit}
          onKeepEditing={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
