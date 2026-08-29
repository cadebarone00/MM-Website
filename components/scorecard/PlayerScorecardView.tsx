"use client";

import { useState } from "react";
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
        <div className="w-max min-w-full rounded-md border border-ink-900 bg-white">
          <CourseInfoHeader round={active} onHoleClick={setSelectedHole} selectedHole={selectedHole} />
          <ScorecardRow round={active} player={scorecard.player} team={scorecard.team} onHoleClick={setSelectedHole} selectedHole={selectedHole} />
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
