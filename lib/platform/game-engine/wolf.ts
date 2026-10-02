import { scoringConfig, scoreBonus } from "./scoringConfig";
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
  const c = scoringConfig(setup, "wolf");
  if (choice.kind === "blind" && !c.blindEnabled) throw new Error("Blind Wolf is disabled.");
  const solo = choice.kind !== "partner";
  const side = choice.kind === "partner" ? [wolf, choice.partner] : [wolf];
  const sides: [string[], string[]] = [side, setup.participants.filter(id => !side.includes(id))];
  const result = contest(input, sides, bestBall(sides, scores));
  result.wolf = wolf;
  if (result.winner === undefined) { if (c.tie) for (const id of setup.participants) result.points[id] = c.tie; }
  else for (const id of sides[result.winner]) result.points[id] = (solo ? result.winner === 0 ? choice.kind === "blind" ? c.blindWin : c.loneWin * c.loneMultiplier : c.loneLoss : c.partnerWin) + scoreBonus(input, [id], c.birdieBonus, c.eagleBonus);
  return result;
};

export { DEFAULT_WOLF_SCORING, type WolfScoringConfig } from "./scoringConfig";
