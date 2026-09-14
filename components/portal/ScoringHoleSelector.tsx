"use client";

import { useEffect, useRef } from "react";

export function ScoringHoleSelector({ selectedHole, onSelect, disabled }: { selectedHole: number; onSelect: (hole: number) => void; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = track.current;
    const item = container?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!container || !item) return;
    const left = item.offsetLeft;
    const right = left + item.offsetWidth;
    if (left < container.scrollLeft) container.scrollTo({ left, behavior: "instant" });
    else if (right > container.scrollLeft + container.clientWidth) container.scrollTo({ left: right - container.clientWidth, behavior: "instant" });
  }, [selectedHole]);
  return <div ref={track} className="relative mt-3 flex overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Select hole">
    {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
      <button key={hole} type="button" disabled={disabled} onClick={() => onSelect(hole)} aria-label={`Hole ${hole}`} aria-pressed={hole === selectedHole} className="h-12 min-w-10 basis-[calc(100%/9)] shrink-0 px-0.5 disabled:opacity-50">
        <span className={`flex h-full items-center justify-center rounded-sm font-condensed text-lg font-bold ${hole === selectedHole ? "bg-maroon-700 text-white" : "bg-cream-100 text-maroon-800"}`}>{hole}</span>
      </button>
    ))}
  </div>;
}
