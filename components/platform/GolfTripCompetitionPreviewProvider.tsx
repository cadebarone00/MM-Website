"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { GOLF_TRIP_COMPETITION_PREVIEW, updateCompetitionRounds, type CompetitionRound, type CompetitionRoundChange } from "@/lib/platform/golfTripCompetitionPreview";

const CompetitionContext = createContext<{
  rounds: CompetitionRound[];
  change: (change: CompetitionRoundChange, id?: string) => void;
} | null>(null);

/** Shared only by development preview routes; resets on reload, never writes to storage. */
export function GolfTripCompetitionPreviewProvider({ children }: { children: ReactNode }) {
  const [rounds, setRounds] = useState(() => GOLF_TRIP_COMPETITION_PREVIEW.map(round => ({ ...round })));
  return <CompetitionContext.Provider value={{ rounds, change: (change, id) => setRounds(current => updateCompetitionRounds(current, change, id)) }}>
    {children}
  </CompetitionContext.Provider>;
}

export function useGolfTripCompetitionPreview() {
  return useContext(CompetitionContext);
}
