"use client";

function formatToPar(toPar: number | null): string {
  if (toPar == null) return "—";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

/** "Total Score: 6 | To Par: +2" strip at the top of a hole-scoring card. */
export function ScoreToParHeader({ totalScore, toPar }: { totalScore: number; toPar: number | null }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-lg bg-maroon-950 px-4 py-2 text-white">
      <span className="font-condensed text-xs font-semibold uppercase tracking-wide">Total Score: {totalScore}</span>
      <span className="text-white/40">|</span>
      <span className="font-condensed text-xs font-semibold uppercase tracking-wide">To Par: {formatToPar(toPar)}</span>
    </div>
  );
}
