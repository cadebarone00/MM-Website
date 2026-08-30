"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ScorecardRow } from "./ScorecardRow";
import { CourseInfoHeader } from "./CourseInfoHeader";
import { MobileScorecardGrid } from "./MobileScorecardGrid";
import { holePhotoCandidates } from "@/lib/data/holePhotos";
import type { PlayerScorecard, RoundScorecard } from "@/lib/data";

function defaultSelectedHole(round: RoundScorecard): number {
  const playedCount = round.holes.filter((h) => h.score > 0).length;
  return playedCount > 0 && playedCount < round.holes.length ? playedCount : 1;
}

export function PlayerScorecardView({ scorecard }: { scorecard: PlayerScorecard }) {
  const [round, setRound] = useState(String(scorecard.rounds[scorecard.rounds.length - 1].round));
  const [selectedHole, setSelectedHole] = useState<number>(() => defaultSelectedHole(scorecard.rounds[scorecard.rounds.length - 1]));
  const [photoIndex, setPhotoIndex] = useState(0);
  const active = scorecard.rounds.find((r) => String(r.round) === round) ?? scorecard.rounds[0];
  const holeStat = selectedHole != null ? (active.holes.find((h) => h.hole === selectedHole) ?? null) : null;
  const photoCandidates = holeStat ? holePhotoCandidates(active.course, holeStat.hole) : [];
  const photoSrc = photoCandidates[photoIndex] ?? null;

  const holeRefs = useRef<Map<number, HTMLElement>>(new Map());
  const registerHoleRef = useCallback((hole: number, el: HTMLElement | null) => {
    if (el) holeRefs.current.set(hole, el);
    else holeRefs.current.delete(hole);
  }, []);

  const [cap, setCap] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = holeRefs.current.get(selectedHole);
    setCap(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [selectedHole, round]);

  useEffect(() => {
    setPhotoIndex(0);
  }, [active.course, selectedHole, round]);

  return (
    <div>
      <div className="relative mb-3 inline-block w-full sm:w-auto">
        <select
          value={round}
          onChange={(e) => {
            const nextRound = scorecard.rounds.find((r) => String(r.round) === e.target.value);
            setRound(e.target.value);
            setSelectedHole(defaultSelectedHole(nextRound ?? scorecard.rounds[0]));
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

      <div className="sm:hidden">
        <MobileScorecardGrid
          round={active}
          selectedHole={selectedHole}
          onHoleClick={setSelectedHole}
          initialHole={defaultSelectedHole(active)}
        />
      </div>

      <div className="hidden overflow-x-auto overflow-y-hidden sm:block">
        <div className="relative w-max rounded-2xl border border-ink-300 bg-cream-100">
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

      {holeStat && (
        <div className="mt-3 sm:mt-5">
          <div className="flex items-center justify-center gap-3 py-3 px-3 bg-white border border-ink-100 rounded-md mb-4">
            <div className="flex divide-x divide-ink-100">
              <div className="flex flex-col items-center gap-[2px] px-3">
                <span className="font-score text-lg font-bold text-ink-900 tabular-nums">{holeStat.putts}</span>
                <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">Putts</span>
              </div>
              <div className="flex flex-col items-center gap-[2px] px-3">
                <span className="font-score text-lg font-bold text-ink-900 tabular-nums">{holeStat.fir === "X" ? "–" : holeStat.fir === 1 ? "Hit" : "Miss"}</span>
                <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">FIR</span>
              </div>
              <div className="flex flex-col items-center gap-[2px] px-3">
                <span className="font-score text-lg font-bold text-ink-900 tabular-nums">{holeStat.gir === 1 ? "Hit" : "Miss"}</span>
                <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">GIR</span>
              </div>
            </div>
          </div>

          <div className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400 mb-2">Hole Overview</div>
          {photoSrc ? (
            <img
              src={photoSrc}
              alt={`Hole ${holeStat.hole} at ${active.course}`}
              className="aspect-[16/7] w-full object-cover rounded-md border border-ink-100"
              onError={() => setPhotoIndex((current) => Math.min(current + 1, photoCandidates.length - 1))}
            />
          ) : (
            <div className="aspect-[16/7] w-full flex flex-col items-center justify-center gap-2 bg-cream-100 border border-ink-100 rounded-md text-ink-400">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span className="font-condensed text-xs font-semibold tracking-wide uppercase">Hole photos coming soon</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
