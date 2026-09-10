"use client";

import { useState } from "react";
import type { HandicapCourseTeeSet, HandicapHoleInput, ShotDirection } from "@/lib/handicap/types";
import { ScoreToParHeader } from "@/components/portal/ScoreToParHeader";
import { ScorePicker } from "@/components/portal/ScorePicker";
import { PuttsPicker } from "@/components/portal/PuttsPicker";
import { ShotDirectionPicker, type ShotResult } from "@/components/portal/ShotDirectionPicker";
import { HoleActionBar } from "@/components/portal/HoleActionBar";

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
  onBack,
  onComplete,
  initialHoles,
  courseName,
}: {
  teeSet: HandicapCourseTeeSet;
  onBack: () => void;
  onComplete: (holes: HandicapHoleInput[]) => void;
  initialHoles?: HandicapHoleInput[];
  playerName?: string;
  courseName?: string;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    initialHoles ? seedDraftFromHoles(teeSet, initialHoles) : emptyDraft(teeSet)
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedHole, setSelectedHole] = useState(1);

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

  function handleContinue() {
    const holes: HandicapHoleInput[] = [];
    for (const hole of teeSet.holes) {
      const entry = draft[hole.number];
      const score = Number(entry?.score);
      if (!entry?.score || !Number.isInteger(score) || score < 1) {
        setError(`Enter a score for hole ${hole.number}.`);
        setSelectedHole(hole.number);
        return;
      }
      if (!Number.isInteger(Number(entry.putts)) || Number(entry.putts) < 0) {
        setError(`Enter a valid putts count for hole ${hole.number}.`);
        setSelectedHole(hole.number);
        return;
      }
      holes.push({ hole: hole.number, score, putts: Number(entry.putts) || 0, fir: entry.fir, gir: entry.gir, firDirection: entry.firDirection, girDirection: entry.girDirection });
    }
    setError(null);
    onComplete(holes);
  }

  const hole = teeSet.holes.find((entry) => entry.number === selectedHole)!;
  const entry = draft[selectedHole];
  const enteredHoles = teeSet.holes.filter((h) => Number(draft[h.number]?.score) > 0);
  const totalScore = enteredHoles.reduce((sum, h) => sum + Number(draft[h.number].score), 0);
  const toPar = enteredHoles.length > 0 ? totalScore - enteredHoles.reduce((sum, h) => sum + h.par, 0) : null;
  const firValue: ShotResult | null = entry.fir ? "hit" : entry.firDirection;
  const girValue: ShotResult | null = entry.gir ? "hit" : entry.girDirection;
  const isLastHole = selectedHole === 18;

  return (
    <div className="fixed inset-0 z-40 flex h-dvh flex-col overflow-hidden bg-white px-4 py-3 lg:static lg:z-auto lg:h-auto lg:flex-none lg:overflow-visible lg:bg-transparent lg:p-0">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-xl font-bold text-ink-900 lg:text-2xl">Your round</h1>
        <button type="button" onClick={onBack} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline">Edit setup</button>
      </div>
      <p className="mt-0.5 font-sans text-xs text-ink-500 lg:text-sm">{courseName ? `${courseName} · ` : ""}{teeSet.name}</p>

      {error && <p role="alert" className="mt-2 rounded-sm bg-red-50 px-3 py-2 font-sans text-xs text-red-700">{error}</p>}

      <div className="mt-3">
        <ScoreToParHeader totalScore={totalScore} toPar={toPar} />
      </div>

      <div className="mt-3 flex flex-1 flex-col justify-center overflow-hidden rounded-lg border-2 border-stone-300 p-3 lg:flex-none lg:overflow-visible lg:p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-condensed text-sm font-bold uppercase tracking-wide text-ink-900">Hole {selectedHole}</span>
          <span className="font-sans text-xs text-ink-500">Par {hole.par} · {hole.yards} yards</span>
        </div>

        <div className="mt-2">
          <ScorePicker ariaLabel={`Hole ${selectedHole} score`} par={hole.par} value={entry.score ? Number(entry.score) : null} onChange={(score) => setField(selectedHole, "score", String(score))} />
        </div>

        <div className="mt-3 flex items-start justify-center gap-6">
          {hole.par !== 3 && (
            <ShotDirectionPicker label="Fairway" value={firValue} onChange={(result) => setShotResult(selectedHole, "fir", result)} />
          )}
          <ShotDirectionPicker label="GIR" penaltyOption value={girValue} onChange={(result) => setShotResult(selectedHole, "gir", result)} />
        </div>

        <p className="mt-3 text-center font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Putts</p>
        <div className="mt-1">
          <PuttsPicker ariaLabel={`Hole ${selectedHole} putts`} value={entry.putts ? Number(entry.putts) : null} onChange={(putts) => setField(selectedHole, "putts", String(putts))} />
        </div>
      </div>

      <HoleActionBar
        nextLabel={isLastHole ? "Review Round" : "Next Hole"}
        onNext={() => (isLastHole ? handleContinue() : setSelectedHole((h) => Math.min(h + 1, 18)))}
      />
    </div>
  );
}
