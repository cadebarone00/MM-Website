"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ScorecardRow } from "./ScorecardRow";
import { CourseInfoHeader } from "./CourseInfoHeader";
import { MobileScorecardGrid } from "./MobileScorecardGrid";
import { RoundVideoPlaceholder } from "./RoundVideoPlaceholder";
import { HoleDetailCard } from "./HoleDetailCard";
import { ShotVideoPanel } from "./ShotVideoPanel";
import { PlayerBioSection } from "./PlayerBioSection";
import { StatsSection } from "@/components/stats/StatsSection";
import { holePhotoCandidates } from "@/lib/data/holePhotos";
import { getPlayerProfile } from "@/lib/data/players";
import type { PlayerScorecard, RoundScorecard, Tournament } from "@/lib/data";

// A finished round opens on hole 1. A round still in progress opens on
// whichever hole was most recently finished (the played-holes count itself,
// since holes are scored in order).
function defaultSelectedHole(round: RoundScorecard): number {
  const playedCount = round.holes.filter((h) => h.score > 0).length;
  return playedCount > 0 && playedCount < round.holes.length ? playedCount : 1;
}

export function PlayerScorecardView({
  scorecard,
  tournament,
  shotVideos,
}: {
  scorecard: PlayerScorecard;
  tournament: Tournament;
  shotVideos?: Record<number, Record<number, Record<number, string>>>; // round -> hole -> shot -> url
}) {
  const [round, setRound] = useState(String(scorecard.rounds[scorecard.rounds.length - 1].round));
  const [selectedHole, setSelectedHole] = useState<number>(() => defaultSelectedHole(scorecard.rounds[scorecard.rounds.length - 1]));
  const [photoIndex, setPhotoIndex] = useState(0);
  const active = scorecard.rounds.find((r) => String(r.round) === round) ?? scorecard.rounds[0];
  const holeStat = active.holes.find((h) => h.hole === selectedHole) ?? null;
  const holesWithVideo = new Set(
    Object.entries(shotVideos?.[active.round] ?? {})
      .filter(([, shots]) => Object.keys(shots).length > 0)
      .map(([hole]) => Number(hole))
  );
  const photoCandidates = holeStat ? holePhotoCandidates(active.course, holeStat.hole) : [];
  const photoSrc = photoCandidates[photoIndex] ?? null;

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

      {/* Desktop: the full 18-hole table with OUT/IN subtotals. */}
      <div className="hidden overflow-x-auto overflow-y-hidden sm:block">
        <div className="relative w-max rounded-2xl border border-ink-300 bg-cream-100">
          <CourseInfoHeader
            round={active}
            onHoleClick={setSelectedHole}
            selectedHole={selectedHole}
            registerHoleRef={registerHoleRef}
            holesWithVideo={holesWithVideo}
          />
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

      {/* Mobile: edge-to-edge, frozen name/total columns, one swipe between the front and back nine. */}
      <div className="-mx-7 sm:hidden">
        <MobileScorecardGrid
          round={active}
          selectedHole={selectedHole}
          onHoleClick={setSelectedHole}
          initialHole={defaultSelectedHole(active)}
          holesWithVideo={holesWithVideo}
        />
      </div>

      <div className="mt-3">
        {holeStat ? (
          <>
            <HoleDetailCard hole={holeStat} />

            <div className="mt-3">
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

            <div className="mt-3">
              <ShotVideoPanel
                key={`${active.round}-${selectedHole}`}
                shotCount={holeStat.score}
                videoUrls={shotVideos?.[active.round]?.[selectedHole]}
              />
            </div>
          </>
        ) : (
          <RoundVideoPlaceholder roundLabel={`Round ${active.round}`} />
        )}
      </div>

      <StatsSection tournament={tournament} player={scorecard.player} />

      <PlayerBioSection profile={getPlayerProfile(scorecard.player)} />
    </div>
  );
}
