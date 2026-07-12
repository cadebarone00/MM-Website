import type { RoundScorecard } from "@/lib/data";

function Cell({ value, emphasize }: { value: number | string; emphasize?: boolean }) {
  return (
    <div className="flex items-center justify-center w-9 shrink-0">
      <span className={["font-sans text-xs tabular-nums", emphasize ? "font-bold text-ink-700" : "text-ink-500"].join(" ")}>{value}</span>
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
  label,
  front,
  back,
  outValue,
  inValue,
  totalValue,
  emphasize,
}: {
  label: string;
  front: (number | string)[];
  back: (number | string)[];
  outValue: number | string;
  inValue: number | string;
  totalValue: number | string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-[3px]">
      <div className="flex items-center w-[148px] shrink-0 pr-2 mr-1 border-r border-transparent">
        <span className="font-condensed text-[10px] font-semibold tracking-eyebrow uppercase text-ink-400">{label}</span>
      </div>

      <div className="flex items-center">
        {front.map((v, i) => (
          <Cell key={i} value={v} emphasize={emphasize} />
        ))}
      </div>
      <TotalCell value={outValue} />
      <div className="w-px h-6 mx-1 shrink-0" />

      {back.length > 0 && (
        <>
          <div className="flex items-center">
            {back.map((v, i) => (
              <Cell key={i} value={v} emphasize={emphasize} />
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

export function CourseInfoHeader({ round }: { round: RoundScorecard }) {
  const front = round.holes.slice(0, 9);
  const back = round.holes.slice(9, 18);

  const outPar = front.reduce((s, h) => s + h.par, 0);
  const inPar = back.reduce((s, h) => s + h.par, 0);
  const outYards = front.reduce((s, h) => s + h.yards, 0);
  const inYards = back.reduce((s, h) => s + h.yards, 0);

  return (
    <div className="bg-cream-100 border border-ink-100 rounded-md overflow-x-auto mb-2">
      <div className="flex items-center gap-1 px-3 pt-2">
        <div className="w-[148px] shrink-0 pr-2 mr-1 font-condensed text-[11px] font-bold tracking-wide uppercase text-maroon-700">
          {round.course}
        </div>
      </div>
      <InfoRow
        label="Hole"
        front={front.map((h) => h.hole)}
        back={back.map((h) => h.hole)}
        outValue="OUT"
        inValue="IN"
        totalValue="TOT"
        emphasize
      />
      <InfoRow
        label="Yards"
        front={front.map((h) => h.yards)}
        back={back.map((h) => h.yards)}
        outValue={outYards}
        inValue={inYards}
        totalValue={outYards + inYards}
      />
      <div className="pb-2">
        <InfoRow
          label="Par"
          front={front.map((h) => h.par)}
          back={back.map((h) => h.par)}
          outValue={outPar}
          inValue={inPar}
          totalValue={outPar + inPar}
        />
      </div>
    </div>
  );
}
