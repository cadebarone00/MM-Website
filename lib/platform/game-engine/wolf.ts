import { bestBall, contest, type GameSetup, type Scorer } from "./types";

export function wolfForHole(setup: GameSetup, hole: number): string {
  const rotation = setup.rotation ?? setup.participants;
  return rotation[(hole - 1) % rotation.length];
}
export const scoreWolf: Scorer = (setup, input, scores) => {
  const wolf = wolfForHole(setup, input.hole);
  const choice = input.wolfChoice;
  if (!choice) throw new Error("Choose a Wolf partner or Lone Wolf.");
  if (choice.kind === "partner" && (!setup.participants.includes(choice.partner) || choice.partner === wolf)) throw new Error("Wolf partner must be another participant.");
  const side = choice.kind === "lone" ? [wolf] : [wolf, choice.partner];
  const sides: [string[], string[]] = [side, setup.participants.filter(id => !side.includes(id))];
  const result = contest(input, sides, bestBall(sides, scores));
  result.wolf = wolf;
  if (result.winner !== undefined) for (const id of sides[result.winner]) result.points[id] = choice.kind === "lone" && result.winner === 0 ? setup.loneWolfMultiplier ?? 2 : 1;
  return result;
};
