import { HoleMarkerForDiff } from "./HoleMarker";
import { ScorecardLegend } from "./ScorecardLegend";
import type { HoleStat } from "@/lib/data";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-5">
      <span className="font-score text-2xl font-bold text-ink-900 tabular-nums">{value}</span>
      <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">{label}</span>
    </div>
  );
}

export function HoleDetailCard({ hole }: { hole: HoleStat }) {
  return (
    <div>
      <div className="flex items-center justify-center gap-6 py-6 bg-white border border-ink-100 rounded-md mb-4">
        <HoleMarkerForDiff diff={hole.diff} size={64}>
          <span className="text-xl">{hole.score}</span>
        </HoleMarkerForDiff>
        <div className="flex divide-x divide-ink-100">
          <Stat label="Par" value={String(hole.par)} />
          <Stat label="Yards" value={String(hole.yards)} />
          <Stat label="Putts" value={String(hole.putts)} />
          <Stat label="FIR" value={hole.fir === "X" ? "–" : hole.fir === 1 ? "Hit" : "Miss"} />
          <Stat label="GIR" value={hole.gir === 1 ? "Hit" : "Miss"} />
        </div>
      </div>
      <ScorecardLegend />
    </div>
  );
}
