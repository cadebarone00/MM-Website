"use client";

import { useState } from "react";
import type { HandicapCourseTeeSet, HandicapHoleInput } from "@/lib/handicap/types";
import { ScoringHoleSelector } from "@/components/portal/ScoringHoleSelector";

type Draft = Record<number, { score: string; putts: string; fir: boolean; gir: boolean }>;

function emptyDraft(teeSet: HandicapCourseTeeSet): Draft {
  const draft: Draft = {};
  for (const hole of teeSet.holes) {
    draft[hole.number] = { score: "", putts: "", fir: false, gir: false };
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
    };
  }
  return draft;
}

export function HandicapHoleEntry({
  teeSet,
  onBack,
  onComplete,
  initialHoles,
  playerName = "Your scorecard",
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

  function setField(holeNumber: number, field: keyof Draft[number], value: string | boolean) {
    setDraft((current) => ({ ...current, [holeNumber]: { ...current[holeNumber], [field]: value } }));
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
      holes.push({ hole: hole.number, score, putts: Number(entry.putts) || 0, fir: entry.fir, gir: entry.gir });
    }
    setError(null);
    onComplete(holes);
  }

  const hole = teeSet.holes.find((entry) => entry.number === selectedHole)!;
  const entry = draft[selectedHole];
  const completed = teeSet.holes.filter((h) => Number(draft[h.number]?.score) > 0).length;
  const inputClass = "w-16 rounded-lg border-2 border-stone-300 px-2 py-1 text-sm";
  const labelClass = "flex items-center gap-1 font-sans text-xs text-ink-700";
  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Your round — Hole {selectedHole}</h1>
      <p className="mt-1 font-sans text-sm text-ink-500">{courseName ? `${courseName} · ` : ""}{teeSet.name} · Par {hole.par} · {hole.yards} yards</p>
      <ScoringHoleSelector selectedHole={selectedHole} onSelect={setSelectedHole} />
      {error && <p role="alert" className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <div className="mt-4 space-y-3">
        <div className="rounded-lg border-2 border-stone-300 p-3">
          <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">{playerName}</span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className={labelClass}>Score<input type="number" min={1} step={1} aria-label={`Hole ${selectedHole} score`} value={entry.score} onChange={(e) => setField(selectedHole, "score", e.target.value)} className={inputClass} /></label>
            <label className={labelClass}>Putts<input type="number" min={0} step={1} aria-label={`Hole ${selectedHole} putts`} value={entry.putts} onChange={(e) => setField(selectedHole, "putts", e.target.value)} className={inputClass} /></label>
            {hole.par !== 3 && <label className={labelClass}><input type="checkbox" checked={entry.fir} onChange={(e) => setField(selectedHole, "fir", e.target.checked)} />FIR</label>}
            <label className={labelClass}><input type="checkbox" checked={entry.gir} onChange={(e) => setField(selectedHole, "gir", e.target.checked)} />GIR</label>
          </div>
        </div>
      </div>
      <div className="mt-6 border-t border-stone-200 pt-4">
        <p className="mb-3 font-sans text-xs text-ink-500">{completed} of 18 holes entered</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleContinue} className="rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-white">Review round</button>
          <button type="button" onClick={onBack} className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500 underline">Edit round setup</button>
        </div>
      </div>
    </div>
  );
}