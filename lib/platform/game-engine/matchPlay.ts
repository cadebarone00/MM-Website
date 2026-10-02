import { scoringConfig } from "./scoringConfig";
import { bestBall, contest, fixedTeams, type HoleResult, type MatchResult, type Scorer } from "./types";

export const scoreMatchPlay: Scorer = (setup, input, scores) => {
  const sides = fixedTeams(setup);
  const result = contest(input, sides, bestBall(sides, scores));
  const c = scoringConfig(setup, "match-play");
  result.points = { "team-1": result.winner === undefined ? c.holeTie : result.winner === 0 ? c.holeWin : 0, "team-2": result.winner === undefined ? c.holeTie : result.winner === 1 ? c.holeWin : 0 };
  result.points = Object.fromEntries(Object.entries(result.points).filter(([, points]) => points !== 0));
  return result;
};

/** Replay in hole order and stop at mathematical completion. Corrections replay from scratch. */
export function calculateMatch(holes: HoleResult[], scheduledHoles: number, playoff = false): { result: MatchResult; counted: HoleResult[] } {
  let lead = 0;
  const counted: HoleResult[] = [];
  for (const hole of [...holes].sort((a, b) => a.hole - b.hole)) {
    if (counted.length >= scheduledHoles ? lead !== 0 || !playoff : Math.abs(lead) > scheduledHoles - counted.length) break;
    counted.push(hole);
    lead += hole.winner === 0 ? 1 : hole.winner === 1 ? -1 : 0;
  }
  const holesRemaining = Math.max(0, scheduledHoles - counted.length);
  const complete = (holesRemaining === 0 && (!playoff || lead !== 0)) || Math.abs(lead) > holesRemaining;
  return { counted, result: {
    status: complete ? "complete" : "in-progress", lead, holesRemaining,
    state: lead === 0 ? complete ? "Tied" : holesRemaining === 0 ? "Playoff · All Square" : "All Square" : `Team ${lead > 0 ? 1 : 2}: ${Math.abs(lead)} Up / Team ${lead > 0 ? 2 : 1}: ${Math.abs(lead)} Down`,
    winner: complete && lead !== 0 ? lead > 0 ? 0 : 1 : undefined,
  } };
}

export { DEFAULT_MATCH_PLAY_SCORING, type MatchPlayScoringConfig } from "./scoringConfig";
