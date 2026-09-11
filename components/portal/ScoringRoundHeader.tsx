"use client";

import { useEffect, useState } from "react";

export function ScoringRoundHeader({ hole, par, yards, totalScore, toPar }: {
  hole: number; par: number | null; yards: number | null; totalScore: number; toPar: number | null;
}) {
  const [height, setHeight] = useState(112);
  useEffect(() => {
    const header = document.querySelector("header");
    const nav = document.querySelector("[data-player-area-nav]");
    const measure = () => setHeight((header?.getBoundingClientRect().height ?? 64) + (nav?.getBoundingClientRect().height ?? 48));
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    if (nav) observer.observe(nav);
    measure();
    return () => observer.disconnect();
  }, []);
  return <div className="flex flex-col border-y border-gold-400 bg-cream-100 text-maroon-800" style={{ minHeight: height }}>
    <div className="grid flex-1 grid-cols-3 items-center text-center font-condensed text-lg font-bold uppercase tracking-wide">
      <span>Hole {hole}</span><span>Par {par ?? "—"}</span><span>{yards ?? "—"} yards</span>
    </div>
    <div className="grid flex-1 grid-cols-2 items-center border-t border-gold-400 text-center font-condensed text-sm font-semibold uppercase tracking-wide">
      <span>Total strokes: {totalScore}</span><span>To par: {toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar}</span>
    </div>
  </div>;
}
