import { scoringConfig, scoreBonus } from "./scoringConfig";
import type { Scorer } from "./types";
export const scoreSkins: Scorer = (setup, input, scores) => {
  const low = Math.min(...Object.values(scores));
  const winners = setup.participants.filter(id => scores[id] === low);
  const c = scoringConfig(setup, "skins");
  return { roundId: input.roundId, hole: input.hole, status: winners.length === 1 ? "scored" : "halved", points: winners.length === 1 ? { [winners[0]]: c.skinValue + scoreBonus(input, winners, c.birdieBonus, c.eagleBonus) } : {} };
};

export { DEFAULT_SKINS_SCORING, type SkinsScoringConfig } from "./scoringConfig";
