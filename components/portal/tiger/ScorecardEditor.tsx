// components/portal/tiger/ScorecardEditor.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseInfoHeader } from "@/components/scorecard/CourseInfoHeader";
import { ScorecardRow } from "@/components/scorecard/ScorecardRow";
import { MobileScorecardGrid } from "@/components/scorecard/MobileScorecardGrid";
import { EditableHoleDetail } from "./EditableHoleDetail";
import { EditableShotVideoPanel, type StagedVideo } from "./EditableShotVideoPanel";
import type { HoleStat, RoundScorecard } from "@/lib/data";

/**
 * Uploads a file straight to Supabase Storage's signed-upload URL with real
 * byte-level progress. supabase-js's own `uploadToSignedUrl` uses `fetch`,
 * which has no reliable cross-browser upload-progress event — XHR does
 * (`xhr.upload.onprogress`), so this replicates that same request shape
 * (a PUT with `cacheControl` + the file under an empty-string field name,
 * matching @supabase/storage-js's StorageFileApi.uploadToSignedUrl) by hand.
 */
function uploadFileWithProgress(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (status ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}

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
  // The baseline hole edits are compared against, and the known video URLs
  // (real, already-saved ones) — both start from the initial fetch and get
  // advanced locally after a successful Save, since this screen no longer
  // navigates away on save and so can't just re-fetch fresh props.
  const [savedHoles, setSavedHoles] = useState<HoleStat[]>(initialScorecard.holes);
  const [videoUrls, setVideoUrls] = useState<Record<number, Record<number, string>>>(initialVideoUrls);
  const [selectedHole, setSelectedHole] = useState(1);
  const [stagedVideos, setStagedVideos] = useState<Record<number, Record<number, StagedVideo>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const dirtyHoles = holes.filter((h, i) => {
    const baseline = savedHoles[i];
    return h.score !== baseline.score || h.putts !== baseline.putts || h.fir !== baseline.fir || h.gir !== baseline.gir;
  });
  const stagedList = Object.values(stagedVideos).flatMap((byShot) => Object.values(byShot));
  const stagedCount = stagedList.length;
  const anyUploading = stagedList.some((v) => v.status === "uploading");
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

  // The "Saved" confirmation clears itself after a few seconds rather than
  // sitting there forever.
  useEffect(() => {
    if (!savedMessage) return;
    const timer = setTimeout(() => setSavedMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [savedMessage]);

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

  function setStagedField(hole: number, shot: number, patch: Partial<StagedVideo>) {
    setStagedVideos((prev) => ({
      ...prev,
      [hole]: { ...(prev[hole] ?? {}), [shot]: { ...(prev[hole]?.[shot] as StagedVideo), ...patch } },
    }));
  }

  // Upload starts the moment a video is picked — not deferred to Save — so
  // the slow part (moving real video bytes) happens while Tiger is still
  // looking at it, with a real progress bar, rather than being hidden
  // inside a generic "Saving…" spinner that used to make Save itself feel
  // stuck. Save's job for a video, once this resolves to "ready", is just
  // the lightweight confirm call.
  async function stageVideo(shot: number, file: File) {
    const hole = selectedHole;
    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".mp4";
    setStagedVideos((prev) => ({
      ...prev,
      [hole]: { ...(prev[hole] ?? {}), [shot]: { file, status: "uploading", progress: 0, extension } },
    }));

    try {
      const signRes = await fetch("/api/portal/tiger/scorecards/video/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentSlug, playerSlug, round: initialScorecard.round, hole, shotNumber: shot, extension }),
      });
      const signData = await signRes.json();
      if (!signData.ok) throw new Error(signData.error);

      const uploadUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/shot-videos/${signData.path}?token=${signData.token}`;
      await uploadFileWithProgress(uploadUrl, file, (progress) => setStagedField(hole, shot, { progress }));

      setStagedField(hole, shot, { status: "ready", progress: 1 });
    } catch (err) {
      setStagedField(hole, shot, { status: "error", errorMessage: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  /** Returns whether the save actually succeeded — saveAndLeave (below) only navigates away on a true. */
  async function save(): Promise<boolean> {
    if (anyUploading) return false; // the button is disabled for this too — belt and suspenders
    setSaving(true);
    setError(null);
    try {
      // Score edits go first, on purpose: the video confirm endpoint checks
      // a shot number against the hole's *current* score in the database,
      // so a raised score (e.g. 4 -> 6, adding shots 5-6) must already be
      // saved before a video for one of those new shots can be confirmed.
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

      // The actual upload already happened when each video was picked —
      // this just links whichever ones finished ("ready") to their shot.
      // A video that's still mid-upload can't get here (Save is disabled
      // while anyUploading); one that failed is quietly left staged so
      // Tiger can retry it separately rather than blocking everything else.
      const newVideoUrls: Record<number, Record<number, string>> = {};
      for (const [holeStr, byShot] of Object.entries(stagedVideos)) {
        const hole = Number(holeStr);
        for (const [shotStr, staged] of Object.entries(byShot)) {
          if (staged.status !== "ready") continue;
          const shot = Number(shotStr);
          const confirmRes = await fetch("/api/portal/tiger/scorecards/video/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tournamentSlug, playerSlug, round: initialScorecard.round, hole, shotNumber: shot, extension: staged.extension }),
          });
          const confirmData = await confirmRes.json();
          if (!confirmData.ok) throw new Error(confirmData.error);
          newVideoUrls[hole] = { ...(newVideoUrls[hole] ?? {}), [shot]: confirmData.url };
        }
      }

      // Everything above succeeded — advance the local baselines so this
      // screen reads as fully saved, and drop only the videos that were
      // just confirmed (an error'd one stays staged for a retry).
      setSavedHoles(holes);
      setVideoUrls((prev) => {
        const next = { ...prev };
        for (const [holeStr, byShot] of Object.entries(newVideoUrls)) {
          next[Number(holeStr)] = { ...(next[Number(holeStr)] ?? {}), ...byShot };
        }
        return next;
      });
      setStagedVideos((prev) => {
        const next: typeof prev = {};
        for (const [holeStr, byShot] of Object.entries(prev)) {
          const remaining = Object.fromEntries(Object.entries(byShot).filter(([, v]) => v.status !== "ready"));
          if (Object.keys(remaining).length > 0) next[Number(holeStr)] = remaining;
        }
        return next;
      });
      setSavedMessage("Saved");
      setConfirmingLeave(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndLeave() {
    const ok = await save();
    if (ok) router.push(backHref);
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
      {savedMessage && <p className="mt-3 rounded-sm bg-green-50 px-3 py-2 font-sans text-sm text-green-700">{savedMessage}</p>}

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
              existingUrls={videoUrls[selectedHole] ?? {}}
              stagedVideos={stagedVideos[selectedHole] ?? {}}
              onStage={stageVideo}
            />
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-stone-200 pt-4">
        {anyUploading && <p className="mb-2 font-sans text-xs text-ink-500">Uploading video… Save will be available once it finishes.</p>}
        <button
          type="button"
          disabled={!isDirty || saving || anyUploading}
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
            {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={saving || anyUploading} onClick={saveAndLeave} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
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
