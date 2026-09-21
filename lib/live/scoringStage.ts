// lib/live/scoringStage.ts
import type { MatchState } from "./types.ts";
import type { RoundCardState } from "./roundStatus.ts";

/** What the Scoring tab shows for the player's current round. Finished rounds never reach this — they are skipped before it. */
export type ScoringStage = "none" | "upcoming" | "begin" | "continue" | "ready" | "submitted";

export function scoringStage(input: { hasMatch: boolean; matchState: MatchState | null; holesEntered: number; roundCard: RoundCardState; iSubmitted: boolean }): ScoringStage {
  if (!input.hasMatch) return "none";
  if (input.iSubmitted) return "submitted";
  if (input.matchState !== "Live") return "upcoming";
  if (input.holesEntered === 0) return "begin";
  return input.roundCard === "match" ? "ready" : "continue";
}
