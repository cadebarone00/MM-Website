/**
 * Plain-English status of every match in the 2034 Test Season, for Tiger's
 * rehearsal: who has matched how many holes, who has pressed Submit Round,
 * whether the round is now an official record, and what would happen to each
 * player's handicap. Pure — the API route gathers the facts, this explains them.
 */
export interface TestSeasonStatusInput {
  boxes: { id: string; round: number; boxNumber: number; format: string; maroonPlayers: string[]; whitePlayers: string[] }[];
  /** live_hole_scores rows that are confirmed (you and your scorer agree). */
  confirmedHoles: { round: number; player_slug: string; hole: number }[];
  submissions: { match_box_id: string; player_slug: string }[];
  archiveStatuses: { round: number; player_slug: string; status: string }[];
  officialStates: { match_box_id: string; status: string; leader: string; margin: number; thru: number }[];
  /** `${round}:${player}` -> whether this round would count toward that player's handicap. */
  handicapCounts: Record<string, boolean>;
}

export interface TestSeasonPlayerStatus {
  slug: string;
  name: string;
  holesConfirmed: number;
  submitted: boolean;
  archiveStatus: string | null;
  countsForHandicap: boolean;
}

export interface TestSeasonMatchStatus {
  id: string;
  label: string;
  matchStatus: "Not started" | "In progress" | "Decided" | "Closed out";
  players: TestSeasonPlayerStatus[];
  hint: string;
}

export function summarizeTestSeason(input: TestSeasonStatusInput, nameOf: (slug: string) => string = (slug) => slug): TestSeasonMatchStatus[] {
  return input.boxes.map((box) => {
    const official = input.officialStates.find((state) => state.match_box_id === box.id);
    const players = [...box.maroonPlayers, ...box.whitePlayers].map((slug): TestSeasonPlayerStatus => ({
      slug,
      name: nameOf(slug),
      holesConfirmed: input.confirmedHoles.filter((row) => row.round === box.round && row.player_slug === slug).length,
      submitted: input.submissions.some((row) => row.match_box_id === box.id && row.player_slug === slug),
      archiveStatus: input.archiveStatuses.find((row) => row.round === box.round && row.player_slug === slug)?.status ?? null,
      countsForHandicap: input.handicapCounts[`${box.round}:${slug}`] === true,
    }));

    const matchStatus = official?.status === "closed_out" ? "Closed out" : official?.status === "complete" ? "Decided" : official?.status === "live" ? "In progress" : "Not started";
    const waiting = players.filter((player) => !player.submitted).map((player) => player.name);
    const allMatched = players.every((player) => player.holesConfirmed >= 18);
    const mostProgress = Math.min(...players.map((player) => player.holesConfirmed));
    let hint: string;
    if (matchStatus === "Closed out") hint = "Closed out \u2014 the match is final and wagers are settled.";
    else if (waiting.length === 0) hint = "Everyone has submitted \u2014 ready for you to Close Out Match in the Tiger Center.";
    else if (allMatched) hint = `All holes match \u2014 waiting on ${waiting.join(" & ")} to press Submit Round.`;
    else if (players.some((player) => player.holesConfirmed > 0)) hint = `Scoring in progress \u2014 ${mostProgress} of 18 holes matched so far.`;
    else hint = "No holes scored yet.";

    return { id: box.id, label: `Round ${box.round} \u00b7 Match ${box.boxNumber} \u00b7 ${box.format}`, matchStatus, players, hint };
  });
}
