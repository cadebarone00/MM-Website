import { Avatar } from "@/components/ui/Avatar";
import { HoleMarkerForDiff } from "./HoleMarker";
import type { RoundScorecard, Team } from "@/lib/data";

interface ScorecardRowProps {
  round: RoundScorecard;
  player: string;
  team?: Team;
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
  const cellClass = [
    "flex h-11 w-9 shrink-0 items-center justify-center border-r border-ink-900",
    selected ? "bg-maroon-700" : "",
  ].join(" ");

  if (!hole.score) {
    return (
      <div className={cellClass}>
        <span className="font-sans text-xs text-ink-300">–</span>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => onHoleClick?.(hole.hole)} className={[cellClass, "cursor-pointer"].join(" ")}>
      {selected ? (
        <span className="font-score text-sm font-bold text-white tabular-nums leading-none">{hole.score}</span>
      ) : (
        <HoleMarkerForDiff diff={hole.diff} size={28}>
          {hole.score}
        </HoleMarkerForDiff>
      )}
    </button>
  );
}

function TotalCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex h-11 w-12 shrink-0 flex-col items-center justify-center border-r border-ink-900 px-1">
      <span className="font-score text-sm font-bold text-ink-900 tabular-nums leading-none">{value}</span>
      <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-ink-400 leading-none mt-[2px]">{label}</span>
    </div>
  );
}

export function ScorecardRow({ round, player, team, onHoleClick, selectedHole }: ScorecardRowProps) {
  const front = round.holes.slice(0, 9);
  const back = round.holes.slice(9, 18);
  const frontPlayed = front.some((h) => h.score > 0);
  const backPlayed = back.some((h) => h.score > 0);
  const outTotal: number | string = frontPlayed ? front.reduce((s, h) => s + h.score, 0) : "–";
  const inTotal: number | string = backPlayed ? back.reduce((s, h) => s + h.score, 0) : "–";

  return (
    <div className="flex items-center bg-white">
      <div className="flex h-11 w-[148px] shrink-0 items-center gap-[10px] border-r border-ink-900 pl-3">
        <Avatar name={player} size="xs" team={team ?? null} />
        <span className="font-sans text-[13px] font-semibold text-ink-900 whitespace-nowrap overflow-hidden text-ellipsis">{player}</span>
      </div>

      {front.map((h) => (
        <HoleCell key={h.hole} hole={h} onHoleClick={onHoleClick} selected={selectedHole === h.hole} />
      ))}
      <TotalCell label="Out" value={outTotal} />

      {back.length > 0 && (
        <>
          {back.map((h) => (
            <HoleCell key={h.hole} hole={h} onHoleClick={onHoleClick} selected={selectedHole === h.hole} />
          ))}
          <TotalCell label="In" value={inTotal} />
        </>
      )}

      <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center pl-1 pr-3">
        <span className="font-score text-lg font-extrabold text-maroon-700 tabular-nums leading-none">{round.total}</span>
        <span className="font-condensed text-[9px] font-semibold tracking-eyebrow uppercase text-ink-400 leading-none mt-[2px]">Total</span>
      </div>
    </div>
  );
}
