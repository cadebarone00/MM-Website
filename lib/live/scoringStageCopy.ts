import type { ScoringStage } from "./scoringStage.ts";

const BUTTON_LABELS: Record<Exclude<ScoringStage, "none">, string> = {
  upcoming: "Begin Round",
  begin: "Begin Round",
  continue: "Continue Round",
  ready: "Continue Round",
  submitted: "View Scorecard",
};

/** The wording for the Scoring tab, shared by the real Scoring tab and Tiger's live scoring preview so they can't drift apart. */
export function stageButtonLabel(stage: Exclude<ScoringStage, "none">): string {
  return BUTTON_LABELS[stage];
}

export function stageNote(stage: ScoringStage, facts: { holesEntered: number; waitingNames: string[] }): string | null {
  if (stage === "upcoming") return "Waiting For Round To Begin";
  if (stage === "continue") return `Through ${facts.holesEntered} hole${facts.holesEntered === 1 ? "" : "s"}`;
  if (stage === "ready") return "Your card matches \u2014 submit your round";
  if (stage === "submitted") return facts.waitingNames.length > 0 ? `Waiting on ${facts.waitingNames.join(" & ")}` : "Round complete";
  return null;
}
