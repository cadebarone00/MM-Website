"use client";

import { useState } from "react";
import type { HoleEntry } from "@/lib/scorekeeper/types";

export interface ScoreEntryCardProps {
  label: string;
  holes: HoleEntry[];
  onSubmitHole: (hole: number, score: number, putts: number, fir: boolean, gir: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function ScoreEntryCard({ label, holes, onSubmitHole }: ScoreEntryCardProps) {
  const [draft, setDraft] = useState<Record<number, { score: string; putts: string; fir: boolean; gir: boolean }>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  function draftFor(hole: HoleEntry) {
    return draft[hole.hole] ?? { score: hole.score ? String(hole.score) : "", putts: hole.putts ? String(hole.putts) : "", fir: hole.fir === 1, gir: hole.gir === 1 };
  }

  function setField(holeNum: number, hole: HoleEntry, field: "score" | "putts" | "fir" | "gir", value: string | boolean) {
    setDraft((d) => ({ ...d, [holeNum]: { ...draftFor(hole), [field]: value } }));
  }

  async function save(hole: HoleEntry) {
    const d = draftFor(hole);
    const score = Number(d.score);
    if (!score || score < 1) {
      setErrors((e) => ({ ...e, [hole.hole]: "Enter a score first." }));
      return;
    }
    setSaving(hole.hole);
    setErrors((e) => ({ ...e, [hole.hole]: "" }));
    const result = await onSubmitHole(hole.hole, score, Number(d.putts) || 0, d.fir, d.gir);
    setSaving(null);
    if (!result.ok) setErrors((e) => ({ ...e, [hole.hole]: result.error }));
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <h3 className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</h3>
      <div className="mt-3 flex flex-col gap-2">
        {holes.map((hole) => {
          const isPar3 = hole.par === 3;
          const d = draftFor(hole);
          return (
            <div key={hole.hole} className="flex flex-wrap items-center gap-2 border-b border-ink-100 py-2 last:border-b-0">
              <span className="w-16 font-sans text-sm font-semibold text-ink-900">Hole {hole.hole}</span>
              <span className="w-12 font-sans text-xs text-ink-400">Par {hole.par}</span>
              <input
                type="number"
                min={1}
                placeholder="Score"
                value={d.score}
                onChange={(e) => setField(hole.hole, hole, "score", e.target.value)}
                className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
              />
              <input
                type="number"
                min={0}
                placeholder="Putts"
                value={d.putts}
                onChange={(e) => setField(hole.hole, hole, "putts", e.target.value)}
                className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
              />
              {!isPar3 && (
                <label className="flex items-center gap-1 font-sans text-xs text-ink-500">
                  <input type="checkbox" checked={d.fir} onChange={(e) => setField(hole.hole, hole, "fir", e.target.checked)} /> FIR
                </label>
              )}
              <label className="flex items-center gap-1 font-sans text-xs text-ink-500">
                <input type="checkbox" checked={d.gir} onChange={(e) => setField(hole.hole, hole, "gir", e.target.checked)} /> GIR
              </label>
              <button
                type="button"
                disabled={saving === hole.hole}
                onClick={() => save(hole)}
                className="rounded-sm bg-maroon-700 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
              >
                {saving === hole.hole ? "Saving…" : "Save"}
              </button>
              {errors[hole.hole] && <span className="w-full font-sans text-xs text-red-600">{errors[hole.hole]}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
