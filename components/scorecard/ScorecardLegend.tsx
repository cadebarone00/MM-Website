import { HoleMarkerShape, MARKER_LABELS } from "./HoleMarker";
import type { HoleMarker as HoleMarkerType } from "@/lib/data";

const ORDER: HoleMarkerType[] = ["eagle", "birdie", "bogey", "double-or-worse"];

export function ScorecardLegend() {
  return (
    <div className="flex flex-nowrap items-center justify-between gap-1.5 overflow-x-auto px-2 py-2 bg-cream-50 border border-ink-100 rounded-md sm:justify-start sm:gap-x-6 sm:gap-y-3 sm:px-4 sm:py-3">
      {ORDER.map((marker) => (
        <div key={marker} className="flex shrink-0 items-center gap-1 sm:gap-[10px]">
          <HoleMarkerShape marker={marker} size={18} />
          <span className="whitespace-nowrap font-condensed text-[8px] font-semibold tracking-wide uppercase text-ink-600 sm:text-[11px]">{MARKER_LABELS[marker]}</span>
        </div>
      ))}
    </div>
  );
}
