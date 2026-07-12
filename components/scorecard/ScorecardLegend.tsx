import { HoleMarkerShape, MARKER_LABELS } from "./HoleMarker";
import type { HoleMarker as HoleMarkerType } from "@/lib/data";

const ORDER: HoleMarkerType[] = ["eagle", "birdie", "bogey", "double-or-worse"];

export function ScorecardLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 bg-cream-50 border border-ink-100 rounded-md">
      {ORDER.map((marker) => (
        <div key={marker} className="flex items-center gap-[10px]">
          <HoleMarkerShape marker={marker} size={26} />
          <span className="font-condensed text-[11px] font-semibold tracking-wide uppercase text-ink-600">{MARKER_LABELS[marker]}</span>
        </div>
      ))}
    </div>
  );
}
