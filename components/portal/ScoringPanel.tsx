// components/portal/ScoringPanel.tsx
"use client";

import { getPlayerLastName } from "@/lib/data/players";
import { ScoringHoleSelector } from "./ScoringHoleSelector";
import { ScoringRoundHeader } from "./ScoringRoundHeader";
import { ScorePicker } from "./ScorePicker";
import { PuttsPicker } from "./PuttsPicker";
import { ShotDirectionPicker } from "./ShotDirectionPicker";
import { HoleActionBar } from "./HoleActionBar";
import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { canScoreStrokesFor } from "@/lib/live/orchestration";
import type { LiveMatchBox, MatchFormat } from "@/lib/live/types";
import type { ShotDirection } from "@/lib/handicap/types";

interface HoleScore {
  player: string;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  firDirection: ShotDirection | null;
  girDirection: ShotDirection | null;
  didNotFinish: boolean;
  selfReportedScore: number | null;
  confirmedBy: string | null;
}

export interface ScoringState {
  matchBox: { id: string; boxNumber: number; format: MatchFormat; teeTime: string; maroonPlayers: string[]; whitePlayers: string[]; state: string };
  holes: { number: number; par: number; yards: number }[];
  scores: HoleScore[];
  submittedPlayers: string[];
}

export function ScoringPanel({
  playerSlug,
  round,
  matchBox,
  nameBySlug,
  previewState,
}: {
  playerSlug: string;
  playerFullName: string;
  round: number;
  matchBox: Pick<LiveMatchBox, "id" | "format" | "maroonPlayers" | "whitePlayers">;
  nameBySlug: Record<string, string>;
  previewState?: ScoringState;
}) {
  const [state, setState] = useState<ScoringState | null>(previewState ?? null);
  const [selectedHole, setSelectedHole] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  const load = useCallback(async () => {
    if (previewState) return;
    try {
      const res = await fetch(`/api/portal/scoring/state?round=${round}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setState(data);
        setError(null);
      } else {
        setError(data.error ?? "Could not load this round.");
      }
    } catch {
      setError("Could not load this round. Check your connection and try again.");
    }
  }, [round, previewState]);

  useEffect(() => {
    if (previewState) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount + Realtime resubscribe, matching components/portal/PlayerScoringPanel.tsx; `load` is reused by the mutation handlers so it can't be nested inside this effect.
    load();

    type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;
    let supabase: SupabaseBrowserClient | null = null;
    let channel: ReturnType<SupabaseBrowserClient["channel"]> | null = null;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      supabase = createSupabaseBrowserClient();
      channel = supabase
        .channel(`scoring-round-${round}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "live_hole_scores", filter: `round=eq.${round}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "live_match_box_submissions", filter: `match_box_id=eq.${matchBox.id}` }, load)
        .subscribe();
    } else {
      console.warn("Realtime env vars not set — live updates disabled, falling back to visibility/online refetch only.");
    }

    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);

    return () => {
      if (supabase && channel) supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
    };
  }, [round, matchBox.id, load, previewState]);

  if (!state) {
    return error ? (
      <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>
    ) : (
      <p className="font-sans text-sm text-ink-400">Loading…</p>
    );
  }

  const alreadySubmitted = state.submittedPlayers.includes(playerSlug);
  const scoreFor = (player: string, hole: number) => state.scores.find((s) => s.player === player && s.hole === hole) ?? null;

  function updatePreviewScore(players: string[], changes: Partial<HoleScore>) {
    setState((current) => {
      if (!current) return current;
      const scores = [...current.scores];
      for (const player of players) {
        const index = scores.findIndex((score) => score.player === player && score.hole === selectedHole);
        const existing: HoleScore = index >= 0 ? scores[index] : { player, hole: selectedHole, score: null, putts: 0, fir: null, gir: false, firDirection: null, girDirection: null, didNotFinish: false, selfReportedScore: null, confirmedBy: null };
        const updated = { ...existing, ...changes };
        if (index >= 0) scores[index] = updated;
        else scores.push(updated);
      }
      return { ...current, scores };
    });
  }

  async function submitStroke(targetPlayerSlugs: string[], score: number, didNotFinish = false) {
    if (previewState) {
      updatePreviewScore(targetPlayerSlugs, { score: didNotFinish ? (state?.holes.find((hole) => hole.number === selectedHole)?.par ?? 4) * 2 : score, didNotFinish });
      return true;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/scoring/stroke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, hole: selectedHole, targetPlayerSlugs, score, didNotFinish }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return false; }
      await load();
      return true;
    } catch {
      setError("Could not save your scores. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitStats(putts: number, fir: boolean | null, gir: boolean, firDirection: ShotDirection | null, girDirection: ShotDirection | null, selfReportedScore?: number) {
    if (previewState) {
      updatePreviewScore([playerSlug], { putts, fir, gir, firDirection, girDirection, ...(selfReportedScore === undefined ? {} : { selfReportedScore }) });
      return true;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/scoring/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, hole: selectedHole, putts, fir, gir, firDirection, girDirection, selfReportedScore }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); return false; }
      await load();
      return true;
    } catch {
      setError("Could not save your scores. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitScores() {
    if (previewState) {
      setState((current) => current ? { ...current, submittedPlayers: [...current.submittedPlayers, playerSlug] } : current);
      setConfirmingSubmit(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/scoring/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setConfirmingSubmit(false);
      load();
    } catch {
      setError("Could not save your scores. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const isFoursome = matchBox.format === "Foursome";

  const selectedHoleInfo = state.holes.find((h) => h.number === selectedHole) ?? null;
  const myHoleValues = state.holes
    .filter((h) => h.number <= selectedHole)
    .map((h) => {
      const s = scoreFor(playerSlug, h.number);
      const value = isFoursome ? s?.score ?? null : s?.selfReportedScore ?? s?.score ?? null;
      return { par: h.par, value };
    })
    .filter((h): h is { par: number; value: number } => h.value != null);
  const myTotal = myHoleValues.reduce((sum, h) => sum + h.value, 0);
  const myToPar = myHoleValues.length > 0 ? myTotal - myHoleValues.reduce((sum, h) => sum + h.par, 0) : null;


  const par = selectedHoleInfo?.par ?? 4;
  const ownSide = matchBox.maroonPlayers.includes(playerSlug) ? matchBox.maroonPlayers : matchBox.whitePlayers;
  const otherSide = matchBox.maroonPlayers.includes(playerSlug) ? matchBox.whitePlayers : matchBox.maroonPlayers;
  const targets = isFoursome ? otherSide : otherSide.filter((slug) => canScoreStrokesFor(matchBox, playerSlug, [slug]));
  const mine = scoreFor(isFoursome ? ownSide[0] : playerSlug, selectedHole);
  const opponent = targets.length ? scoreFor(targets[0], selectedHole) : null;
  const targetLabel = targets.map((slug) => getPlayerLastName(nameBySlug[slug] ?? slug)).join(" & ");
  const locked = alreadySubmitted || busy;
  const yourScore = isFoursome ? mine?.score ?? null : mine?.didNotFinish ? par * 2 : mine?.selfReportedScore ?? par;
  const opponentScore = opponent?.score ?? par;

  async function nextHole() {
    // Save the displayed par defaults before leaving an untouched hole.
    if (!alreadySubmitted) {
      if (!isFoursome && !mine?.didNotFinish && mine?.selfReportedScore == null) {
        if (!await submitStats(mine?.putts ?? 0, mine?.fir ?? null, mine?.gir ?? false, mine?.firDirection ?? null, mine?.girDirection ?? null, par)) return;
      }
      if (targets.length && opponent?.score == null) {
        if (!await submitStroke(targets, par)) return;
      }
    }
    if (selectedHole === 18) setConfirmingSubmit(true);
    else setSelectedHole((hole) => hole + 1);
  }

  return <div>
    <div className="-mx-4 sm:-mx-7">
      <ScoringRoundHeader hole={selectedHole} par={selectedHoleInfo?.par ?? null} yards={selectedHoleInfo?.yards ?? null} totalScore={myTotal} toPar={myToPar} />
    </div>
    <ScoringHoleSelector selectedHole={selectedHole} onSelect={(hole) => { setSelectedHole(hole); setConfirmingSubmit(false); }} disabled={busy} />
    {error && <p role="alert" className="mt-2 text-center text-sm text-red-700">{error}</p>}

    <div className="mt-3">
      <p className="text-center font-condensed text-sm font-bold uppercase tracking-wide text-maroon-800">{isFoursome ? "Your team?s score" : "Your score"}</p>
      <ScorePicker key={"self-" + selectedHole} ariaLabel={isFoursome ? "Your team score" : "Your score"} par={par} value={yourScore} disabled={locked || isFoursome || mine?.didNotFinish}
        onChange={(value) => submitStats(mine?.putts ?? 0, mine?.fir ?? null, mine?.gir ?? false, mine?.firDirection ?? null, mine?.girDirection ?? null, value)} />
      {isFoursome && <p className="text-center text-xs text-ink-500">Recorded by the opposing team</p>}
      {mine?.didNotFinish && <p className="text-center text-xs text-ink-500">Did not finish ? double par</p>}
    </div>

    {targets.length > 0 && <div className="mt-2">
      <p className="text-center font-condensed text-sm font-bold uppercase tracking-wide text-maroon-800">{targetLabel} ? {isFoursome ? "team score" : "score"}</p>
      <ScorePicker key={"opponent-" + selectedHole} ariaLabel={targetLabel + " score"} par={par} value={opponentScore} disabled={locked}
        onChange={(value) => submitStroke(targets, value)} />
      {matchBox.format === "Fourball" && <button type="button" disabled={locked} aria-pressed={opponent?.didNotFinish ?? false}
        onClick={() => { if (window.confirm("Record double par for a player who did not finish this hole?")) void submitStroke(targets, 0, true); }}
        className="mx-auto block text-xs text-ink-500 underline disabled:opacity-50">{opponent?.didNotFinish ? "Did not finish ? double par" : "Did not finish (X)"}</button>}
    </div>}

    {!isFoursome && !mine?.didNotFinish && <>
      <div className="relative mt-4 grid grid-cols-2 items-start gap-4">
        <div aria-hidden className="absolute bottom-5 left-1/2 top-5 w-px bg-gold-400" />
        <div className="flex justify-center">{par !== 3 && <ShotDirectionPicker label="Fairway" disabled={locked} value={mine?.fir ? "hit" : mine?.firDirection ?? null}
          onChange={(result) => submitStats(mine?.putts ?? 0, result === "hit", mine?.gir ?? false, result === "hit" ? null : result, mine?.girDirection ?? null, mine?.selfReportedScore ?? par)} />}</div>
        <div className="flex justify-center"><ShotDirectionPicker label="GIR" penaltyOption disabled={locked} value={mine?.gir ? "hit" : mine?.girDirection ?? null}
          onChange={(result) => submitStats(mine?.putts ?? 0, mine?.fir ?? null, result === "hit", mine?.firDirection ?? null, result === "hit" ? null : result, mine?.selfReportedScore ?? par)} /></div>
      </div>
      <p className="mt-6 text-center font-condensed text-sm font-bold uppercase tracking-wide text-maroon-800">Putts</p>
      <div className="mb-3 mt-1"><PuttsPicker ariaLabel="Your putts" disabled={locked} value={mine?.putts ?? null}
        onChange={(value) => submitStats(value, mine?.fir ?? null, mine?.gir ?? false, mine?.firDirection ?? null, mine?.girDirection ?? null, mine?.selfReportedScore ?? par)} /></div>
    </>}

    {alreadySubmitted && <p className="mt-3 text-center text-sm text-ink-500">Scores submitted for this round.</p>}
    {confirmingSubmit && !alreadySubmitted && <div className="mt-3 text-center">
      <p className="text-sm text-maroon-800">Submit your round? Scores cannot be edited after submission.</p>
      <button type="button" disabled={busy} onClick={() => setConfirmingSubmit(false)} className="mt-1 text-xs text-ink-500 underline">Keep editing</button>
    </div>}
    <HoleActionBar nextLabel={selectedHole === 18 ? alreadySubmitted ? "Round submitted" : confirmingSubmit ? "Confirm submission" : "Finish round" : "Next Hole"}
      disabled={busy || (selectedHole === 18 && alreadySubmitted)} onNext={() => { if (confirmingSubmit) void submitScores(); else void nextHole(); }} />
  </div>;
}
