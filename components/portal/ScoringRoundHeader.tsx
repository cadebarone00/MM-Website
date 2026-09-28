"use client";

export function ScoringRoundHeader({ hole, teeSetName, par, yards, totalScore, toPar }: {
  hole: number; teeSetName?: string | null; par: number | null; yards: number | null; totalScore: number; toPar: number | null;
}) {
  return <div className="border-y border-gold-400 bg-cream-100 py-2 text-maroon-800">
    <div className="grid grid-cols-3 items-center py-2 text-center font-condensed text-xl font-bold uppercase tracking-wide sm:text-2xl">
      <span>Hole {hole}{teeSetName ? ` - ${teeSetName}` : ""}</span><span>{yards ?? "-"} yards</span><span>Par {par ?? "-"}</span>
    </div>
    <div aria-hidden className="mx-5 h-px bg-gold-400" />
    <div className="flex items-center justify-center gap-4 py-2 text-center font-condensed text-lg font-bold uppercase tracking-wide sm:text-xl">
      <span>Total: {totalScore}</span><span>To par: {toPar == null ? "-" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar}</span>
    </div>
  </div>;
}
