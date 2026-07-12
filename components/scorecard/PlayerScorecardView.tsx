"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { ScorecardRow } from "./ScorecardRow";
import { CourseInfoHeader } from "./CourseInfoHeader";
import { RoundStatsBar } from "./RoundStatsBar";
import { ScorecardLegend } from "./ScorecardLegend";
import type { PlayerScorecard } from "@/lib/data";

export function PlayerScorecardView({ scorecard, tournamentSlug }: { scorecard: PlayerScorecard; tournamentSlug: string }) {
  const [round, setRound] = useState(String(scorecard.rounds[0].round));
  const active = scorecard.rounds.find((r) => String(r.round) === round) ?? scorecard.rounds[0];

  return (
    <div>
      <div className="mb-5 overflow-x-auto">
        <Tabs
          variant="pill"
          items={scorecard.rounds.map((r) => ({ value: String(r.round), label: `Round ${r.round} – ${r.course}` }))}
          value={round}
          onChange={setRound}
        />
      </div>

      <RoundStatsBar round={active} />
      <CourseInfoHeader round={active} />
      <div>
        <ScorecardRow round={active} tournamentSlug={tournamentSlug} player={scorecard.player} team={scorecard.team} />
      </div>

      <div className="mt-5">
        <ScorecardLegend />
      </div>
    </div>
  );
}
