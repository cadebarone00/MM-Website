"use client";

import { useState } from "react";
import type { HandicapCourseTeeSet, HandicapHoleInput } from "@/lib/handicap/types";

type Draft = Record<number, { score: string; putts: string; fir: boolean; gir: boolean }>;

function emptyDraft(teeSet: HandicapCourseTeeSet): Draft {
  const draft: Draft = {};
  for (const hole of teeSet.holes) {
    draft[hole.number] = { score: "", putts: "", fir: false, gir: false };
  }
  return draft;
}

export function HandicapHoleEntry({
  teeSet,
  onBack,
  onComplete,
}: {
  teeSet: HandicapCourseTeeSet;
  onBack: () => void;
  onComplete: (holes: HandicapHoleInput[]) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(teeSet));
  const [error, setError] = useState<string | null>(null);

  function setField(holeNumber: number, field: keyof Draft[number], value: string | boolean) {
    setDraft((current) => ({ ...current, [holeNumber]: { ...current[holeNumber], [field]: value } }));
  }

  function handleContinue() {
    const holes: HandicapHoleInput[] = [];
    for (const hole of teeSet.holes) {
      const entry = draft[hole.number];
      const score = Number(entry?.score);
      if (!entry?.score || !score || score < 1) {
        setError(`Enter a score for hole ${hole.number}.`);
        return;
      }
      holes.push({ hole: hole.number, score, putts: Number(entry.putts) || 0, fir: entry.fir, gir: entry.gir });
    }
    setError(null);
    onComplete(holes);
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Enter your round</h1>
        <button type="button" onClick={onBack} className="font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Back</button>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {teeSet.holes.map((hole) => {
          const isPar3 = hole.par === 3;
          const entry = draft[hole.number];
          return (
            <div key={hole.number} className="flex flex-wrap items-center gap-2 border-b border-ink-100 py-2 last:border-b-0">
              <span className="w-16 font-sans text-sm font-semibold text-ink-900">Hole {hole.number}</span>
              <span className="w-14 font-sans text-xs text-ink-400">Par {hole.par}</span>
              <input
                type="number"
                min={1}
                placeholder="Score"
                value={entry.score}
                onChange={(e) => setField(hole.number, "score", e.target.value)}
                className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
              />
              <input
                type="number"
                min={0}
                placeholder="Putts"
                value={entry.putts}
                onChange={(e) => setField(hole.number, "putts", e.target.value)}
                className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
              />
              {!isPar3 && (
                <label className="flex items-center gap-1 font-sans text-xs text-ink-500">
                  <input type="checkbox" checked={entry.fir} onChange={(e) => setField(hole.number, "fir", e.target.checked)} /> Fairway
                </label>
              )}
              <label className="flex items-center gap-1 font-sans text-xs text-ink-500">
                <input type="checkbox" checked={entry.gir} onChange={(e) => setField(hole.number, "gir", e.target.checked)} /> Green
              </label>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={handleContinue}
        className="mt-4 w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white"
      >
        Review round
      </button>
    </div>
  );
}
