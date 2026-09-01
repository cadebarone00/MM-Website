"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { HoleMarkerForDiff } from "./HoleMarker";
import type { HoleStat, RoundScorecard } from "@/lib/data";

type Variant = "header" | "muted";

function colors(variant: Variant, selected?: boolean) {
  const isHeader = variant === "header";
  return {
    bg: isHeader || selected ? "bg-maroon-700" : "bg-cream-100",
    text: isHeader || selected ? "text-white" : "text-maroon-700",
    border: isHeader ? "border-white/15" : "border-ink-300",
  };
}

function ValueCell({
  value,
  variant,
  height,
  selected,
  onClick,
  registerRef,
  hasVideo,
}: {
  value: number | string;
  variant: Variant;
  height: string;
  selected?: boolean;
  onClick?: () => void;
  registerRef?: (el: HTMLElement | null) => void;
  /** Small gold underline — this hole has at least one shot video. */
  hasVideo?: boolean;
}) {
  const { bg, text, border } = colors(variant, selected);
  const cellClass = [
    "flex flex-1 items-center justify-center border-r",
    height,
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

function ScoreCell({
  hole,
  selected,
  onClick,
  registerRef,
}: {
  hole: HoleStat;
  selected?: boolean;
  onClick?: () => void;
  registerRef?: (el: HTMLElement | null) => void;
}) {
  const cellClass = ["flex h-11 flex-1 items-center justify-center border-r border-ink-300", selected ? "bg-maroon-700" : "bg-cream-100"].join(" ");
  if (!hole.score) {
    return (
      <div ref={registerRef} className={cellClass}>
        <span className="font-sans text-xs text-maroon-300">–</span>
      </div>
    );
  }
  return (
    <button ref={registerRef} type="button" onClick={onClick} className={[cellClass, "cursor-pointer"].join(" ")}>
      <HoleMarkerForDiff diff={hole.diff} size={28} tone={selected ? "white" : "maroon"}>
        {hole.score}
      </HoleMarkerForDiff>
    </button>
  );
}

function SideCell({
  value,
  kind = "label",
  variant,
  height,
  side,
}: {
  value: string;
  /** "label" for word cells (Hole/Yards/Par/Score, TOT) — "value" for a number, sized to match the numbers in its row. */
  kind?: "label" | "value";
  variant: Variant;
  height: string;
  side: "left" | "right";
}) {
  const { bg, text, border } = colors(variant);
  const edge = side === "left" ? "border-r" : "border-l";
  const textClass =
    kind === "value"
      ? ["font-sans text-xs font-semibold tabular-nums", text]
      : ["font-condensed text-[10px] font-bold uppercase tracking-eyebrow whitespace-nowrap", text];
  return (
    <div className={["flex items-center justify-center px-1", height, edge, border, bg].join(" ")}>
      <span className={textClass.join(" ")}>{value}</span>
    </div>
  );
}

interface Props {
  round: RoundScorecard;
  selectedHole: number;
  onHoleClick: (hole: number) => void;
  /** Which hole the view should open scrolled to — the default selected hole for this round. */
  initialHole: number;
  /** Hole numbers with at least one shot video — underlined gold in the Hole row. */
  holesWithVideo?: Set<number>;
}

export function MobileScorecardGrid({ round, selectedHole, onHoleClick, initialHole, holesWithVideo }: Props) {
  const front = round.holes.slice(0, 9);
  const back = round.holes.slice(9, 18);
  const outPar = front.reduce((s, h) => s + h.par, 0);
  const inPar = back.reduce((s, h) => s + h.par, 0);
  const outYards = front.reduce((s, h) => s + h.yards, 0);
  const inYards = back.reduce((s, h) => s + h.yards, 0);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const holeRefs = useRef<Map<number, HTMLElement>>(new Map());
  const registerHoleRef = (hole: number, el: HTMLElement | null) => {
    if (el) holeRefs.current.set(hole, el);
    else holeRefs.current.delete(hole);
  };

  const [cap, setCap] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = holeRefs.current.get(selectedHole);
    setCap(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [selectedHole, round]);

  // Open scrolled to whichever page holds the round's default hole (the back
  // nine if that hole is 10+, otherwise the front nine).
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = initialHole > 9 ? el.clientWidth : 0;
  }, [round, initialHole]);

  const page = (holes: HoleStat[], showCap: boolean) => (
    <div className="relative flex w-full shrink-0 snap-start flex-col">
      <div className="flex">
        {holes.map((h) => (
          <ValueCell
            key={h.hole}
            value={h.hole}
            variant="header"
            height="h-8"
            selected={selectedHole === h.hole}
            onClick={() => onHoleClick(h.hole)}
            registerRef={(el) => registerHoleRef(h.hole, el)}
            hasVideo={holesWithVideo?.has(h.hole)}
          />
        ))}
      </div>
      <div className="flex">
        {holes.map((h) => (
          <ValueCell key={h.hole} value={h.yards} variant="muted" height="h-8" selected={selectedHole === h.hole} onClick={() => onHoleClick(h.hole)} />
        ))}
      </div>
      <div className="flex">
        {holes.map((h) => (
          <ValueCell key={h.hole} value={h.par} variant="muted" height="h-8" selected={selectedHole === h.hole} onClick={() => onHoleClick(h.hole)} />
        ))}
      </div>
      <div className="flex">
        {holes.map((h) => (
          <ScoreCell key={h.hole} hole={h} selected={selectedHole === h.hole} onClick={() => onHoleClick(h.hole)} />
        ))}
      </div>

      {showCap && cap && (
        <>
          <div className="pointer-events-none absolute -top-2 h-2 bg-maroon-700" style={{ left: cap.left, width: cap.width }} />
          <div className="pointer-events-none absolute -bottom-2 h-2 bg-maroon-700" style={{ left: cap.left, width: cap.width }} />
        </>
      )}
    </div>
  );

  return (
    <div className="flex border-y border-ink-300 bg-cream-100">
      <div className="flex w-14 shrink-0 flex-col">
        <SideCell value="Hole" variant="header" height="h-8" side="left" />
        <SideCell value="Yards" variant="muted" height="h-8" side="left" />
        <SideCell value="Par" variant="muted" height="h-8" side="left" />
        <SideCell value="Score" variant="muted" height="h-11" side="left" />
      </div>

      <div ref={scrollerRef} className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
        {page(front, selectedHole != null && selectedHole <= 9)}
        {back.length > 0 && page(back, selectedHole != null && selectedHole > 9)}
      </div>

      <div className="flex w-14 shrink-0 flex-col">
        <SideCell value="TOT" variant="header" height="h-8" side="right" />
        <SideCell value={String(outYards + inYards)} kind="value" variant="muted" height="h-8" side="right" />
        <SideCell value={String(outPar + inPar)} kind="value" variant="muted" height="h-8" side="right" />
        <SideCell value={String(round.total)} kind="value" variant="muted" height="h-11" side="right" />
      </div>
    </div>
  );
}
