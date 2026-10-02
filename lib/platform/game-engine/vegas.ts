import { scoringConfig, scoreBonus } from "./scoringConfig";
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
  const c = scoringConfig(setup, "vegas");
  const flip = sides.map(side => scoreBonus(input, side, c.birdieFlip ? 1 : 0, c.eagleFlip ? 1 : 0) > 0);
  for (let side = 0; side < 2; side++) if (flip[1 - side] && !flip[side]) numbers[side] = Number([...sides[side].map(id => scores[id])].sort((a,b) => b-a).join(""));
  const result = contest(input, sides, numbers);
  const difference = Math.min(Math.abs(numbers[1] - numbers[0]) * c.multiplier, c.capEnabled ? c.cap : Infinity);
  result.points = { "team-1": result.winner === 0 ? difference : result.winner === 1 && c.negativePoints ? -difference : 0, "team-2": result.winner === 1 ? difference : result.winner === 0 && c.negativePoints ? -difference : 0 };
  return result;
};

export { DEFAULT_VEGAS_SCORING, type VegasScoringConfig } from "./scoringConfig";
