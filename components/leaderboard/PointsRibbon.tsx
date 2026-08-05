"use client";

import { useEffect, useState } from "react";
import { defendingChampion, fmtPt } from "@/lib/data";
import type { Team, Tournament } from "@/lib/data/types";

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

type BadgeState = { kind: "undecided" } | { kind: "wins" | "retains"; team: Team };

function computeBadgeState(tournament: Tournament): BadgeState {
  const half = tournament.pointsAvailable / 2;
  const defender = defendingChampion(tournament);

  if (tournament.maroonPts >= tournament.pointsToWin) return { kind: "wins", team: "maroon" };
  if (tournament.whitePts >= tournament.pointsToWin) return { kind: "wins", team: "white" };
  if (defender === "maroon" && tournament.maroonPts >= half) return { kind: "retains", team: "maroon" };
  if (defender === "white" && tournament.whitePts >= half) return { kind: "retains", team: "white" };
  return { kind: "undecided" };
}

function TeamLabelBar({ badgeState, stillAvailable }: { badgeState: BadgeState; stillAvailable: number }) {
  return (
    <div className="flex min-h-[22px] items-center justify-between border-2 border-t-0 border-gold-400 bg-cream-100 px-2 sm:min-h-[32px] sm:px-4 lg:min-h-[40px] lg:px-6">
      <span className="font-sans text-2xs font-black text-maroon-700 sm:text-sm lg:text-xl">MAROON</span>
      {badgeState.kind === "undecided" ? (
        <span className="whitespace-nowrap border border-ink-900 px-1.5 py-0.5 font-sans text-3xs font-extrabold uppercase tracking-wide text-ink-900 sm:px-2 sm:py-1 sm:text-2xs">
          {fmtPt(stillAvailable)} Left
        </span>
      ) : (
        <span
          className={[
            "rounded-pill px-2 py-0.5 font-condensed text-3xs font-extrabold uppercase tracking-wide sm:px-3 sm:py-1 sm:text-2xs",
            badgeState.team === "maroon" ? "bg-maroon-700 text-white" : "border border-maroon-700 bg-white text-maroon-700",
          ].join(" ")}
        >
          {badgeState.team === "maroon" ? "Maroon" : "White"} {badgeState.kind === "wins" ? "Wins" : "Retains"}
        </span>
      )}
      <span className="font-sans text-2xs font-black text-ink-900 sm:text-sm lg:text-xl">WHITE</span>
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
  const stillAvailable = Math.max(0, tournament.pointsAvailable - tournament.maroonPts - tournament.whitePts);
  const badgeState = computeBadgeState(tournament);

  return (
    <div className="sticky z-40 w-screen ml-[calc(50%-50vw)] mr-[calc(50%-50vw)]" style={{ top: headerOffset }}>
      {/* Mobile: fixed 50/50 split, gold divider, numbers pinned at 40%/60%. */}
      <div className="lg:hidden">
        <div className="relative flex h-[114px] w-full border-y border-gold-300">
          <div className="w-1/2" style={{ background: "var(--color-maroon-700)" }} />
          <div className="w-1/2" style={{ background: "#fdfdfb" }} />
          <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-gold-500" />
          <div className="absolute inset-y-0 flex flex-col items-center justify-center" style={{ left: "40%", transform: "translateX(-50%)" }}>
            <span className="font-sans text-5xl font-black leading-none text-white">{fmtPt(tournament.maroonPts)}</span>
          </div>
          <div className="absolute inset-y-0 flex flex-col items-center justify-center" style={{ left: "60%", transform: "translateX(-50%)" }}>
            <span className="font-sans text-5xl font-black leading-none text-maroon-700">{fmtPt(tournament.whitePts)}</span>
          </div>
        </div>
        <TeamLabelBar badgeState={badgeState} stillAvailable={stillAvailable} />
      </div>

      {/* Desktop: unchanged from before this pass — proportional fill. */}
      <div className="hidden lg:block">
        <div className="flex h-[74px] w-full border-y border-gold-300">
          <div
            className="flex items-center justify-end pr-[10%]"
            style={{ width: `${maroonFill}%`, background: "var(--color-maroon-700)" }}
          >
            <span className="font-sans text-4xl font-black text-white">{fmtPt(tournament.maroonPts)}</span>
          </div>
          <div className="flex flex-1 items-center justify-center bg-cream-200 px-2">
            {badgeState.kind === "undecided" && (
              <span className="whitespace-nowrap border border-ink-900 px-2 py-1 font-sans text-2xs font-extrabold uppercase tracking-wide text-ink-900">
                {fmtPt(stillAvailable)} Left
              </span>
            )}
          </div>
          <div
            className="flex items-center justify-start pl-[10%]"
            style={{ width: `${whiteFill}%`, background: "#fdfdfb" }}
          >
            <span className="font-sans text-4xl font-black text-maroon-700">{fmtPt(tournament.whitePts)}</span>
          </div>
        </div>
        <div className="flex min-h-[40px] items-center justify-between border-2 border-t-0 border-gold-400 bg-cream-100 px-6">
          <span className="font-sans text-xl font-black text-maroon-700">MAROON</span>
          {badgeState.kind !== "undecided" && (
            <span
              className={[
                "rounded-pill px-3 py-1 font-condensed text-2xs font-extrabold uppercase tracking-wide",
                badgeState.team === "maroon" ? "bg-maroon-700 text-white" : "border border-maroon-700 bg-white text-maroon-700",
              ].join(" ")}
            >
              {badgeState.team === "maroon" ? "Maroon" : "White"} {badgeState.kind === "wins" ? "Wins" : "Retains"}
            </span>
          )}
          <span className="font-sans text-xl font-black text-ink-900">WHITE</span>
        </div>
      </div>
    </div>
  );
}
