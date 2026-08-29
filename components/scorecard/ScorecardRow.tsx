import { HoleMarkerForDiff } from "./HoleMarker";
import type { RoundScorecard } from "@/lib/data";

interface ScorecardRowProps {
  round: RoundScorecard;
  onHoleClick?: (hole: number) => void;
  selectedHole?: number | null;
}

function HoleCell({
  hole,
  onHoleClick,
  selected,
}: {
  hole: RoundScorecard["holes"][number];
  onHoleClick?: (hole: number) => void;
  selected?: boolean;
}) {
  const cellClass = ["flex items-center justify-center w-9 shrink-0 border-r border-ink-100 last:border-r-0", selected ? "bg-gold-100" : ""].join(
    " "
  );

  if (!hole.score) {
    return (
      <div className={cellClass}>
        <span className="font-sans text-xs text-ink-300">–</span>
      </div>
    );
  }

  const marker = (
    <HoleMarkerForDiff diff={hole.diff} size={28}>
      {hole.score}
    </HoleMarkerForDiff>
  );

  return (
    <div className={cellClass}>
      {onHoleClick ? (
        <button type="button" onClick={() => onHoleClick(hole.hole)} className="hover:opacity-75 transition-opacity">
          {marker}
        </button>
      ) : (
        marker
      )}
    </div>
  );
}

function TotalCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center justify-center w-12 shrink-0 px-1">
      <span className="font-score text-sm font-bold text-ink-900 tabular-nums leading-none">{value}</span>
      <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-ink-400 leading-none mt-[2px]">{label}</span>
    </div>
  );
}

export function ScorecardRow({ round, onHoleClick, selectedHole }: ScorecardRowProps) {
  const front = round.holes.slice(0, 9);
  const back = round.holes.slice(9, 18);
  const frontPlayed = front.some((h) => h.score > 0);
  const backPlayed = back.some((h) => h.score > 0);
  const outTotal: number | string = frontPlayed ? front.reduce((s, h) => s + h.score, 0) : "–";
  const inTotal: number | string = backPlayed ? back.reduce((s, h) => s + h.score, 0) : "–";

  return (
    <div className="flex items-center gap-1 py-[6px] px-3 bg-white border border-ink-100 rounded-md w-max min-w-full">
      <div className="flex items-center">
        {front.map((h) => (
          <HoleCell key={h.hole} hole={h} onHoleClick={onHoleClick} selected={selectedHole === h.hole} />
        ))}
      </div>

      <TotalCell label="Out" value={outTotal} />
      <div className="w-px h-6 bg-ink-200 mx-1 shrink-0" />

      {back.length > 0 && (
        <>
          <div className="flex items-center">
            {back.map((h) => (
              <HoleCell key={h.hole} hole={h} onHoleClick={onHoleClick} selected={selectedHole === h.hole} />
            ))}
          </div>
          <TotalCell label="In" value={inTotal} />
          <div className="w-px h-6 bg-ink-200 mx-1 shrink-0" />
        </>
      )}

      <div className="flex flex-col items-center justify-center w-14 shrink-0 pl-1">
        <span className="font-score text-lg font-extrabold text-maroon-700 tabular-nums leading-none">{round.total}</span>
        <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-ink-400 leading-none mt-[2px]">Total</span>
      </div>
    </div>
  );
}
