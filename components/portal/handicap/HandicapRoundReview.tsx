"use client";

import { useState } from "react";
import type { HandicapHoleInput } from "@/lib/handicap/types";
import type { RoundSetup } from "./HandicapRoundWizard";

export function HandicapRoundReview({
  setup,
  holes,
  onBack,
  onSubmitted,
}: {
  setup: RoundSetup;
  holes: HandicapHoleInput[];
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalScore = holes.reduce((sum, h) => sum + h.score, 0);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/handicap/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: setup.course.id,
          teeSetId: setup.teeSet.id,
          datePlayed: setup.datePlayed,
          teeTime: setup.teeTime || null,
          holes,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not submit this round.");
        setSubmitting(false);
        return;
      }
      onSubmitted();
    } catch {
      setError("Could not submit this round. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Review round</h1>
        <button type="button" onClick={onBack} disabled={submitting} className="font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Back</button>
      </div>
      <p className="mt-1 font-sans text-sm text-ink-600">{setup.course.name} · {setup.teeSet.name} · Rating {setup.teeSet.rating} · Slope {setup.teeSet.slope}</p>

      <div className="mt-3 flex flex-col gap-1">
        {holes.map((hole) => {
          const holeInfo = setup.teeSet.holes.find((h) => h.number === hole.hole)!;
          return (
            <div key={hole.hole} className="flex items-center gap-3 border-b border-ink-100 py-1.5 last:border-b-0 font-sans text-sm text-ink-700">
              <span className="w-16 font-semibold">Hole {hole.hole}</span>
              <span className="w-14 text-ink-400">Par {holeInfo.par}</span>
              <span className="w-20">Score {hole.score}</span>
              <span className="w-20">Putts {hole.putts}</span>
              <span className="w-24">{holeInfo.par === 3 ? "FIR n/a" : hole.fir ? "Fairway hit" : "Fairway missed"}</span>
              <span>{hole.gir ? "GIR" : "No GIR"}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 font-serif text-xl font-bold text-ink-900">Total: {totalScore}</p>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={handleSubmit}
        className="mt-4 w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}
