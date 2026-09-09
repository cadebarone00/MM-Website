import type { ArchivedHandicapRound, HandicapRoundSummary } from "./types";

export type HandicapHistoryRound =
  | { source: "archive"; round: ArchivedHandicapRound }
  | { source: "submitted"; round: HandicapRoundSummary };

export function handicapHistory(
  archived: ArchivedHandicapRound[],
  submitted: HandicapRoundSummary[],
  section: "maroon-masters" | "overall",
): HandicapHistoryRound[] {
  const rounds: HandicapHistoryRound[] = archived.map((round) => ({ source: "archive", round }));
  if (section === "overall") rounds.push(...submitted.map((round) => ({ source: "submitted" as const, round })));
  return rounds.sort((a, b) => {
    // Archives have a tournament date, not an exact date for each round.
    const aDate = a.source === "archive" ? a.round.tournamentDate : a.round.datePlayed;
    const bDate = b.source === "archive" ? b.round.tournamentDate : b.round.datePlayed;
    return bDate.localeCompare(aDate) || (a.source === "archive" && b.source === "archive" ? b.round.round - a.round.round : 0);
  });
}
