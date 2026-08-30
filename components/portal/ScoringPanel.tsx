// components/portal/ScoringPanel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { canScoreStrokesFor } from "@/lib/live/orchestration";
import type { LiveMatchBox, MatchFormat } from "@/lib/live/types";

interface HoleScore {
  player: string;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
}

interface ScoringState {
  matchBox: { id: string; boxNumber: number; format: MatchFormat; teeTime: string; maroonPlayers: string[]; whitePlayers: string[]; state: string };
  scores: HoleScore[];
  submittedPlayers: string[];
}

export function ScoringPanel({
  playerSlug,
  playerFullName,
  round,
  matchBox,
  nameBySlug,
}: {
  playerSlug: string;
  playerFullName: string;
  round: number;
  matchBox: Pick<LiveMatchBox, "id" | "format" | "maroonPlayers" | "whitePlayers">;
  nameBySlug: Record<string, string>;
}) {
  const [state, setState] = useState<ScoringState | null>(null);
  const [selectedHole, setSelectedHole] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/portal/scoring/state?round=${round}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setState(data);
  }, [round]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount + Realtime resubscribe, matching components/portal/PlayerScoringPanel.tsx; `load` is reused by the mutation handlers so it can't be nested inside this effect.
    load();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`scoring-round-${round}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_hole_scores", filter: `round=eq.${round}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_match_box_submissions", filter: `match_box_id=eq.${matchBox.id}` }, load)
      .subscribe();

    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
    };
  }, [round, matchBox.id, load]);

  if (!state) return <p className="font-sans text-sm text-ink-400">Loading…</p>;

  const alreadySubmitted = state.submittedPlayers.includes(playerSlug);
  const scoreFor = (player: string, hole: number) => state.scores.find((s) => s.player === player && s.hole === hole) ?? null;

  async function submitStroke(targetPlayerSlugs: string[], score: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/scoring/stroke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, hole: selectedHole, targetPlayerSlugs, score }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error);
      else load();
    } finally {
      setBusy(false);
    }
  }

  async function submitStats(putts: number, fir: boolean | null, gir: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/scoring/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, hole: selectedHole, putts, fir, gir }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error);
      else load();
    } finally {
      setBusy(false);
    }
  }

  async function submitScores() {
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
    } finally {
      setBusy(false);
    }
  }

  const isFoursome = matchBox.format === "Foursome";
  const displayPlayers = isFoursome ? [] : [...matchBox.maroonPlayers, ...matchBox.whitePlayers];

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Round {round} — Hole {selectedHole}</h1>
      <p className="mt-1 font-sans text-sm text-ink-500">Welcome, {playerFullName}</p>

      <div className="mt-4 flex flex-wrap gap-1">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
          <button
            key={hole}
            type="button"
            onClick={() => setSelectedHole(hole)}
            className={[
              "h-8 w-8 rounded-sm font-condensed text-xs font-bold",
              hole === selectedHole ? "bg-maroon-700 text-white" : "bg-stone-100 text-ink-700",
            ].join(" ")}
          >
            {hole}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      {isFoursome ? (
        <div className="mt-4 space-y-3">
          {(["maroon", "white"] as const).map((side) => {
            const sidePlayers = side === "maroon" ? matchBox.maroonPlayers : matchBox.whitePlayers;
            const canScore = !alreadySubmitted && canScoreStrokesFor(matchBox, playerSlug, sidePlayers);
            const existing = scoreFor(sidePlayers[0], selectedHole);
            return (
              <div key={side} className="rounded-lg border-2 border-stone-300 p-3">
                <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">
                  {side === "maroon" ? "Maroon" : "White"} side ({sidePlayers.map((p) => nameBySlug[p] ?? p).join(" & ")})
                </span>
                <div className="mt-2">
                  <input
                    type="number"
                    min={1}
                    disabled={!canScore || busy}
                    defaultValue={existing?.score ?? ""}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (value >= 1) submitStroke(sidePlayers, value);
                    }}
                    className="w-20 rounded-lg border-2 border-stone-300 px-2 py-1 text-sm"
                    placeholder="Score"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {displayPlayers.map((slug) => {
            const existing = scoreFor(slug, selectedHole);
            const isSelf = slug === playerSlug;
            const canScoreThis = !alreadySubmitted && canScoreStrokesFor(matchBox, playerSlug, [slug]);
            return (
              <div key={slug} className="rounded-lg border-2 border-stone-300 p-3">
                <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">{nameBySlug[slug] ?? slug}</span>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1 font-sans text-xs text-ink-700">
                    Score
                    <input
                      type="number"
                      min={1}
                      disabled={!canScoreThis || busy}
                      defaultValue={existing?.score ?? ""}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value >= 1) submitStroke([slug], value);
                      }}
                      className="w-16 rounded-lg border-2 border-stone-300 px-2 py-1 text-sm"
                    />
                  </label>
                  {isSelf && (
                    <>
                      <label className="flex items-center gap-1 font-sans text-xs text-ink-700">
                        Putts
                        <input
                          type="number"
                          min={0}
                          disabled={alreadySubmitted || busy}
                          defaultValue={existing?.putts ?? ""}
                          onBlur={(e) => {
                            const value = Number(e.target.value);
                            submitStats(value, existing?.fir ?? null, existing?.gir ?? false);
                          }}
                          className="w-16 rounded-lg border-2 border-stone-300 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-1 font-sans text-xs text-ink-700">
                        <input
                          type="checkbox"
                          disabled={alreadySubmitted || busy}
                          defaultChecked={existing?.fir ?? false}
                          onChange={(e) => submitStats(existing?.putts ?? 0, e.target.checked, existing?.gir ?? false)}
                        />
                        FIR
                      </label>
                      <label className="flex items-center gap-1 font-sans text-xs text-ink-700">
                        <input
                          type="checkbox"
                          disabled={alreadySubmitted || busy}
                          defaultChecked={existing?.gir ?? false}
                          onChange={(e) => submitStats(existing?.putts ?? 0, existing?.fir ?? null, e.target.checked)}
                        />
                        GIR
                      </label>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 border-t border-stone-200 pt-4">
        {alreadySubmitted ? (
          <p className="font-sans text-sm text-ink-500">You&apos;ve submitted your scores for this round.</p>
        ) : confirmingSubmit ? (
          <div className="rounded-lg bg-red-50 p-3">
            <p className="font-sans text-sm text-red-700">Submit your scores? You can&apos;t edit after this.</p>
            <div className="mt-2 flex gap-3">
              <button type="button" disabled={busy} onClick={submitScores} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-700 underline">
                Yes, submit
              </button>
              <button type="button" onClick={() => setConfirmingSubmit(false)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingSubmit(true)}
            className="rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-white"
          >
            Submit Scores
          </button>
        )}
      </div>
    </div>
  );
}
