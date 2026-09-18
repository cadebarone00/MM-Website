"use client";

export function ScoringRoundHeader({ hole, par, yards, totalScore, toPar, onRecap }: {
  hole: number; par: number | null; yards: number | null; totalScore: number; toPar: number | null; onRecap?: () => void;
}) {
  return <div className="border-y border-gold-400 bg-cream-100 py-2 text-maroon-800">
    <div className="grid grid-cols-3 items-center py-2 text-center font-condensed text-xl font-bold uppercase tracking-wide sm:text-2xl">
      <span>Hole {hole}</span><span>Par {par ?? "\u2014"}</span><span>{yards ?? "\u2014"} yards</span>
    </div>
    <div aria-hidden className="mx-5 h-px bg-gold-400" />
    <div className="grid grid-cols-2 items-center py-2 text-center font-condensed text-lg font-bold uppercase tracking-wide sm:text-xl">
      <span>Total: {totalScore}</span><span>To par: {toPar == null ? "\u2014" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar}</span>
    </div>
    {onRecap && (
      <div className="flex justify-center pb-1">
        <button type="button" onClick={onRecap} className="font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700 underline underline-offset-2">
          Round Recap
        </button>
      </div>
    )}
  </div>;
}
