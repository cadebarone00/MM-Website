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
  const content = (
    <span className={["font-sans text-xs tabular-nums", emphasize ? "font-bold text-ink-700" : "text-ink-500"].join(" ")}>{value}</span>
  );
  return (
    <div
      className={[
        "flex items-center justify-center w-9 shrink-0 border-r border-ink-100 last:border-r-0",
        selected ? "bg-gold-200" : "",
      ].join(" ")}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="hover:opacity-70 transition-opacity">
          {content}
        </button>
      ) : (
        content
      )}
    </div>
  );
}

function TotalCell({ value }: { value: number | string }) {
  return (
    <div className="flex items-center justify-center w-12 shrink-0 px-1">
      <span className="font-sans text-xs font-semibold text-ink-600 tabular-nums">{value}</span>
    </div>
  );
}

function InfoRow({
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
    <div className="flex items-center gap-1 px-3 py-[3px]">
      <div className="flex items-center">
        {front.map((v, i) => (
          <Cell
            key={i}
            value={v}
            emphasize={emphasize}
            selected={selectedHole === frontHoles[i]}
            onClick={onHoleClick ? () => onHoleClick(frontHoles[i]) : undefined}
          />
        ))}
      </div>
      <TotalCell value={outValue} />
      <div className="w-px h-6 mx-1 shrink-0" />

      {back.length > 0 && (
        <>
          <div className="flex items-center">
            {back.map((v, i) => (
              <Cell
                key={i}
                value={v}
                emphasize={emphasize}
                selected={selectedHole === backHoles[i]}
                onClick={onHoleClick ? () => onHoleClick(backHoles[i]) : undefined}
              />
            ))}
          </div>
          <TotalCell value={inValue} />
          <div className="w-px h-6 mx-1 shrink-0" />
        </>
      )}

      <div className="flex items-center justify-center w-14 shrink-0 pl-1">
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
    <div className="bg-cream-100 border border-ink-100 rounded-md mb-2 w-max min-w-full pt-2 divide-y divide-ink-100">
      <InfoRow
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
        front={front.map((h) => h.yards)}
        back={back.map((h) => h.yards)}
        frontHoles={frontHoles}
        backHoles={backHoles}
        selectedHole={selectedHole}
        outValue={outYards}
        inValue={inYards}
        totalValue={outYards + inYards}
      />
      <div className="pb-2">
        <InfoRow
          front={front.map((h) => h.par)}
          back={back.map((h) => h.par)}
          frontHoles={frontHoles}
          backHoles={backHoles}
          selectedHole={selectedHole}
          outValue={outPar}
          inValue={inPar}
          totalValue={outPar + inPar}
        />
      </div>
    </div>
  );
}
