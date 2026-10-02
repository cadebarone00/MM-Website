import { contest, fixedTeams, type Scorer } from "./types";

/** Literal concatenation also supports scores of 10+: 4 and 10 becomes 410.
 * Negative net scores have no decimal concatenation interpretation and are rejected. */
export function vegasNumber(scores: number[]): number {
  if (scores.length !== 2 || scores.some(score => !Number.isInteger(score) || score < 0)) throw new Error("Vegas requires two nonnegative integer scores.");
  const [low, high] = [...scores].sort((a, b) => a - b);
  const result = Number(`${low}${high}`);
  if (!Number.isSafeInteger(result)) throw new Error("Vegas number exceeds the safe integer range.");
  return result;
}
export const scoreVegas: Scorer = (setup, input, scores) => {
  const sides = fixedTeams(setup);
  const numbers = sides.map(side => vegasNumber(side.map(id => scores[id]))) as [number, number];
  const result = contest(input, sides, numbers);
  result.points = { "team-1": result.winner === 0 ? numbers[1] - numbers[0] : 0, "team-2": result.winner === 1 ? numbers[0] - numbers[1] : 0 };
  return result;
};
