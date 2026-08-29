import type { RoundScorecard } from "@/lib/data";

function Cell({
  value,
  emphasize,
  selected,
  onClick,
}: {
  value: number | string;
  emphasize?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const cellClass = [
    "flex h-8 w-9 shrink-0 items-center justify-center border-r border-ink-900",
    selected ? "bg-maroon-700" : "",
  ].join(" ");
  const textClass = selected ? "font-bold text-white" : emphasize ? "font-bold text-ink-700" : "text-ink-500";
  const content = <span className={["font-sans text-xs tabular-nums", textClass].join(" ")}>{value}</span>;

  return onClick ? (
    <button type="button" onClick={onClick} className={[cellClass, "cursor-pointer"].join(" ")}>
      {content}
    </button>
  ) : (
    <div className={cellClass}>{content}</div>
  );
}

function TotalCell({ value }: { value: number | string }) {
  return (
    <div className="flex h-8 w-12 shrink-0 items-center justify-center border-r border-ink-900 px-1">
      <span className="font-sans text-xs font-semibold text-ink-600 tabular-nums">{value}</span>
    </div>
  );
}

function InfoRow({
  label,
  front,
  back,
  frontHoles,
  backHoles,
  selectedHole,
  onHoleClick,
  outValue,
  inValue,
  totalValue,
  emphasize,
}: {
  label: string;
  front: (number | string)[];
  back: (number | string)[];
  frontHoles: number[];
  backHoles: number[];
  selectedHole?: number | null;
  onHoleClick?: (hole: number) => void;
  outValue: number | string;
  inValue: number | string;
  totalValue: number | string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex border-b border-ink-900">
      <div className="flex h-8 w-[148px] shrink-0 items-center border-r border-ink-900 pl-3">
        <span className="font-condensed text-[10px] font-semibold tracking-eyebrow uppercase text-ink-400">{label}</span>
      </div>

      {front.map((v, i) => (
        <Cell
          key={i}
          value={v}
          emphasize={emphasize}
          selected={selectedHole === frontHoles[i]}
          onClick={onHoleClick ? () => onHoleClick(frontHoles[i]) : undefined}
        />
      ))}
      <TotalCell value={outValue} />

      {back.length > 0 && (
        <>
          {back.map((v, i) => (
            <Cell
              key={i}
              value={v}
              emphasize={emphasize}
              selected={selectedHole === backHoles[i]}
              onClick={onHoleClick ? () => onHoleClick(backHoles[i]) : undefined}
            />
          ))}
          <TotalCell value={inValue} />
        </>
      )}

      <div className="flex h-8 w-14 shrink-0 items-center justify-center pl-1 pr-3">
        <span className="font-sans text-xs font-bold text-ink-700 tabular-nums">{totalValue}</span>
      </div>
    </div>
  );
}

export function CourseInfoHeader({
  round,
  onHoleClick,
  selectedHole,
}: {
  round: RoundScorecard;
  onHoleClick: (hole: number) => void;
  selectedHole?: number | null;
}) {
  const front = round.holes.slice(0, 9);
  const back = round.holes.slice(9, 18);
  const frontHoles = front.map((h) => h.hole);
  const backHoles = back.map((h) => h.hole);

  const outPar = front.reduce((s, h) => s + h.par, 0);
  const inPar = back.reduce((s, h) => s + h.par, 0);
  const outYards = front.reduce((s, h) => s + h.yards, 0);
  const inYards = back.reduce((s, h) => s + h.yards, 0);

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-ink-900 px-3 py-2">
        <div className="font-condensed text-[11px] font-bold tracking-wide uppercase text-maroon-700">{round.course}</div>
        {round.format && (
          <div className="font-condensed text-[9px] font-semibold tracking-wide uppercase text-ink-400">&middot; {round.format}</div>
        )}
      </div>
      <InfoRow
        label="Hole"
        front={frontHoles}
        back={backHoles}
        frontHoles={frontHoles}
        backHoles={backHoles}
        selectedHole={selectedHole}
        onHoleClick={onHoleClick}
        outValue="OUT"
        inValue="IN"
        totalValue="TOT"
        emphasize
      />
      <InfoRow
        label="Yards"
        front={front.map((h) => h.yards)}
        back={back.map((h) => h.yards)}
        frontHoles={frontHoles}
        backHoles={backHoles}
        selectedHole={selectedHole}
        onHoleClick={onHoleClick}
        outValue={outYards}
        inValue={inYards}
        totalValue={outYards + inYards}
      />
      <InfoRow
        label="Par"
        front={front.map((h) => h.par)}
        back={back.map((h) => h.par)}
        frontHoles={frontHoles}
        backHoles={backHoles}
        selectedHole={selectedHole}
        onHoleClick={onHoleClick}
        outValue={outPar}
        inValue={inPar}
        totalValue={outPar + inPar}
      />
    </div>
  );
}
