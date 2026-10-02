import { scoringConfig } from "./scoringConfig";
import type { Scorer } from "./types";

export const scoreNinePoint: Scorer = (setup, input, scores) => {
  const order = [...setup.participants].sort((a, b) => scores[a] - scores[b]);
  const lowTie = scores[order[0]] === scores[order[1]];
  const highTie = scores[order[1]] === scores[order[2]];
  const c = scoringConfig(setup, "9-point");
  const allocation = lowTie && highTie ? [c.allTie1,c.allTie2,c.allTie3] : lowTie ? [c.lowTie1,c.lowTie2,c.lowTie3] : highTie ? [c.highTie1,c.highTie2,c.highTie3] : [c.different1,c.different2,c.different3];
  return { roundId: input.roundId, hole: input.hole, status: "scored", points: Object.fromEntries(order.map((id, index) => [id, allocation[index]])) };
};

export { DEFAULT_NINE_POINT_SCORING, type NinePointScoringConfig } from "./scoringConfig";
