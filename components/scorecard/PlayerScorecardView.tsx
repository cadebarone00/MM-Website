"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ScorecardRow } from "./ScorecardRow";
import { CourseInfoHeader } from "./CourseInfoHeader";
import { ScorecardLegend } from "./ScorecardLegend";
import { HoleMarkerForDiff } from "./HoleMarker";
import type { PlayerScorecard } from "@/lib/data";

function HoleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-[2px] px-3">
      <span className="font-score text-lg font-bold text-ink-900 tabular-nums">{value}</span>
      <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">{label}</span>
    </div>
  );
}

export function PlayerScorecardView({ scorecard }: { scorecard: PlayerScorecard }) {
  const [round, setRound] = useState(String(scorecard.rounds[scorecard.rounds.length - 1].round));
  const [selectedHole, setSelectedHole] = useState<number | null>(null);
  const active = scorecard.rounds.find((r) => String(r.round) === round) ?? scorecard.rounds[0];
  const holeStat = selectedHole != null ? (active.holes.find((h) => h.hole === selectedHole) ?? null) : null;

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

      <div className="overflow-x-auto">
        <CourseInfoHeader round={active} onHoleClick={setSelectedHole} selectedHole={selectedHole} />
        <ScorecardRow round={active} onHoleClick={setSelectedHole} selectedHole={selectedHole} />
      </div>

      <div className="mt-3 sm:mt-5">
        <ScorecardLegend />
      </div>

      {holeStat && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-center gap-3 py-3 px-3 bg-white border border-ink-100 rounded-md mb-4">
            <HoleMarkerForDiff diff={holeStat.diff} size={40}>
              {holeStat.score}
            </HoleMarkerForDiff>
            <div className="flex divide-x divide-ink-100">
              <HoleStat label="Par" value={String(holeStat.par)} />
              <HoleStat label="Yards" value={String(holeStat.yards)} />
              <HoleStat label="Putts" value={String(holeStat.putts)} />
              <HoleStat label="FIR" value={holeStat.fir === "X" ? "–" : holeStat.fir === 1 ? "Hit" : "Miss"} />
              <HoleStat label="GIR" value={holeStat.gir === 1 ? "Hit" : "Miss"} />
            </div>
          </div>

          <div className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400 mb-2">Hole Overview</div>
          <div className="aspect-[16/7] w-full flex flex-col items-center justify-center gap-2 bg-cream-100 border border-ink-100 rounded-md text-ink-400">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="font-condensed text-xs font-semibold tracking-wide uppercase">Hole photos coming soon</span>
          </div>
        </div>
      )}
    </div>
  );
}
