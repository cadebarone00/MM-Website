"use client";

import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { TeamDraft } from "@/lib/platform/teamDraft";
import { GOLF_TRIP_COMPETITION_PREVIEW, addCompetitionRound, removeCompetitionRound, updateCompetitionRounds, type CompetitionRound, type CompetitionRoundChange } from "@/lib/platform/golfTripCompetitionPreview";

/** Organizer → Competition → Overview: the chosen Individual and Team types (null = None). */
export type CompetitionTypeChoice = { individual: string | null; team: string | null };
const NO_TYPES: CompetitionTypeChoice = { individual: null, team: null };

const CompetitionContext = createContext<{
  /** Per trip data (dev: maroon / mock / busy / just created): missing until the organizer picks a type in Settings; then
   *  that trip's Golf tab follows it. */
  competitionTypes: Record<string, CompetitionTypeChoice>;
  setCompetitionType: (key: string) => Dispatch<SetStateAction<CompetitionTypeChoice>>;
  /** Per trip data: each team's color (Team A, Team B… → a TEAM_COLORS id), once the organizer picks them. */
  teamColors: Record<string, (string | null)[]>;
  setTeamColors: (key: string) => Dispatch<SetStateAction<(string | null)[]>>;
  /** Per trip data: the team type, how teams are picked and, for a draft, when and its order (Home's Draftboard). */
  teamDrafts: Record<string, TeamDraft>;
  setTeamDraft: (key: string, draft: TeamDraft) => void;
  rounds: CompetitionRound[];
  change: (change: CompetitionRoundChange, id?: string) => void;
  addRound: (date: string) => void;
  removeRound: (id: string) => void;
} | null>(null);

/** Shared only by development preview routes; resets on reload, never writes to storage. */
export function GolfTripCompetitionPreviewProvider({ children }: { children: ReactNode }) {
  const [rounds, setRounds] = useState(() => GOLF_TRIP_COMPETITION_PREVIEW.map(round => ({ ...round })));
  const [competitionTypes, setTypes] = useState<Record<string, CompetitionTypeChoice>>({});
  const setCompetitionType = (key: string): Dispatch<SetStateAction<CompetitionTypeChoice>> => update =>
    setTypes(current => ({ ...current, [key]: typeof update === "function" ? update(current[key] ?? NO_TYPES) : update }));
  const [teamColors, setColors] = useState<Record<string, (string | null)[]>>({});
  const setTeamColors = (key: string): Dispatch<SetStateAction<(string | null)[]>> => update =>
    setColors(current => ({ ...current, [key]: typeof update === "function" ? update(current[key] ?? []) : update }));
  const [teamDrafts, setDrafts] = useState<Record<string, TeamDraft>>({});
  // Stable, so Settings can keep it in step from an effect.
  const setTeamDraft = useCallback((key: string, draft: TeamDraft) => setDrafts(current => ({ ...current, [key]: draft })), []);
  return <CompetitionContext.Provider value={{ competitionTypes, setCompetitionType, teamColors, setTeamColors, teamDrafts, setTeamDraft, rounds, change: (change, id) => setRounds(current => updateCompetitionRounds(current, change, id)),
    addRound: date => setRounds(current => addCompetitionRound(current, date, `round-${Date.now()}`)),
    removeRound: id => setRounds(current => removeCompetitionRound(current, id)) }}>
    {children}
  </CompetitionContext.Provider>;
}

export function useGolfTripCompetitionPreview() {
  return useContext(CompetitionContext);
}
