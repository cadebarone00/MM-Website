"use client";

import { useEffect, useRef } from "react";
import { getPlayerDisplayName } from "@/lib/data/players";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { BroadcastStanding } from "@/lib/broadcast/types";
import { placementLabel } from "@/lib/leaderboard/placement";

/**
 * Shrinks the row group's font scale until its content stops overflowing,
 * instead of ever letting a long name get clipped (2026-09-22 broadcast
 * graphics brainstorm: "always have enough space for the letters to
 * fit"). Runs after layout, again once fonts finish loading (metrics can
 * shift after a webfont swaps in), and on resize.
 */
function useShrinkToFit(ref: React.RefObject<HTMLDivElement | null>, watch: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function fit() {
      if (!el) return;
      let scale = 1;
      el.style.setProperty("--ticker-fit-scale", "1");
      let guard = 0;
      while (el.scrollWidth > el.clientWidth + 1 && scale > 0.55 && guard < 40) {
        scale -= 0.02;
        el.style.setProperty("--ticker-fit-scale", scale.toFixed(2));
        guard++;
      }
    }
    fit();
    window.addEventListener("resize", fit);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => window.removeEventListener("resize", fit);
  }, [ref, watch]);
}

/** Bottom-left top-five standings, hidden while the individual board is visible. */
export function BroadcastTicker({ standings }: { standings: BroadcastStanding[] }) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const top5 = standings.slice(0, 5);
  useShrinkToFit(rowsRef, top5.map((s) => `${s.player}:${s.toPar}`).join(","));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-start">
      <div className="flex min-h-28 w-max max-w-full items-stretch border-t-2 border-[color:var(--color-gold-400)]/45 bg-[color:var(--color-maroon-900)]/[0.92] shadow-xl backdrop-blur-sm">
        <div className="flex shrink-0 items-center border-r border-[color:var(--color-gold-400)]/25 bg-[color:var(--color-maroon-700)]/60 px-5 py-3 sm:px-6">
          <span className="whitespace-nowrap font-condensed text-2xl font-bold uppercase tracking-wide text-[color:var(--color-gold-300)] sm:text-3xl">
            Leaderboard
          </span>
        </div>
        <div ref={rowsRef} className="flex min-w-0 items-center gap-[1em] overflow-hidden px-4 py-6 sm:px-5" style={{ fontSize: "calc(1.6rem * var(--ticker-fit-scale, 1))" }}>
          {top5.length === 0 ? (
            <span className="font-condensed text-lg text-[color:var(--color-cream-100)]/60">No scores yet</span>
          ) : (
            top5.map((standing, index) => (
              <div
                key={standing.player}
                className="flex shrink-0 items-center gap-[0.35em] whitespace-nowrap"
              >
                <span className="font-condensed text-[0.65em] font-semibold text-[color:var(--color-cream-100)]/50">
                  {placementLabel(standings, index)}
                </span>
                <span className="font-condensed text-[1em] font-bold uppercase leading-none text-[color:var(--color-cream-50)]">
                  {getPlayerDisplayName(standing.player)}
                </span>
                <ScoreBadge value={standing.toPar} size="lg" style={{ fontSize: "1.15em" }} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
