"use client";

import { useState } from "react";
import type { HandicapCourseTeeSet, HandicapHoleInput, ShotDirection } from "@/lib/handicap/types";
import { ScoringRoundHeader } from "@/components/portal/ScoringRoundHeader";
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
  const enteredHoles = teeSet.holes.filter((h) => h.number <= selectedHole && Number(draft[h.number]?.score) > 0);
  const totalScore = enteredHoles.reduce((sum, h) => sum + Number(draft[h.number].score), 0);
  const toPar = enteredHoles.length > 0 ? totalScore - enteredHoles.reduce((sum, h) => sum + h.par, 0) : null;
  const firValue: ShotResult | null = entry.fir ? "hit" : entry.firDirection;
  const girValue: ShotResult | null = entry.gir ? "hit" : entry.girDirection;
  const isLastHole = selectedHole === 18;

  return (
    <div className="-mx-4 -mt-[3.25rem] bg-white sm:-mx-7 lg:mx-0 lg:mt-0">
      <ScoringRoundHeader hole={selectedHole} par={hole.par} yards={hole.yards} totalScore={totalScore} toPar={toPar} />

      <div className="flex flex-col px-4 pb-2 pt-5">
        {error && <p role="alert" className="mb-2 rounded-sm bg-red-50 px-3 py-2 font-sans text-xs text-red-700">{error}</p>}

        <ScorePicker ariaLabel={`Hole ${selectedHole} score`} par={hole.par} value={entry.score ? Number(entry.score) : null} onChange={(score) => setField(selectedHole, "score", String(score))} />

        <div className="mt-4 grid grid-cols-2 divide-x divide-ink-200">
          <div className="flex items-start justify-center">
            {hole.par !== 3 && (
              <ShotDirectionPicker label="Fairway" value={firValue} onChange={(result) => setShotResult(selectedHole, "fir", result)} />
            )}
          </div>
          <div className="flex items-start justify-center">
            <ShotDirectionPicker label="GIR" penaltyOption value={girValue} onChange={(result) => setShotResult(selectedHole, "gir", result)} />
          </div>
        </div>

        <p className="mt-6 text-center font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Putts</p>
        <div className="mt-1">
          <PuttsPicker ariaLabel={`Hole ${selectedHole} putts`} value={entry.putts ? Number(entry.putts) : null} onChange={(putts) => setField(selectedHole, "putts", String(putts))} />
        </div>
      </div>

      <div className="px-4 pb-3">
        <HoleActionBar
          nextLabel={isLastHole ? "Review Round" : "Next Hole"}
          onNext={() => (isLastHole ? handleContinue() : setSelectedHole((h) => Math.min(h + 1, 18)))}
        />
        <button type="button" onClick={onBack} className="mt-4 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700 underline">Edit setup</button>
      </div>
    </div>
  );
}
