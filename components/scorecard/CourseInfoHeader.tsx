import type { RoundScorecard } from "@/lib/data";

type RowVariant = "header" | "muted";

function Cell({
  value,
  variant,
  selected,
  onClick,
  registerRef,
  hasVideo,
}: {
  value: number | string;
  variant: RowVariant;
  selected?: boolean;
  onClick?: () => void;
  registerRef?: (el: HTMLElement | null) => void;
  /** Small gold underline — this hole has at least one shot video. */
  hasVideo?: boolean;
}) {
  const isHeader = variant === "header";
  const bg = isHeader || selected ? "bg-maroon-700" : "bg-cream-100";
  const text = isHeader || selected ? "text-white" : "text-maroon-700";
  const border = isHeader ? "border-white/15" : "border-ink-300";
  const cellClass = [
    "flex h-8 w-9 shrink-0 items-center justify-center border-r",
    border,
    bg,
    hasVideo ? "border-b-2 border-b-amber-400" : "",
  ].join(" ");
  const content = <span className={["font-sans text-xs font-semibold tabular-nums", text].join(" ")}>{value}</span>;

  return onClick ? (
    <button ref={registerRef} type="button" onClick={onClick} className={[cellClass, "cursor-pointer"].join(" ")}>
      {content}
    </button>
  ) : (
    <div ref={registerRef} className={cellClass}>
      {content}
    </div>
  );
}

function TotalCell({ value, variant }: { value: number | string; variant: RowVariant }) {
  const isHeader = variant === "header";
  const bg = isHeader ? "bg-maroon-700" : "bg-cream-100";
  const text = isHeader ? "text-white" : "text-maroon-700";
  const border = isHeader ? "border-white/15" : "border-ink-300";
  return (
    <div className={["flex h-8 w-12 shrink-0 items-center justify-center border-r", border, bg, "px-1"].join(" ")}>
      <span className={["font-sans text-xs font-semibold tabular-nums", text].join(" ")}>{value}</span>
    </div>
  );
}

function InfoRow({
  label,
  variant,
  front,
  back,
  frontHoles,
  backHoles,
  selectedHole,
  onHoleClick,
  outValue,
  inValue,
  totalValue,
  registerHoleRef,
  holesWithVideo,
}: {
  label: string;
  variant: RowVariant;
  front: (number | string)[];
  back: (number | string)[];
  frontHoles: number[];
  backHoles: number[];
  selectedHole?: number | null;
  onHoleClick?: (hole: number) => void;
  outValue: number | string;
  inValue: number | string;
  totalValue: number | string;
  registerHoleRef?: (hole: number, el: HTMLElement | null) => void;
  holesWithVideo?: Set<number>;
}) {
  const isHeader = variant === "header";
  const rowBg = isHeader ? "bg-maroon-700" : "bg-cream-100";
  const rowText = isHeader ? "text-white" : "text-maroon-700";
  const rowBorder = isHeader ? "border-white/15" : "border-ink-300";

  return (
    <div className={["flex border-b", rowBorder].join(" ")}>
      <div className={["flex h-8 w-[148px] shrink-0 items-center border-r pl-3", isHeader ? "rounded-tl-2xl" : "", rowBorder, rowBg].join(" ")}>
        <span className={["font-condensed text-[10px] font-bold tracking-eyebrow uppercase", rowText].join(" ")}>{label}</span>
      </div>

      {front.map((v, i) => (
        <Cell
          key={i}
          value={v}
          variant={variant}
          selected={selectedHole === frontHoles[i]}
          onClick={onHoleClick ? () => onHoleClick(frontHoles[i]) : undefined}
          registerRef={registerHoleRef ? (el) => registerHoleRef(frontHoles[i], el) : undefined}
          hasVideo={holesWithVideo?.has(frontHoles[i])}
        />
      ))}
      <TotalCell value={outValue} variant={variant} />

      {back.length > 0 && (
        <>
          {back.map((v, i) => (
            <Cell
              key={i}
              value={v}
              variant={variant}
              selected={selectedHole === backHoles[i]}
              onClick={onHoleClick ? () => onHoleClick(backHoles[i]) : undefined}
              registerRef={registerHoleRef ? (el) => registerHoleRef(backHoles[i], el) : undefined}
              hasVideo={holesWithVideo?.has(backHoles[i])}
            />
          ))}
          <TotalCell value={inValue} variant={variant} />
        </>
      )}

      <div className={["flex h-8 w-14 shrink-0 items-center justify-center border-l pl-1 pr-3", isHeader ? "rounded-tr-2xl" : "", rowBorder, rowBg].join(" ")}>
        <span className={["font-sans text-xs font-bold tabular-nums", rowText].join(" ")}>{totalValue}</span>
      </div>
    </div>
  );
}

export function CourseInfoHeader({
  round,
  onHoleClick,
  selectedHole,
  registerHoleRef,
  holesWithVideo,
}: {
  round: RoundScorecard;
  onHoleClick: (hole: number) => void;
  selectedHole?: number | null;
  registerHoleRef?: (hole: number, el: HTMLElement | null) => void;
  /** Hole numbers with at least one shot video — underlined gold in the Hole row. */
  holesWithVideo?: Set<number>;
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
      <InfoRow
        label="Hole"
        variant="header"
        front={frontHoles}
        back={backHoles}
        frontHoles={frontHoles}
        backHoles={backHoles}
        selectedHole={selectedHole}
        onHoleClick={onHoleClick}
        outValue="OUT"
        inValue="IN"
        totalValue="TOT"
        registerHoleRef={registerHoleRef}
        holesWithVideo={holesWithVideo}
      />
      <InfoRow
        label="Yards"
        variant="muted"
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
        variant="muted"
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
