"use client";

export function ScoringHoleSelector({ selectedHole, onSelect }: { selectedHole: number; onSelect: (hole: number) => void }) {
  return <div className="mt-4 flex flex-wrap gap-1" aria-label="Select hole">
    {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
      <button key={hole} type="button" onClick={() => onSelect(hole)} aria-label={`Hole ${hole}`} aria-pressed={hole === selectedHole} className={`h-8 w-8 rounded-sm font-condensed text-xs font-bold ${hole === selectedHole ? "bg-maroon-700 text-white" : "bg-stone-100 text-ink-700"}`}>
        {hole}
      </button>
    ))}
  </div>;
}
