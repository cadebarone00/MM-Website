// lib/live/previewMatchState.ts
//
// The Tiger Center's Live Scoring Page Editor has no database, so it can't
// read the real live_match_official_state row the way the real scoring
// screen does. This derives the same {leader, margin, thru,
// mathematicallyComplete} shape from the preview room's submissions, using
// the exact same "confirmed" rule (both scorers agree) and the exact same
// hole-winner math as the real system (matchBoxResult), so the preview's
// match-completeness card behaves like the real one.
import { matchBoxResult, matchBoxStartedThru } from "./orchestration.ts";
import { holeSubmissionStatus, submittedPair, type HoleSubmission, type ScoringPair } from "./holeSubmission.ts";
import type { LiveHoleScore, LiveMatchBox, LiveTournamentSnapshot } from "./types.ts";

export interface PreviewOfficialState {
  leader: "maroon" | "white" | "tie";
  margin: number;
  thru: number;
  mathematicallyComplete: boolean;
}

export function previewOfficialState(
  box: ScoringPair,
  round: number,
  holes: { number: number }[],
  submissions: HoleSubmission[]
): PreviewOfficialState {
  const scores = new Map<string, LiveHoleScore>();
  const allPlayers = [...box.maroonPlayers, ...box.whitePlayers];
  for (const hole of holes) {
    for (const player of allPlayers) {
      if (holeSubmissionStatus(box, player, hole.number, submissions) !== "confirmed") continue;
      const mine = submittedPair(box, player, hole.number, submissions).mine;
      if (!mine) continue;
      scores.set(`${player}:${round}:${hole.number}`, {
        seasonYear: 0, player, round, hole: hole.number, score: mine.ownScore, putts: null, fir: null, gir: null, hostEdited: false,
      });
    }
  }
  const snapshot: LiveTournamentSnapshot = { players: {}, courses: {}, roundCourses: {}, scores, matchBoxes: [] };
  const matchBox: LiveMatchBox = {
    id: null, seasonYear: 0, round, boxNumber: 0, format: box.format, teeTime: new Date(0),
    maroonPlayers: box.maroonPlayers, whitePlayers: box.whitePlayers, state: "Live", started: true,
  };
  const result = matchBoxResult(snapshot, matchBox);
  const thru = matchBoxStartedThru(snapshot, matchBox);
  const mathematicallyComplete = result.margin > result.holesRemaining || thru === 18;
  return {
    leader: result.leader,
    margin: result.margin,
    thru: mathematicallyComplete ? 18 - result.holesRemaining : thru,
    mathematicallyComplete,
  };
}
