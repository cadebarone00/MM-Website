const TRACK = "#ece7df"; // ink-100
const PLAYER_COLOR = "#6b161a"; // maroon-600
const COMPARE_COLOR = "#93897e"; // ink-400

function Ring({ cx, cy, r, width, pct, color }: { cx: number; cy: number; r: number; width: number; pct: number; color: string }) {
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={TRACK} strokeWidth={width} />
      {clamped > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
    </>
  );
}

/**
 * Two-ring gauge: outer ring is the viewed player, inner ring is whatever
 * they're being compared against (the field average, or another player).
 * "big" shows both percentages stacked in the center; "mini" (for the
 * per-round row) shows just the player's own number, with the ring
 * proportions still carrying the comparison visually.
 */
export function DonutGauge({
  playerPct,
  comparePct,
  size = "big",
}: {
  playerPct: number | null;
  comparePct: number | null;
  size?: "big" | "mini";
}) {
  const dims =
    size === "big"
      ? { box: 220, outerR: 88, innerR: 64, outerW: 26, innerW: 18 }
      : { box: 84, outerR: 34, innerR: 25, outerW: 9, innerW: 6 };
  const cx = dims.box / 2;
  const cy = dims.box / 2;

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: dims.box, height: dims.box }}>
      <svg width={dims.box} height={dims.box} viewBox={`0 0 ${dims.box} ${dims.box}`}>
        <Ring cx={cx} cy={cy} r={dims.outerR} width={dims.outerW} pct={playerPct ?? 0} color={PLAYER_COLOR} />
        <Ring cx={cx} cy={cy} r={dims.innerR} width={dims.innerW} pct={comparePct ?? 0} color={COMPARE_COLOR} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {size === "big" ? (
          <>
            <span className="font-sans text-3xl font-bold text-maroon-600 tabular-nums leading-tight">
              {playerPct != null ? `${Math.round(playerPct)}%` : "–"}
            </span>
            <span className="font-sans text-lg font-semibold text-ink-400 tabular-nums leading-tight">
              {comparePct != null ? `${Math.round(comparePct)}%` : "–"}
            </span>
          </>
        ) : (
          <span className="font-sans text-[11px] font-bold text-maroon-600 tabular-nums">{playerPct != null ? `${playerPct.toFixed(1)}%` : "–"}</span>
        )}
      </div>
    </div>
  );
}
