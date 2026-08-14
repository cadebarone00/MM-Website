"use client";

import { useWagersMode } from "./WagersModeContext";

/**
 * Segmented MM Coins / Real Wagers switch shown in the Wagers nav bar.
 * Real Wagers has no working markets yet — that system is being built
 * separately (see
 * docs/superpowers/specs/2026-08-05-wagers-phase3-real-money-design.md) —
 * so selecting it only flips shared UI state; CategoryPageShell reads that
 * state to show a "Coming soon" placeholder instead of a category's normal
 * boxes.
 */
export function MMToggle() {
  const { mode, setMode } = useWagersMode();

  return (
    <div className="inline-flex rounded-pill border border-gold-400 bg-cream-50 p-[3px]">
      <button
        type="button"
        onClick={() => setMode("coins")}
        aria-pressed={mode === "coins"}
        className={[
          "rounded-pill px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide transition-colors",
          mode === "coins" ? "bg-maroon-700 text-cream-50" : "text-ink-500",
        ].join(" ")}
      >
        MM Coins
      </button>
      <button
        type="button"
        onClick={() => setMode("real")}
        aria-pressed={mode === "real"}
        className={[
          "rounded-pill px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide transition-colors",
          mode === "real" ? "bg-maroon-700 text-cream-50" : "text-ink-500",
        ].join(" ")}
      >
        Real Wagers
      </button>
    </div>
  );
}
