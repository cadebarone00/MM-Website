// components/portal/tiger/ScorecardEditor.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseInfoHeader } from "@/components/scorecard/CourseInfoHeader";
import { ScorecardRow } from "@/components/scorecard/ScorecardRow";
import { MobileScorecardGrid } from "@/components/scorecard/MobileScorecardGrid";
import { EditableHoleDetail } from "./EditableHoleDetail";
import { EditableShotVideoPanel } from "./EditableShotVideoPanel";
import type { HoleStat, RoundScorecard } from "@/lib/data";

export function ScorecardEditor({
  tournamentSlug,
  playerSlug,
  initialScorecard,
  initialVideoUrls,
  backHref,
}: {
  tournamentSlug: string;
  playerSlug: string;
  initialScorecard: RoundScorecard;
  initialVideoUrls: Record<number, Record<number, string>>;
  backHref: string;
}) {
  const router = useRouter();
  const [holes, setHoles] = useState<HoleStat[]>(initialScorecard.holes);
  const [selectedHole, setSelectedHole] = useState(1);
  const [stagedVideos, setStagedVideos] = useState<Record<number, Record<number, File>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const dirtyHoles = holes.filter((h, i) => {
    const original = initialScorecard.holes[i];
    return h.score !== original.score || h.putts !== original.putts || h.fir !== original.fir || h.gir !== original.gir;
  });
  const stagedCount = Object.values(stagedVideos).reduce((sum, byShot) => sum + Object.keys(byShot).length, 0);
  const isDirty = dirtyHoles.length > 0 || stagedCount > 0;

  // Covers tab close, refresh, and typing a new URL/using browser back-forward
  // — every real browser navigation. It does not cover this component's own
  // in-app "back" link below, which is guarded separately (see backHref).
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Recompute the aggregate fields (Total, Out/In feed off round.holes directly,
  // but the grand Total cell in ScorecardRow/MobileScorecardGrid reads round.total
  // verbatim) from the current, possibly-edited holes — otherwise Total would stay
  // frozen at its as-fetched value and visibly disagree with Out+In after an edit.
  // Same formulas as toRoundScorecard in lib/data/archivedScorecards.ts.
  const played = holes.filter((h) => h.score > 0);
  const firApplicable = holes.filter((h) => h.fir !== "X");
  const activeForDisplay: RoundScorecard = {
    ...initialScorecard,
    holes,
    total: played.reduce((s, h) => s + h.score, 0),
    toPar: played.reduce((s, h) => s + (h.score - h.par), 0),
    putts: played.reduce((s, h) => s + h.putts, 0),
    girHit: holes.filter((h) => h.gir === 1).length,
    girTotal: holes.length,
    firHit: firApplicable.filter((h) => h.fir === 1).length,
    firTotal: firApplicable.length,
  };
  const holeStat = holes.find((h) => h.hole === selectedHole) ?? null;

  function updateHole(next: HoleStat) {
    setHoles((prev) => prev.map((h) => (h.hole === next.hole ? next : h)));
  }

  function stageVideo(shot: number, file: File) {
    setStagedVideos((prev) => ({ ...prev, [selectedHole]: { ...(prev[selectedHole] ?? {}), [shot]: file } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Score edits go first, on purpose: the video endpoint checks a shot
      // number against the hole's *current* score in the database, so a
      // raised score (e.g. 4 -> 6, adding shots 5-6) must already be saved
      // before a video for one of those new shots can be accepted.
      if (dirtyHoles.length > 0) {
        const res = await fetch("/api/portal/tiger/scorecards/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tournamentSlug,
            playerSlug,
            round: initialScorecard.round,
            holes: dirtyHoles.map((h) => ({ hole: h.hole, score: h.score, putts: h.putts, fir: String(h.fir), gir: h.gir === 1 })),
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
      }

      for (const [holeStr, byShot] of Object.entries(stagedVideos)) {
        for (const [shotStr, file] of Object.entries(byShot)) {
          const form = new FormData();
          form.set("tournamentSlug", tournamentSlug);
          form.set("playerSlug", playerSlug);
          form.set("round", String(initialScorecard.round));
          form.set("hole", holeStr);
          form.set("shotNumber", shotStr);
          form.set("file", file);
          const res = await fetch("/api/portal/tiger/scorecards/video", { method: "POST", body: form });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error);
        }
      }

      router.push(backHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function handleBackClick() {
    if (isDirty) setConfirmingLeave(true);
    else router.push(backHref);
  }

  return (
    <div>
      <button type="button" onClick={handleBackClick} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
        ← Back to rounds
      </button>
      <h1 className="mt-2 font-serif text-2xl font-bold text-ink-900">
        Round {initialScorecard.round} — {initialScorecard.course}
      </h1>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <div className="mt-4 hidden overflow-x-auto overflow-y-hidden sm:block">
        <div className="w-max rounded-2xl border border-ink-300 bg-cream-100">
          <CourseInfoHeader round={activeForDisplay} onHoleClick={setSelectedHole} selectedHole={selectedHole} />
          <ScorecardRow round={activeForDisplay} onHoleClick={setSelectedHole} selectedHole={selectedHole} />
        </div>
      </div>
      <div className="mt-4 -mx-7 sm:hidden">
        <MobileScorecardGrid round={activeForDisplay} selectedHole={selectedHole} onHoleClick={setSelectedHole} initialHole={selectedHole} />
      </div>

      {holeStat && (
        <div className="mt-3">
          <EditableHoleDetail key={selectedHole} hole={holeStat} onChange={updateHole} />
          <div className="mt-3">
            <EditableShotVideoPanel
              key={selectedHole}
              shotCount={holeStat.score}
              existingUrls={initialVideoUrls[selectedHole] ?? {}}
              stagedFiles={stagedVideos[selectedHole] ?? {}}
              onStage={stageVideo}
            />
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-stone-200 pt-4">
        <button
          type="button"
          disabled={!isDirty || saving}
          onClick={save}
          className="rounded-lg bg-maroon-700 px-6 py-3 font-condensed text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {confirmingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-lg bg-white p-5">
            <p className="font-sans text-sm text-ink-700">You have unsaved changes. Leave without saving?</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={saving} onClick={save} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
                Save & Leave
              </button>
              <button type="button" onClick={() => router.push(backHref)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-700 underline">
                Leave Without Saving
              </button>
              <button type="button" onClick={() => setConfirmingLeave(false)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
