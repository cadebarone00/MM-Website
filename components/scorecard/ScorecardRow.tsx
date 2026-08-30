import { HoleMarkerForDiff } from "./HoleMarker";
import type { RoundScorecard } from "@/lib/data";

interface ScorecardRowProps {
  round: RoundScorecard;
  onHoleClick?: (hole: number) => void;
  selectedHole?: number | null;
  registerHoleRef?: (hole: number, el: HTMLElement | null) => void;
}

function HoleCell({
  hole,
  onHoleClick,
  selected,
  registerRef,
}: {
  hole: RoundScorecard["holes"][number];
  onHoleClick?: (hole: number) => void;
  selected?: boolean;
  registerRef?: (el: HTMLElement | null) => void;
}) {
  const cellClass = [
    "flex h-11 w-9 shrink-0 items-center justify-center border-r border-ink-300",
    selected ? "bg-maroon-700" : "bg-cream-100",
  ].join(" ");

  if (!hole.score) {
    return (
      <div ref={registerRef} className={cellClass}>
        <span className="font-sans text-xs text-maroon-300">–</span>
      </div>
    );
  }

  return (
    <button ref={registerRef} type="button" onClick={() => onHoleClick?.(hole.hole)} className={[cellClass, "cursor-pointer"].join(" ")}>
      <HoleMarkerForDiff diff={hole.diff} size={28} tone={selected ? "white" : "maroon"}>
        {hole.score}
      </HoleMarkerForDiff>
    </button>
  );
}

function TotalCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex h-11 w-12 shrink-0 flex-col items-center justify-center border-r border-ink-300 bg-cream-100 px-1">
      <span className="font-score text-sm font-bold text-maroon-700 tabular-nums leading-none">{value}</span>
      <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-maroon-500 leading-none mt-[2px]">{label}</span>
    </div>
  );
}

export function ScorecardRow({ round, onHoleClick, selectedHole, registerHoleRef }: ScorecardRowProps) {
  const front = round.holes.slice(0, 9);
  const back = round.holes.slice(9, 18);
  const frontPlayed = front.some((h) => h.score > 0);
  const backPlayed = back.some((h) => h.score > 0);
  const outTotal: number | string = frontPlayed ? front.reduce((s, h) => s + h.score, 0) : "–";
  const inTotal: number | string = backPlayed ? back.reduce((s, h) => s + h.score, 0) : "–";

  return (
    <div className="flex items-center bg-cream-100">
      <div className="flex h-11 w-[148px] shrink-0 items-center rounded-bl-2xl border-r border-ink-300 bg-cream-100 pl-3">
        <span className="font-condensed text-[10px] font-bold tracking-eyebrow uppercase text-maroon-700">Score</span>
      </div>

      {front.map((h) => (
        <HoleCell
          key={h.hole}
          hole={h}
          onHoleClick={onHoleClick}
          selected={selectedHole === h.hole}
          registerRef={registerHoleRef ? (el) => registerHoleRef(h.hole, el) : undefined}
        />
      ))}
      <TotalCell label="Out" value={outTotal} />

      {back.length > 0 && (
        <>
          {back.map((h) => (
            <HoleCell
              key={h.hole}
              hole={h}
              onHoleClick={onHoleClick}
              selected={selectedHole === h.hole}
              registerRef={registerHoleRef ? (el) => registerHoleRef(h.hole, el) : undefined}
            />
          ))}
          <TotalCell label="In" value={inTotal} />
        </>
      )}

      <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-br-2xl border-l border-ink-300 bg-cream-100 pl-1 pr-3">
        <span className="font-score text-lg font-extrabold text-maroon-700 tabular-nums leading-none">{round.total}</span>
        <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-maroon-500 leading-none mt-[2px]">Total</span>
      </div>
    </div>
  );
}
