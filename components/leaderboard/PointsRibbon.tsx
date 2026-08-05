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

/** Compact two-tone score ticker, sticky under the header. Proportional fill shows each team's share of available points; the middle strip carries the "points left" or win/retain state. */
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
      <div className="flex h-[57px] w-full border-y border-gold-300 sm:h-[56px] lg:h-[74px]">
        <div
          className="flex items-center justify-end pr-[10%]"
          style={{ width: `${maroonFill}%`, background: "var(--color-maroon-700)" }}
        >
          <span className="font-sans text-2xl font-black text-white sm:text-2xl lg:text-4xl">{fmtPt(tournament.maroonPts)}</span>
        </div>
        <div className="flex flex-1 items-center justify-center bg-cream-200 px-2">
          {badgeState.kind === "undecided" && (
            <span className="whitespace-nowrap border border-ink-900 px-1.5 py-0.5 font-sans text-3xs font-extrabold uppercase tracking-wide text-ink-900 sm:px-2 sm:py-1 sm:text-2xs">
              {fmtPt(stillAvailable)} Left
            </span>
          )}
        </div>
        <div
          className="flex items-center justify-start pl-[10%]"
          style={{ width: `${whiteFill}%`, background: "#fdfdfb" }}
        >
          <span className="font-sans text-2xl font-black text-maroon-700 sm:text-2xl lg:text-4xl">{fmtPt(tournament.whitePts)}</span>
        </div>
      </div>
      <div className="flex min-h-[22px] items-center justify-between border-2 border-t-0 border-gold-400 bg-cream-100 px-2 sm:min-h-[32px] sm:px-4 lg:min-h-[40px] lg:px-6">
        <span className="font-sans text-2xs font-black text-maroon-700 sm:text-sm lg:text-xl">MAROON</span>
        {badgeState.kind !== "undecided" && (
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
    </div>
  );
}
