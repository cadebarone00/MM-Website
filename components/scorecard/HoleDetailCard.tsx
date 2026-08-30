import type { HoleStat } from "@/lib/data";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-[2px] px-5">
      <span className="font-score text-base font-bold text-ink-900 tabular-nums">{value}</span>
      <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">{label}</span>
    </div>
  );
}

export function HoleDetailCard({ hole }: { hole: HoleStat }) {
  return (
    <div className="flex items-center justify-center divide-x divide-ink-100 py-3 bg-white border border-ink-100 rounded-md">
      <Stat label="Fairway" value={hole.fir === "X" ? "–" : hole.fir === 1 ? "Hit" : "Miss"} />
      <Stat label="Green" value={hole.gir === 1 ? "Hit" : "Miss"} />
      <Stat label="Putts" value={String(hole.putts)} />
    </div>
  );
}
