import { DonutGauge } from "./DonutGauge";
import { summaryPct, type ScoringSummary } from "@/lib/data/stats/tournamentStats";

const SEGMENTS: { key: keyof Omit<ScoringSummary, "holesPlayed">; label: string; color: string }[] = [
  { key: "eagle", label: "Eagles", color: "#9a7b3f" }, // gold-600 — kept distinct from birdie's maroon rather than a second red shade
  { key: "birdie", label: "Birdies", color: "#6b161a" }, // maroon-600
  { key: "par", label: "Par", color: "#dfd9d0" }, // ink-200
  { key: "bogey", label: "Bogeys", color: "#93897e" }, // ink-400
  { key: "doubleOrWorse", label: "Double Bogeys +", color: "#554c44" }, // ink-600
];

function BigDonut({ summary }: { summary: ScoringSummary }) {
  const box = 220;
  const r = 86;
  const width = 32;
  const cx = box / 2;
  const cy = box / 2;
  const circumference = 2 * Math.PI * r;

  let cumulative = 0;

  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`}>
      {summary.holesPlayed === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ece7df" strokeWidth={width} />
      ) : (
        SEGMENTS.map((seg) => {
          const count = summary[seg.key];
          if (count <= 0) return null;
          const fullLength = circumference * (count / summary.holesPlayed);
          const gap = Math.min(2, fullLength * 0.15);
          const drawLength = Math.max(fullLength - gap, 0);
          const offset = -cumulative;
          cumulative += fullLength;
          return (
            <circle
              key={seg.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={width}
              strokeDasharray={`${drawLength} ${circumference - drawLength}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })
      )}
    </svg>
  );
}

export function ScoringSummaryChart({
  playerName,
  player,
  compareLabel,
  compare,
}: {
  playerName: string;
  player: ScoringSummary;
  compareLabel: string;
  compare: ScoringSummary;
}) {
  return (
    <div>
      <div className="text-center font-sans text-sm font-semibold text-ink-900 mb-3">{playerName} Overall</div>

      <div className="flex justify-center">
        <BigDonut summary={player} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-4">
        {SEGMENTS.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="font-sans text-xs text-ink-600">
              {seg.label} ({player[seg.key]})
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-ink-100 mt-5 pt-4">
        <div className="flex items-center justify-center gap-4 mb-2">
          <span className="flex items-center gap-1.5 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-600">
            <span className="h-2 w-2 rounded-full bg-maroon-600" /> Player
          </span>
          <span className="flex items-center gap-1.5 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-400">
            <span className="h-2 w-2 rounded-full bg-ink-400" /> {compareLabel}
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {SEGMENTS.map((seg) => (
            <div key={seg.key} className="flex flex-col items-center gap-1">
              <DonutGauge playerPct={summaryPct(player, seg.key)} comparePct={summaryPct(compare, seg.key)} size="mini" />
              <span className="font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">{seg.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
