import type { GameSetup, HoleInput } from "./types";

/** Standard values preserve the existing v1 engines; points have no monetary value. */
export const DEFAULT_SCORING = {
  "match-play": { holeWin: 0, holeTie: 0, matchWin: 1, matchTie: 0.5, handicap: false, playoff: false },
  "9-point": { different1: 5, different2: 3, different3: 1, lowTie1: 4, lowTie2: 4, lowTie3: 1, highTie1: 5, highTie2: 2, highTie3: 2, allTie1: 3, allTie2: 3, allTie3: 3, handicap: false },
  wolf: { partnerWin: 1, loneWin: 1, loneLoss: 1, tie: 0, loneMultiplier: 2, blindEnabled: false, blindWin: 4, birdieBonus: 0, eagleBonus: 0, carryover: false, handicap: false },
  vegas: { multiplier: 1, capEnabled: false, cap: 100, birdieFlip: false, eagleFlip: false, handicap: false, negativePoints: false },
  "round-robin": { holeWin: 0, holeTie: 0, segmentWin: 1, segmentTie: 0, roundBonus: 0, handicap: false },
  "coin-flip": { opponentPoints: 1, soloMultiplier: 1, tie: 0, noSplit: "none" as "none" | "carryover", handicap: false },
  skins: { skinValue: 1, carryover: true, birdieBonus: 0, eagleBonus: 0, handicap: false },
};
export type ScoringGameId = keyof typeof DEFAULT_SCORING;
export type ScoringConfigMap = typeof DEFAULT_SCORING;
export type MatchPlayScoringConfig = ScoringConfigMap["match-play"];
export type NinePointScoringConfig = ScoringConfigMap["9-point"];
export type WolfScoringConfig = ScoringConfigMap["wolf"];
export type VegasScoringConfig = ScoringConfigMap["vegas"];
export type SixesScoringConfig = ScoringConfigMap["round-robin"];
export type CoinFlipScoringConfig = ScoringConfigMap["coin-flip"];
export type SkinsScoringConfig = ScoringConfigMap["skins"];
export type ScoringSettings = { [K in ScoringGameId]: { game: K; values: ScoringConfigMap[K] } }[ScoringGameId];
export function scoringConfig<K extends ScoringGameId>(setup: GameSetup, id: K): ScoringConfigMap[K] {
  if (setup.scoring && setup.scoring.game !== setup.id) throw new Error("Scoring config must match the game.");
  return (setup.scoring?.game === id ? setup.scoring.values : {
    ...DEFAULT_SCORING[id], handicap: setup.handicap,
    ...(id === "wolf" && setup.loneWolfMultiplier !== undefined ? { loneMultiplier: setup.loneWolfMultiplier } : {}),
  }) as ScoringConfigMap[K];
}
export function validateScoring(settings: ScoringSettings): void {
  const defaults: Record<string, number | boolean | string> = DEFAULT_SCORING[settings.game];
  for (const [key, expected] of Object.entries(defaults)) {
    const value = (settings.values as Record<string, number | boolean | string>)[key];
    if (typeof value !== typeof expected) throw new Error(`Invalid scoring option: ${key}`);
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > 10000)) throw new Error(`${key} must be between 0 and 10000.`);
  }
  if (settings.game === "coin-flip" && !["none", "carryover"].includes(settings.values.noSplit)) throw new Error("Invalid no-split behavior.");
}
export function ninePointWarnings(config: NinePointScoringConfig): string[] {
  return ["different", "lowTie", "highTie", "allTie"].flatMap(prefix => {
    const total = [1, 2, 3].reduce((sum, rank) => sum + (config[`${prefix}${rank}` as keyof NinePointScoringConfig] as number), 0);
    return total === 9 ? [] : [`${prefix}: allocation totals ${total}, rather than 9.`];
  });
}
/** Bonuses and flips use gross score against explicit par, independent of handicap. */
export function scoreBonus(input: HoleInput, ids: string[], birdie: number, eagle: number): number {
  if (!birdie && !eagle) return 0;
  if (input.par === undefined) return 0;
  if (ids.some(id => !Number.isSafeInteger(input.scores[id]?.gross) || input.scores[id].gross < 1 || input.scores[id].gross > 99)) throw new Error("Provide gross scores for birdie/eagle bonuses or flips.");
  const best = Math.min(...ids.map(id => input.scores[id].gross));
  return best <= input.par - 2 ? eagle : best === input.par - 1 ? birdie : 0;
}
export function needsGrossScores(setup: GameSetup): boolean {
  if (setup.id === "vegas") { const c = scoringConfig(setup, "vegas"); return c.birdieFlip || c.eagleFlip; }
  if (setup.id === "wolf" || setup.id === "skins") { const c = scoringConfig(setup, setup.id); return c.birdieBonus > 0 || c.eagleBonus > 0; }
  return false;
}
export interface GameSettingsState { status: "scheduled" | "started"; preset: "standard" | "custom"; scoring: ScoringSettings }
export function initialGameSettings(game: ScoringGameId): GameSettingsState {
  return { status: "scheduled", preset: "standard", scoring: { game, values: { ...DEFAULT_SCORING[game] } } as ScoringSettings };
}
export function editGameSettings(state: GameSettingsState, preset: GameSettingsState["preset"], scoring = state.scoring): GameSettingsState {
  if (state.status === "started") return state;
  if (scoring.game !== state.scoring.game) throw new Error("Cannot change game type.");
  validateScoring(scoring);
  return { ...state, preset, scoring: preset === "standard" ? initialGameSettings(scoring.game).scoring : scoring };
}
export function startGameSettings(state: GameSettingsState): GameSettingsState { return { ...state, status: "started" }; }

export const DEFAULT_MATCH_PLAY_SCORING = DEFAULT_SCORING["match-play"];

export const DEFAULT_NINE_POINT_SCORING = DEFAULT_SCORING["9-point"];

export const DEFAULT_WOLF_SCORING = DEFAULT_SCORING["wolf"];

export const DEFAULT_VEGAS_SCORING = DEFAULT_SCORING["vegas"];

export const DEFAULT_SIXES_SCORING = DEFAULT_SCORING["round-robin"];

export const DEFAULT_COIN_FLIP_SCORING = DEFAULT_SCORING["coin-flip"];

export const DEFAULT_SKINS_SCORING = DEFAULT_SCORING["skins"];
