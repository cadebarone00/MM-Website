import type { ArchivedHandicapRound, HandicapRoundSummary } from "./types";

export type HandicapHistoryRound =
  | { source: "archive"; round: ArchivedHandicapRound }
  | { source: "submitted"; round: HandicapRoundSummary };

export type ScoreView = "recent" | "all" | "highest" | "lowest";

/** Input is newest first from handicapHistory; score ties retain that order. */
export function selectHandicapScores(rounds: HandicapHistoryRound[], view: ScoreView): HandicapHistoryRound[] {
  if (view === "recent") return rounds.slice(0, 20);
  if (view === "all") return [...rounds];
  return [...rounds].sort((a, b) => {
    const left = a.round.totalScore, right = b.round.totalScore;
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return view === "highest" ? right - left : left - right;
  });
}

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
