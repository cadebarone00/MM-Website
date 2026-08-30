import type { StrokesGained } from "@/lib/data/stats/types";

const CATEGORIES: { key: keyof Omit<StrokesGained, "total">; label: string }[] = [
  { key: "offTee", label: "Off Tee" },
  { key: "approach", label: "Approach" },
  { key: "aroundGreen", label: "Around Green" },
  { key: "putting", label: "Putting" },
];

function fmt(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

function ZeroBar({ value, maxAbs, color, height }: { value: number | undefined; maxAbs: number; color: string; height: string }) {
  const pct = value != null ? (Math.abs(value) / maxAbs) * 50 : 0;
  const positive = (value ?? 0) >= 0;
  return (
    <div className={`relative w-full ${height}`}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-ink-200" />
      {value != null && (
        <div
          className="absolute inset-y-0 rounded-sm"
          style={{ [positive ? "left" : "right"]: "50%", width: `${pct}%`, backgroundColor: color }}
        />
      )}
    </div>
  );
}

export function StrokesGainedBars({
  player,
  compare,
  compareLabel,
}: {
  player: StrokesGained | null;
  compare: StrokesGained | null;
  compareLabel: string;
}) {
  if (!player) {
    return <p className="py-8 text-center font-sans text-sm text-ink-400">Strokes Gained isn&rsquo;t available for this tournament yet.</p>;
  }

  const allValues = CATEGORIES.flatMap((c) => [player[c.key], compare?.[c.key]]).filter((v): v is number => v != null);
  const maxAbs = Math.max(1, ...allValues.map((v) => Math.abs(v)));

  return (
    <div>
      <div className="flex items-center justify-center gap-4 mb-5">
        <span className="flex items-center gap-1.5 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-600">
          <span className="h-2 w-2 rounded-full bg-maroon-600" /> Player
        </span>
        <span className="flex items-center gap-1.5 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-400">
          <span className="h-2 w-2 rounded-full bg-ink-400" /> {compareLabel}
        </span>
      </div>

      <div className="flex flex-col gap-5">
        {CATEGORIES.map((cat) => {
          const pVal = player[cat.key];
          const cVal = compare?.[cat.key];
          return (
            <div key={cat.key}>
              <div className="mb-1 text-center font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">{cat.label}</div>
              <div className="flex items-center gap-3">
                <ZeroBar value={pVal} maxAbs={maxAbs} color="#6b161a" height="h-7" />
                <span className="w-16 shrink-0 text-right font-sans text-sm font-bold text-maroon-600 tabular-nums">
                  {pVal != null ? fmt(pVal) : "–"}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <ZeroBar value={cVal} maxAbs={maxAbs} color="#93897e" height="h-4" />
                <span className="w-16 shrink-0 text-right font-sans text-xs text-ink-500 tabular-nums">{cVal != null ? fmt(cVal) : "–"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
