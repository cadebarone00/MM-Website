import { scoringConfig } from "./scoringConfig";
import { bestBall, contest, type GameSetup, type Scorer } from "./types";

export function sixesPairing(setup: GameSetup, hole: number): [string[], string[]] {
  const [a, b, c, d] = setup.participants;
  return hole <= 6 ? [[a, b], [c, d]] : hole <= 12 ? [[a, c], [b, d]] : [[a, d], [b, c]];
}
export const scoreSixes: Scorer = (setup, input, scores) => {
  const sides = sixesPairing(setup, input.hole);
  const result = { ...contest(input, sides, bestBall(sides, scores)), segment: Math.ceil(input.hole / 6) };
  const c = scoringConfig(setup, "round-robin");
  for (const [side, ids] of sides.entries()) for (const id of ids) result.points[id] = result.winner === undefined ? c.holeTie : result.winner === side ? c.holeWin : 0;
  result.points = Object.fromEntries(Object.entries(result.points).filter(([, points]) => points !== 0));
  return result;
};

export { DEFAULT_SIXES_SCORING, type SixesScoringConfig } from "./scoringConfig";
