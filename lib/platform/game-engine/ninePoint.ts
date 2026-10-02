import type { Scorer } from "./types";

export const scoreNinePoint: Scorer = (setup, input, scores) => {
  const order = [...setup.participants].sort((a, b) => scores[a] - scores[b]);
  const lowTie = scores[order[0]] === scores[order[1]];
  const highTie = scores[order[1]] === scores[order[2]];
  const allocation = lowTie && highTie ? [3, 3, 3] : lowTie ? [4, 4, 1] : highTie ? [5, 2, 2] : [5, 3, 1];
  return { roundId: input.roundId, hole: input.hole, status: "scored", points: Object.fromEntries(order.map((id, index) => [id, allocation[index]])) };
};
