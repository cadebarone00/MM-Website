"use client";

import { usePersistentState } from "@/lib/usePersistentState";
import { useState } from "react";
import type { HandicapCourseTeeSet, HandicapHoleInput, ShotDirection } from "@/lib/handicap/types";
import { buildScorecardRows } from "@/lib/handicap/scorecard";
import type { ScorecardHoleRow } from "@/lib/portal/scorecard";
import { ScoringRoundHeader } from "@/components/portal/ScoringRoundHeader";
import { Scorecard } from "@/components/portal/Scorecard";
import { ScorePicker } from "@/components/portal/ScorePicker";
import { PuttsPicker } from "@/components/portal/PuttsPicker";
import { ShotDirectionPicker, type ShotResult } from "@/components/portal/ShotDirectionPicker";
import { HoleActionBar } from "@/components/portal/HoleActionBar";
import styles from "@/components/portal/ScoringPanel.module.css";

type Draft = Record<number, { score: string; putts: string; fir: boolean; gir: boolean; firDirection: ShotDirection | null; girDirection: ShotDirection | null }>;

function emptyDraft(teeSet: HandicapCourseTeeSet): Draft {
  const draft: Draft = {};
  for (const hole of teeSet.holes) {
    // Score preselects at par — Next Hole saves whatever's showing, so an
    // untouched hole records a par unless you change it.
    draft[hole.number] = { score: String(hole.par), putts: "", fir: false, gir: false, firDirection: null, girDirection: null };
  }
  return draft;
}

function seedDraftFromHoles(teeSet: HandicapCourseTeeSet, initialHoles: HandicapHoleInput[]): Draft {
  const draft = emptyDraft(teeSet);
  for (const hole of initialHoles) {
    draft[hole.hole] = {
      score: String(hole.score),
      putts: String(hole.putts),
      fir: hole.fir,
      gir: hole.gir,
      firDirection: hole.firDirection,
      girDirection: hole.girDirection,
    };
  }
  return draft;
}

export function HandicapHoleEntry({
  teeSet,
  draftKey,
  onBack,
  onSubmit,
  initialHoles,
}: {
  teeSet: HandicapCourseTeeSet;
  draftKey?: string;
  onBack: () => void;
  onSubmit: (holes: HandicapHoleInput[]) => Promise<{ ok: boolean; error?: string }>;
  initialHoles?: HandicapHoleInput[];
  playerName?: string;
  courseName?: string;
}) {
  const [draft, setDraft, storage] = usePersistentState<Draft>(draftKey ?? null, () =>
    initialHoles ? seedDraftFromHoles(teeSet, initialHoles) : emptyDraft(teeSet)
  );
  const [selectedHole, setSelectedHole] = useState(1);
  const [showScorecard, setShowScorecard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function setField(holeNumber: number, field: "score" | "putts", value: string) {
    setDraft((current) => ({ ...current, [holeNumber]: { ...current[holeNumber], [field]: value } }));
  }

  function setShotResult(holeNumber: number, kind: "fir" | "gir", result: ShotResult) {
    setDraft((current) => {
      const entry = current[holeNumber];
      const hit = result === "hit";
      const next = kind === "fir"
        ? { ...entry, fir: hit, firDirection: hit ? null : result }
        : { ...entry, gir: hit, girDirection: hit ? null : result };
      return { ...current, [holeNumber]: next };
    });
  }

  async function handleSubmit(rows: ScorecardHoleRow[]) {
    const holes: HandicapHoleInput[] = rows.map((row) => ({
      hole: row.hole,
      score: row.score ?? 0,
      putts: row.putts ?? 0,
      fir: row.fir ?? false,
      gir: row.gir ?? false,
      firDirection: row.firDirection,
      girDirection: row.girDirection,
    }));
    setSubmitting(true);
    setSubmitError(null);
    const result = await onSubmit(holes);
    if (!result.ok) {
      setSubmitError(result.error ?? "Could not submit this round.");
      setSubmitting(false);
    }
  }

  if (!storage.ready) return <p>Restoring hole entries...</p>;

  const hole = teeSet.holes.find((entry) => entry.number === selectedHole)!;
  const entry = draft[selectedHole];
  const enteredHoles = teeSet.holes.filter((h) => h.number <= selectedHole && Number(draft[h.number]?.score) > 0);
  const totalScore = enteredHoles.reduce((sum, h) => sum + Number(draft[h.number].score), 0);
  const toPar = enteredHoles.length > 0 ? totalScore - enteredHoles.reduce((sum, h) => sum + h.par, 0) : null;
  const firValue: ShotResult | null = entry.fir ? "hit" : entry.firDirection;
  const girValue: ShotResult | null = entry.gir ? "hit" : entry.girDirection;
  const isLastHole = selectedHole === 18;

  if (showScorecard) {
    const rows = buildScorecardRows(teeSet, draft);
    const enteredRows = rows.filter((row) => row.score != null);
    const scorecardTotal = enteredRows.reduce((sum, row) => sum + (row.score ?? 0), 0);
    const scorecardToPar = enteredRows.length > 0 ? scorecardTotal - enteredRows.reduce((sum, row) => sum + row.par, 0) : null;
    return (
      <Scorecard
        rows={rows}
        totalScore={scorecardTotal}
        toPar={scorecardToPar}
        onEditHole={(hole) => { setSelectedHole(hole); setShowScorecard(false); }}
        onBack={() => setShowScorecard(false)}
        onSubmit={() => handleSubmit(rows)}
        submitting={submitting}
        submitError={submitError}
      />
    );
  }

  return (
    <div className={styles.panel + " " + styles.handicap}>
      <div data-hole-header className="-mx-4 sm:-mx-7"><ScoringRoundHeader hole={selectedHole} par={hole.par} yards={hole.yards} totalScore={totalScore} toPar={toPar} /></div>
      <button type="button" onClick={() => setShowScorecard(true)} className="mx-auto block font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700 underline underline-offset-2">Scorecard</button>
      <div className={styles.notice} aria-live="polite">{storage.storageError && <p role="alert">Browser storage is unavailable. Keep this page open until you submit.</p>}</div>
      <div className={styles.scores}>
        <div className="-mx-4 bg-white px-4 text-maroon-800 sm:-mx-7 sm:px-7">
          <p className="text-center font-condensed font-bold uppercase tracking-wide">Your score</p>
          <ScorePicker key={selectedHole} ariaLabel={"Hole " + selectedHole + " score"} par={hole.par} value={entry.score ? Number(entry.score) : null} onChange={(score) => setField(selectedHole, "score", String(score))} />
        </div>
      </div>
      <div className={styles.stats}>
        <div data-compasses className="relative grid grid-cols-2 items-start gap-4">
          <div aria-hidden className="absolute bottom-0 left-1/2 top-5 w-px bg-gold-400" />
          <div className="flex justify-center"><ShotDirectionPicker label="Fairway" notApplicable={hole.par === 3} value={firValue} onChange={(result) => setShotResult(selectedHole, "fir", result)} /></div>
          <div className="flex justify-center"><ShotDirectionPicker label="GIR" penaltyOption value={girValue} onChange={(result) => setShotResult(selectedHole, "gir", result)} /></div>
        </div>
        <p data-putts-label className="text-center font-condensed font-bold uppercase tracking-wide text-maroon-800">Putts</p>
        <div className="mt-1"><PuttsPicker ariaLabel="Your putts" value={entry.putts ? Number(entry.putts) : null} onChange={(putts) => setField(selectedHole, "putts", String(putts))} /></div>
      </div>
      <div className={styles.actions}>
        <HoleActionBar nextLabel={isLastHole ? "Review Round" : "Next Hole"} onNext={() => (isLastHole ? setShowScorecard(true) : setSelectedHole((h) => Math.min(h + 1, 18)))} />
        <button type="button" onClick={onBack} className="mx-auto block font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700 underline">Edit setup</button>
      </div>
    </div>
  );
}
