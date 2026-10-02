import { bestBall, contest, fixedTeams, type HoleResult, type MatchResult, type Scorer } from "./types";

export const scoreMatchPlay: Scorer = (setup, input, scores) => {
  const sides = fixedTeams(setup);
  return contest(input, sides, bestBall(sides, scores));
};

/** Replay in hole order and stop at mathematical completion. Corrections replay from scratch. */
export function calculateMatch(holes: HoleResult[], scheduledHoles: number): { result: MatchResult; counted: HoleResult[] } {
  let lead = 0;
  const counted: HoleResult[] = [];
  for (const hole of [...holes].sort((a, b) => a.hole - b.hole)) {
    if (Math.abs(lead) > scheduledHoles - counted.length) break;
    counted.push(hole);
    lead += hole.winner === 0 ? 1 : hole.winner === 1 ? -1 : 0;
  }
  const holesRemaining = scheduledHoles - counted.length;
  const complete = holesRemaining === 0 || Math.abs(lead) > holesRemaining;
  return { counted, result: {
    status: complete ? "complete" : "in-progress", lead, holesRemaining,
    state: lead === 0 ? complete ? "Tied" : "All Square" : `Team ${lead > 0 ? 1 : 2}: ${Math.abs(lead)} Up / Team ${lead > 0 ? 2 : 1}: ${Math.abs(lead)} Down`,
    winner: complete && lead !== 0 ? lead > 0 ? 0 : 1 : undefined,
  } };
}
