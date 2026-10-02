import { bestBall, contest, type GameSetup, type Scorer } from "./types";

export function sixesPairing(setup: GameSetup, hole: number): [string[], string[]] {
  const [a, b, c, d] = setup.participants;
  return hole <= 6 ? [[a, b], [c, d]] : hole <= 12 ? [[a, c], [b, d]] : [[a, d], [b, c]];
}
export const scoreSixes: Scorer = (setup, input, scores) => {
  const sides = sixesPairing(setup, input.hole);
  return { ...contest(input, sides, bestBall(sides, scores)), segment: Math.ceil(input.hole / 6) };
};
