import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { RoundScorecard } from "@/lib/data";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-[2px] px-4">
      <span className="font-score text-lg font-bold text-ink-900 tabular-nums">{value}</span>
      <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">{label}</span>
    </div>
  );
}

export function RoundStatsBar({ round }: { round: RoundScorecard }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-4 px-5 py-4 bg-white border border-ink-100 rounded-md mb-4">
      <div className="flex items-center gap-3">
        <span className="font-serif text-2xl font-bold text-ink-900">{round.total}</span>
        <ScoreBadge value={round.toPar} size="md" chip />
      </div>
      <div className="flex divide-x divide-ink-100">
        <Stat label="Putts" value={String(round.putts)} />
        <Stat label="GIR" value={`${round.girHit}/${round.girTotal}`} />
        <Stat label="FIR" value={`${round.firHit}/${round.firTotal}`} />
      </div>
    </div>
  );
}
