"use client";

import { useCallback, useEffect, useState } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import { useHoleQueue, type QueuedHole } from "@/lib/live/useHoleQueue";
import { getPlayerLastName } from "@/lib/data/players";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LiveMatchBox, MatchFormat } from "@/lib/live/types";
import { buildScorecardRows, holeSubmissionStatus, sameHoleDraft, submittedPair, scoringSides, validHoleDraft, type HoleDraft, type HoleSubmission } from "@/lib/live/holeSubmission";
import { describeBlocker, liveRoundStatus, waitingOnSubmitters } from "@/lib/live/roundStatus";
import { ScoringHoleSelector } from "./ScoringHoleSelector";
import { ScoringRoundHeader } from "./ScoringRoundHeader";
import { Scorecard } from "./Scorecard";
import { ScorePicker } from "./ScorePicker";
import { PuttsPicker } from "./PuttsPicker";
import { ShotDirectionPicker } from "./ShotDirectionPicker";
import { HoleActionBar } from "./HoleActionBar";
import styles from "./ScoringPanel.module.css";

export interface ScoringState {
  matchBox: { id: string; boxNumber: number; format: MatchFormat; teeTime: string; maroonPlayers: string[]; whitePlayers: string[]; state: string };
  holes: { number: number; par: number; yards: number }[];
  scores: { player: string; hole: number; score: number | null; selfReportedScore: number | null; putts: number | null; fir: boolean | null; gir: boolean | null; firDirection: string | null; girDirection: string | null; didNotFinish: boolean; confirmedBy: string | null }[];
  submittedPlayers: string[];
  holeSubmissions?: HoleSubmission[];
}

export function ScoringPanel({ playerSlug, round, matchBox, nameBySlug, previewState, previewSubmissions, previewSubmittedPlayers, onPreviewSubmit, onPreviewSubmitRound }: {
  playerSlug: string; playerFullName: string; round: number;
  matchBox: Pick<LiveMatchBox, "id" | "format" | "maroonPlayers" | "whitePlayers">;
  nameBySlug: Record<string, string>;
  previewState?: ScoringState;
  previewSubmissions?: HoleSubmission[];
  onPreviewSubmit?: (submission: HoleSubmission) => Promise<void>;
  /** Tiger's preview: who has pressed Submit Round, and how to submit this phone's round, in place of the real server. */
  previewSubmittedPlayers?: string[];
  onPreviewSubmitRound?: () => Promise<void>;
}) {
  const [state, setState] = useState<ScoringState | null>(previewState ?? null);
  const [selectedHole, setSelectedHole] = useState(1);
  const [showScorecard, setShowScorecard] = useState(false);
  const [autoOpenChecked, setAutoOpenChecked] = useState(false);
  const [submittingRound, setSubmittingRound] = useState(false);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [drafts, setDrafts, draftStorage] = usePersistentState<Record<number, HoleDraft>>(previewState ? null : `live-drafts:${playerSlug}:${matchBox.id}`, {});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (previewState) return;
    try {
      const res = await fetch(`/api/portal/scoring/state?round=${round}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) { setState(data); setError(null); }
      else setError(data.error ?? "Could not load this round.");
    } catch { setError("Could not load this round. Check your connection and try again."); }
  }, [round, previewState]);
  useEffect(() => {
    if (previewState) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial request and realtime refresh share this loader.
    void load();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`scoring-${matchBox.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_hole_scores", filter: `round=eq.${round}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_hole_submissions", filter: `match_box_id=eq.${matchBox.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_match_box_submissions", filter: `match_box_id=eq.${matchBox.id}` }, load).subscribe();
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", load);
    const poll = window.setInterval(visible, 10000);
    return () => { void supabase.removeChannel(channel); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", load); window.clearInterval(poll); };
  }, [round, matchBox.id, load, previewState]);

  const onSaved = useCallback((entry: QueuedHole, submissions: HoleSubmission[]) => {
    setState((current) => current ? { ...current, holeSubmissions: submissions } : current);
    setDrafts((current) => { const next = { ...current }; if (JSON.stringify(next[entry.hole]) === JSON.stringify({ ownScore: entry.ownScore, opponentScore: entry.opponentScore, putts: entry.putts, fairway: entry.fairway, green: entry.green })) delete next[entry.hole]; return next; });
    void load();
  }, [setDrafts, load]);
  const queue = useHoleQueue(previewState ? null : "live-queue:" + playerSlug + ":" + matchBox.id, onSaved);
  if (!draftStorage.ready || !queue.ready) return <p>Restoring saved entries...</p>;
  if (!state) return <p role="status">{error ?? "Loading scoring..."}</p>;
  const submissions = previewSubmissions ?? state.holeSubmissions ?? [];
  const info = state.holes.find((hole) => hole.number === selectedHole);
  const par = info?.par ?? 4;
  const sides = scoringSides(matchBox, playerSlug);
  const isFoursome = matchBox.format === "Foursome";
  const saved = submittedPair(matchBox, playerSlug, selectedHole, submissions).mine;
  const draft: HoleDraft = drafts[selectedHole] ?? saved ?? { ownScore: par, opponentScore: par, putts: null, fairway: null, green: null };
  const unchanged = !!saved && sameHoleDraft(draft, saved, par, matchBox.format);
  const status = holeSubmissionStatus(matchBox, playerSlug, selectedHole, submissions);
  const statuses = Object.fromEntries(state.holes.map((hole) => {
    const status = holeSubmissionStatus(matchBox, playerSlug, hole.number, submissions);
    const submitted = submittedPair(matchBox, playerSlug, hole.number, submissions).mine;
    const dirty = drafts[hole.number] && (!submitted || !sameHoleDraft(drafts[hole.number], submitted, hole.par, matchBox.format));
    return [hole.number, dirty && status !== "disputed" ? "empty" : status];
  }));
  const ownEntries = state.holes.filter((hole) => hole.number <= selectedHole).flatMap((hole) => { const entry = submittedPair(matchBox, playerSlug, hole.number, submissions).mine; return entry ? [entry] : []; });
  const total = ownEntries.reduce((sum, entry) => sum + entry.ownScore, 0);
  const toPar = ownEntries.length ? total - ownEntries.reduce((sum, entry) => sum + (state.holes.find((hole) => hole.number === entry.hole)?.par ?? 0), 0) : null;
  const targetLabel = sides.opponents.map((slug) => getPlayerLastName(nameBySlug[slug] ?? slug)).join(" & ");
  const submittedPlayers = previewSubmittedPlayers ?? state.submittedPlayers;
  const mySubmitted = submittedPlayers.includes(playerSlug);
  const locked = busy || queue.sending || state.matchBox.state === "Final" || mySubmitted;
  function edit(patch: Partial<HoleDraft>) { queue.cancel(selectedHole); setDrafts((all) => ({ ...all, [selectedHole]: { ...draft, ...patch } })); setError(null); }
  function select(hole: number) { setSelectedHole(hole); setError(null); }
  /** True when you have a saved entry for every hole, counting `justSaved` (which the server reply may not have reached the list yet). */
  function everyHoleEntered(justSaved?: number) {
    return state!.holes.every((hole) => hole.number === justSaved || !!submittedPair(matchBox, playerSlug, hole.number, submissions).mine);
  }
  // Once everything is entered, open on the Scorecard instead of hole 1 - but only the first time, so tapping a hole number to fix it sticks.
  if (!autoOpenChecked) {
    setAutoOpenChecked(true);
    if (everyHoleEntered()) setShowScorecard(true);
  }
  async function submitHole() {
    if (!validHoleDraft(draft, par, matchBox.format)) {
      setError("Not all information is complete. Enter both scores, putts, fairway (except par 3), and green result. Putts cannot exceed your score.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const payload = { ...draft, fairway: par === 3 ? null : draft.fairway };
      if (previewState) {
        if (!onPreviewSubmit) throw new Error("Preview connection is not ready.");
        await onPreviewSubmit({ ...payload, player: playerSlug, hole: selectedHole, submittedAt: new Date().toISOString() });
      } else {
        const sent = await queue.submit({ ...payload, round, hole: selectedHole, matchBoxId: matchBox.id!, requestId: crypto.randomUUID(), expectedSubmission: saved?.submittedAt ?? null });
        if (!sent) { void load(); return; }

      }
      setDrafts((all) => { const next = { ...all }; delete next[selectedHole]; return next; });
      if (everyHoleEntered(selectedHole)) setShowScorecard(true);
      else setSelectedHole((hole) => Math.min(hole + 1, 18));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not submit this hole. Please try again."); }
    finally { setBusy(false); }
  }
  async function submitRound() {
    setSubmittingRound(true); setRoundError(null);
    try {
      if (previewState) {
        if (!onPreviewSubmitRound) throw new Error("Preview connection is not ready.");
        await onPreviewSubmitRound();
      } else {
        const res = await fetch("/api/portal/scoring/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ round }) });
        const result = await res.json();
        if (!res.ok || !result.ok) throw new Error(result.error ?? "Could not submit your round.");
        await load();
      }
    } catch (err) { setRoundError(err instanceof Error ? err.message : "Could not submit your round. Check your connection and try again."); }
    finally { setSubmittingRound(false); }
  }
  if (showScorecard) {
    const rows = buildScorecardRows(state.holes, playerSlug, submissions, matchBox.format);
    const enteredRows = rows.filter((row) => row.score != null);
    const scorecardTotal = enteredRows.reduce((sum, row) => sum + (row.score ?? 0), 0);
    const scorecardToPar = enteredRows.length > 0 ? scorecardTotal - enteredRows.reduce((sum, row) => sum + row.par, 0) : null;
    const roundStatus = liveRoundStatus(matchBox, playerSlug, state.holes, submissions);
    const waitingOn = waitingOnSubmitters(matchBox, playerSlug, submittedPlayers).filter((slug) => slug !== playerSlug).map((slug) => getPlayerLastName(nameBySlug[slug] ?? slug));
    return (
      <Scorecard
        rows={rows}
        totalScore={scorecardTotal}
        toPar={scorecardToPar}
        onEditHole={(hole) => { select(hole); setShowScorecard(false); }}
        onBack={() => setShowScorecard(false)}
        showTotals
        live={{
          opponentLabel: targetLabel,
          holeStates: roundStatus.holeStates,
          state: roundStatus.state,
          yourState: roundStatus.yourState,
          opponentState: roundStatus.opponentState,
          yourDisputedHoles: roundStatus.yourDisputedHoles,
          opponentDisputedHoles: roundStatus.opponentDisputedHoles,
          yourTotal: roundStatus.yourTotal,
          opponentTotal: roundStatus.opponentTotal,
          blocker: describeBlocker(roundStatus.blocker, targetLabel),
          submitted: mySubmitted,
          note: mySubmitted ? (waitingOn.length > 0 ? `Submitted \u2014 waiting on ${waitingOn.join(" & ")}` : "Submitted \u2014 your round is official") : null,
        }}
        onSubmit={previewState && !onPreviewSubmitRound ? undefined : () => void submitRound()}
        submitting={submittingRound}
        submitError={roundError}
      />
    );
  }

  const rowClass = (maroon: boolean) => `-mx-4 px-4 py-2 sm:-mx-7 sm:px-7 ${maroon ? "bg-maroon-800 text-white" : "bg-white text-maroon-800"}`;
  return <div className={styles.panel}>
    <div data-hole-header className="-mx-4 sm:-mx-7"><ScoringRoundHeader hole={selectedHole} par={info?.par ?? null} yards={info?.yards ?? null} totalScore={total} toPar={toPar} /></div>
    <button type="button" onClick={() => setShowScorecard(true)} className="mx-auto block font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700">Scorecard</button>
    <ScoringHoleSelector selectedHole={selectedHole} onSelect={select} disabled={busy || queue.sending} statuses={statuses} />
    <div className={styles.notice} aria-live="polite">
      {error || queue.message || draftStorage.storageError ? <p role="alert">{error ?? queue.message ?? "Browser storage unavailable; keep this page open."}</p> : mySubmitted ? <p>Your round is submitted. Tiger can change it.</p> : status === "disputed" ? <p role="alert">Scores disagree. Correct both entries and resubmit to confirm this hole.</p> : status === "submitted" ? <p>Submitted. Waiting for the other scorer.</p> : null}
    </div>
    <div className={styles.scores}>
      <div className={rowClass(sides.maroon)}>
        <p className="text-center font-condensed text-sm font-bold uppercase tracking-wide">{isFoursome ? "Your team score" : "Your score"}</p>
        <ScorePicker key={"self-" + selectedHole} ariaLabel="Your score" par={par} value={draft.ownScore} disabled={locked} tone={sides.maroon ? "maroon" : "light"} onChange={(ownScore) => edit({ ownScore })} />
      </div>
      <div className={rowClass(!sides.maroon)}>
        <p className="text-center font-condensed text-sm font-bold uppercase tracking-wide">{targetLabel} &middot; {isFoursome ? "team score" : "score"}</p>
        <ScorePicker key={"opponent-" + selectedHole} ariaLabel={targetLabel + " score"} par={par} value={draft.opponentScore} disabled={locked} tone={sides.maroon ? "light" : "maroon"} onChange={(opponentScore) => edit({ opponentScore })} />
      </div>
    </div>
    <div className={styles.stats}>
    {!isFoursome && <>
      <div data-compasses className="relative grid grid-cols-2 items-start gap-4">
        <div aria-hidden className="absolute bottom-0 left-1/2 top-5 w-px bg-gold-400" />
        <div className="flex justify-center"><ShotDirectionPicker label="Fairway" notApplicable={par === 3} disabled={locked} value={draft.fairway} onChange={(fairway) => edit({ fairway })} /></div>
        <div className="flex justify-center"><ShotDirectionPicker label="GIR" penaltyOption disabled={locked} value={draft.green} onChange={(green) => edit({ green })} /></div>
      </div>
      <p data-putts-label className="mt-1 text-center font-condensed text-sm font-bold uppercase tracking-wide text-maroon-800">Putts</p>
      <div className="mt-1"><PuttsPicker ariaLabel="Your putts" disabled={locked} value={draft.putts} onChange={(putts) => edit({ putts })} /></div>
    </>}
    </div>
    <div className={styles.actions}><HoleActionBar nextLabel="Next Hole" disabled={busy || queue.sending || selectedHole === 18} onNext={() => select(Math.min(selectedHole + 1, 18))}
      submitLabel={unchanged ? "Submitted" : "Submit Score"} submitDisabled={locked || unchanged} onSubmit={() => void submitHole()} /></div>
  </div>;
}
