"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ScorecardRow } from "./ScorecardRow";
import { CourseInfoHeader } from "./CourseInfoHeader";
import { ScorecardLegend } from "./ScorecardLegend";
import { RoundVideoPlaceholder } from "./RoundVideoPlaceholder";
import { HoleDetailCard } from "./HoleDetailCard";
import { ShotVideoPanel } from "./ShotVideoPanel";
import type { PlayerScorecard } from "@/lib/data";

export function PlayerScorecardView({ scorecard }: { scorecard: PlayerScorecard }) {
  const [round, setRound] = useState(String(scorecard.rounds[scorecard.rounds.length - 1].round));
  const [selectedHole, setSelectedHole] = useState<number | null>(null);
  const active = scorecard.rounds.find((r) => String(r.round) === round) ?? scorecard.rounds[0];
  const holeStat = selectedHole != null ? (active.holes.find((h) => h.hole === selectedHole) ?? null) : null;

  // Shared registry of each hole's cell element, keyed by hole number — used
  // both to measure the selected-hole highlight overlay and to scroll a
  // live in-progress round's current hole into view.
  const holeRefs = useRef<Map<number, HTMLElement>>(new Map());
  const registerHoleRef = useCallback((hole: number, el: HTMLElement | null) => {
    if (el) holeRefs.current.set(hole, el);
    else holeRefs.current.delete(hole);
  }, []);

  const [cap, setCap] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (selectedHole == null) {
      setCap(null);
      return;
    }
    const el = holeRefs.current.get(selectedHole);
    setCap(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [selectedHole, round]);

  // A round that's partway through (some holes scored, not all) with its
  // next hole on the back nine should open scrolled to the back nine
  // instead of defaulting to the front.
  const playedCount = active.holes.filter((h) => h.score > 0).length;
  const currentHole = playedCount > 0 && playedCount < active.holes.length ? playedCount + 1 : null;

  useLayoutEffect(() => {
    if (currentHole == null || currentHole <= 9) return;
    holeRefs.current.get(currentHole)?.scrollIntoView({ inline: "start", block: "nearest" });
  }, [round, currentHole]);

  return (
    <div>
      <div className="relative mb-3 inline-block w-full sm:w-auto">
        <select
          value={round}
          onChange={(e) => {
            setRound(e.target.value);
            setSelectedHole(null);
          }}
          className="w-full appearance-none rounded-sm border border-ink-200 bg-white py-2 pl-3 pr-9 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-900 sm:w-auto sm:text-sm"
        >
          {scorecard.rounds.map((r) => (
            <option key={r.round} value={String(r.round)}>
              Round {r.round} – {r.course}
              {r.format ? ` (${r.format})` : ""}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
      </div>

      {/* Full-bleed on mobile (cancels the page's side padding), a normal inset card from sm up. */}
      <div className="-mx-7 sm:mx-0">
        <div className="overflow-x-auto">
          <div className="relative w-max rounded-none border-y border-ink-200 bg-cream-100 sm:rounded-2xl sm:border">
            <CourseInfoHeader round={active} onHoleClick={setSelectedHole} selectedHole={selectedHole} registerHoleRef={registerHoleRef} />
            <ScorecardRow round={active} onHoleClick={setSelectedHole} selectedHole={selectedHole} registerHoleRef={registerHoleRef} />

            {cap && (
              <>
                <div
                  className="pointer-events-none absolute -top-2 h-2 rounded-t-2xl bg-maroon-700"
                  style={{ left: cap.left, width: cap.width }}
                />
                <div
                  className="pointer-events-none absolute -bottom-2 h-2 rounded-b-2xl bg-maroon-700"
                  style={{ left: cap.left, width: cap.width }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 sm:mt-5">
        <ScorecardLegend />
      </div>

      <div className="mt-4">
        {holeStat ? (
          <>
            <div className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-maroon-600 mb-2">Hole {holeStat.hole}</div>
            <HoleDetailCard hole={holeStat} />
            <div className="mt-6">
              <ShotVideoPanel shotCount={holeStat.score} />
            </div>
          </>
        ) : (
          <RoundVideoPlaceholder roundLabel={`Round ${active.round}`} />
        )}
      </div>
    </div>
  );
}
