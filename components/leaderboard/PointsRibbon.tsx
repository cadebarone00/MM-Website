"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtPt } from "@/lib/data";
import type { Tournament } from "@/lib/data/types";

// Placeholder until live-odds projections are supplied by the scoring feed.
const PROJECTED_POINTS = { maroon: 17, white: 16 };

function useHeaderOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    function measure() {
      const header = document.querySelector("header");
      setOffset(header ? header.getBoundingClientRect().height : 0);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return offset;
}

function flooredFill(real: number, otherReal: number, floor = 15): number {
  const a = Math.max(floor, real);
  const b = Math.max(floor, otherReal);
  if (a + b <= 100) return a;
  return (a / (a + b)) * 100;
}

function ProjectionBar({ tournament }: { tournament: Tournament }) {
  return (
    <div className="grid h-10 grid-cols-[1fr_auto_1fr] items-center border-y border-gold-300 bg-cream-100 px-3 sm:h-11 sm:px-5">
      <span className="justify-self-end pr-3 font-sans text-2xl font-black tabular-nums text-ink-900 sm:text-3xl">
        {fmtPt(PROJECTED_POINTS.maroon)}
      </span>
      <Link href={`/leaderboard/${tournament.slug}/projected`} className="font-condensed text-2xs font-extrabold uppercase tracking-eyebrow text-ink-700 underline decoration-gold-500 underline-offset-4 hover:text-maroon-700">Projected</Link>
      <span className="justify-self-start pl-3 font-sans text-2xl font-black tabular-nums text-ink-900 sm:text-3xl">
        {fmtPt(PROJECTED_POINTS.white)}
      </span>
    </div>
  );
}

/**
 * Sticky score ticker under the header.
 * Mobile: fixed half-maroon/half-white split with a gold center divider —
 * not proportional to score — and the two point totals held at 40%/60%
 * from their respective screen edges (a 20%-wide gap between them,
 * centered on the divider). "Points left"/win-retain state lives in the
 * label bar underneath instead of inside the ticker itself.
 * Desktop: unchanged from before — proportional fill showing each team's
 * share of available points, with the same state inline in its own
 * middle strip.
 */
export function PointsRibbon({ tournament }: { tournament: Tournament }) {
  const headerOffset = useHeaderOffset();
  const safeAvailable = tournament.pointsAvailable || 1;
  const realMaroon = Math.min(100, (tournament.maroonPts / safeAvailable) * 100);
  const realWhite = Math.min(100, (tournament.whitePts / safeAvailable) * 100);
  const maroonFill = flooredFill(realMaroon, realWhite);
  const whiteFill = flooredFill(realWhite, realMaroon);
  return (
    <div className="sticky z-40 -mx-4 sm:-mx-7 lg:mx-0" style={{ top: headerOffset }}>
      <ProjectionBar tournament={tournament} />
      {/* Mobile: fixed 50/50 split, gold divider, numbers pinned at 40%/60%. */}
      <div className="lg:hidden">
        <div className="relative flex h-[114px] w-full border-b border-gold-300">
          <div className="w-1/2" style={{ background: "var(--color-maroon-700)" }} />
          <div className="w-1/2" style={{ background: "#fdfdfb" }} />
          <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-gold-500" />
          <span className="absolute left-3 top-2 font-sans text-2xs font-black text-white">MAROON</span>
          <span className="absolute right-3 top-2 font-sans text-2xs font-black text-maroon-700">WHITE</span>
          <div className="absolute inset-y-0 flex flex-col items-center justify-center" style={{ left: "40%", transform: "translateX(-50%)" }}>
            <span className="font-sans text-5xl font-black leading-none text-white">{fmtPt(tournament.maroonPts)}</span>
          </div>
          <div className="absolute inset-y-0 flex flex-col items-center justify-center" style={{ left: "60%", transform: "translateX(-50%)" }}>
            <span className="font-sans text-5xl font-black leading-none text-maroon-700">{fmtPt(tournament.whitePts)}</span>
          </div>
        </div>
      </div>

      {/* Desktop: unchanged from before this pass — proportional fill. */}
      <div className="hidden lg:block">
        <div className="relative flex h-[74px] w-full border-b border-gold-300">
          <span className="absolute left-6 top-2 z-10 font-sans text-2xs font-black text-white">MAROON</span>
          <span className="absolute right-6 top-2 z-10 font-sans text-2xs font-black text-maroon-700">WHITE</span>
          <div
            className="flex items-center justify-end pr-[10%]"
            style={{ width: `${maroonFill}%`, background: "var(--color-maroon-700)" }}
          >
            <span className="font-sans text-4xl font-black text-white">{fmtPt(tournament.maroonPts)}</span>
          </div>
          <div className="flex flex-1 bg-cream-200" />
          <div
            className="flex items-center justify-start pl-[10%]"
            style={{ width: `${whiteFill}%`, background: "#fdfdfb" }}
          >
            <span className="font-sans text-4xl font-black text-maroon-700">{fmtPt(tournament.whitePts)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
