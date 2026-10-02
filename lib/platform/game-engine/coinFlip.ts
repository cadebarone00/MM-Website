import { scoringConfig } from "./scoringConfig";
import { bestBall, contest, type Scorer } from "./types";

export const scoreCoinFlip: Scorer = (setup, input, scores) => {
  if (setup.participants.some(id => input.flips?.[id] !== "heads" && input.flips?.[id] !== "tails")) throw new Error("Assign Heads or Tails to every player.");
  const sides: [string[], string[]] = [setup.participants.filter(id => input.flips![id] === "heads"), setup.participants.filter(id => input.flips![id] === "tails")];
  if (sides.some(side => side.length === 0)) return { roundId: input.roundId, hole: input.hole, status: "no-split", sides, points: {} };
  const result = contest(input, sides, bestBall(sides, scores));
  const c = scoringConfig(setup, "coin-flip");
  if (result.winner === undefined) { if (c.tie) for (const id of setup.participants) result.points[id] = c.tie; }
  else for (const id of sides[result.winner]) result.points[id] = sides[1 - result.winner].length * c.opponentPoints * (sides[result.winner].length === 1 ? c.soloMultiplier : 1);
  return result;
};

export { DEFAULT_COIN_FLIP_SCORING, type CoinFlipScoringConfig } from "./scoringConfig";
