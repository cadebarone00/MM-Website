import { fmtPt } from "@/lib/data";

interface CupPanelProps {
  label: string;
  maroonPts: number;
  whitePts: number;
  pointsAvailable: number;
  pointsToWin: number;
  className?: string;
  large?: boolean;
  winnerText?: string | null;
}

export function CupPanel({ label, maroonPts, whitePts, pointsAvailable, pointsToWin, className = "", large = false, winnerText = null }: CupPanelProps) {
  const total = maroonPts + whitePts;
  const maroonPct = (maroonPts / pointsAvailable) * 100;
  const whitePct = (whitePts / pointsAvailable) * 100;

  return (
    <div className={["bg-cream-50 rounded-lg border border-gold-400 shadow-lg p-6 w-full shrink-0", className].join(" ")}>
      <div className="flex items-center justify-between mb-[18px]">
        <span className="font-condensed text-[11px] font-semibold tracking-eyebrow uppercase text-gold-700">{label}</span>
        <span className="font-condensed text-[11px] text-ink-400">First to {fmtPt(pointsToWin)}</span>
      </div>
      <div className="flex items-end justify-between mb-[14px]">
        <div className="text-left">
          <div className="font-condensed text-[11px] font-semibold tracking-[0.12em] uppercase text-maroon-700">Maroon</div>
          <div className={["font-condensed font-bold leading-none text-maroon-700", large ? "text-[56px] sm:text-[88px]" : "text-[40px] sm:text-[56px]"].join(" ")}>{fmtPt(maroonPts)}</div>
        </div>
        <div className="font-serif italic text-xl text-ink-400 pb-[10px]">vs</div>
        <div className="text-right">
          <div className="font-condensed text-[11px] font-semibold tracking-[0.12em] uppercase text-ink-700">White</div>
          <div className={["font-condensed font-bold leading-none text-ink-800", large ? "text-[56px] sm:text-[88px]" : "text-[40px] sm:text-[56px]"].join(" ")}>{fmtPt(whitePts)}</div>
        </div>
      </div>
      <div className="relative h-2 bg-ink-100 rounded-pill overflow-hidden flex">
        <div className="bg-maroon-700" style={{ width: `${maroonPct}%` }} />
        <div className="flex-1" />
        <div className="bg-ink-400" style={{ width: `${whitePct}%` }} />
      </div>
      <div className="flex justify-between mt-2 font-sans text-[11px] text-ink-400">
        {winnerText ? (
          <span className="font-condensed text-xs font-extrabold uppercase tracking-wide text-ink-900">{winnerText}</span>
        ) : (
          <span>
            {total} of {pointsAvailable} points
          </span>
        )}
      </div>
    </div>
  );
}
