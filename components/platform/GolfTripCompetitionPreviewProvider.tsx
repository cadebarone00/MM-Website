"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { GOLF_TRIP_COMPETITION_PREVIEW, addCompetitionRound, removeCompetitionRound, updateCompetitionRounds, type CompetitionRound, type CompetitionRoundChange } from "@/lib/platform/golfTripCompetitionPreview";

/** Organizer → Competition → Overview: the chosen Individual and Team types (null = None). */
export type CompetitionTypeChoice = { individual: string | null; team: string | null };
const NO_TYPES: CompetitionTypeChoice = { individual: null, team: null };

const CompetitionContext = createContext<{
  /** Undefined until the organizer picks a type in Settings; then the Golf tab follows it. */
  competitionType?: CompetitionTypeChoice;
  setCompetitionType: Dispatch<SetStateAction<CompetitionTypeChoice>>;
  rounds: CompetitionRound[];
  change: (change: CompetitionRoundChange, id?: string) => void;
  addRound: (date: string) => void;
  removeRound: (id: string) => void;
} | null>(null);

/** Shared only by development preview routes; resets on reload, never writes to storage. */
export function GolfTripCompetitionPreviewProvider({ children }: { children: ReactNode }) {
  const [rounds, setRounds] = useState(() => GOLF_TRIP_COMPETITION_PREVIEW.map(round => ({ ...round })));
  const [competitionType, setType] = useState<CompetitionTypeChoice | undefined>(undefined);
  const setCompetitionType: Dispatch<SetStateAction<CompetitionTypeChoice>> = update =>
    setType(current => typeof update === "function" ? update(current ?? NO_TYPES) : update);
  return <CompetitionContext.Provider value={{ competitionType, setCompetitionType, rounds, change: (change, id) => setRounds(current => updateCompetitionRounds(current, change, id)),
    addRound: date => setRounds(current => addCompetitionRound(current, date, `round-${Date.now()}`)),
    removeRound: id => setRounds(current => removeCompetitionRound(current, id)) }}>
    {children}
  </CompetitionContext.Provider>;
}

export function useGolfTripCompetitionPreview() {
  return useContext(CompetitionContext);
}
