export type GameScope = "tournament" | "round";
export type GroupSize = 1 | 2 | 3 | 4 | 5;
export type GameId = "match-play" | "9-point" | "wolf" | "vegas" | "coin-flip" | "round-robin";
export interface SideGameDefinition {
  id: GameId;
  name: string;
  supportedGroupSizes: readonly GroupSize[];
  supportedScopes: readonly GameScope[];
  description: string;
  supportsHandicap: boolean;
  gameType: "individual" | "rotating" | "teams";
  futureConfig: readonly string[];
  scoringStatus: "preview-only";
}

const define = (game: Omit<SideGameDefinition, "supportedScopes" | "supportsHandicap" | "scoringStatus">): SideGameDefinition => ({
  ...game, supportedScopes: ["tournament", "round"], supportsHandicap: true, scoringStatus: "preview-only",
});

export const SIDE_GAME_REGISTRY: readonly SideGameDefinition[] = [
  define({ id: "match-play", name: "Match Play", supportedGroupSizes: [1, 2, 4], description: "Go head to head, one hole at a time.", gameType: "individual", futureConfig: ["handicap", "pairings"] }),
  define({ id: "9-point", name: "9 Point", supportedGroupSizes: [3], description: "Three players share nine points on every hole.", gameType: "individual", futureConfig: ["ties", "point-allocation"] }),
  define({ id: "wolf", name: "Wolf", supportedGroupSizes: [3, 4, 5], description: "Take turns as the Wolf. Pick a partner or go alone.", gameType: "rotating", futureConfig: ["rotation", "lone-wolf", "points"] }),
  define({ id: "vegas", name: "Vegas", supportedGroupSizes: [4], description: "Two teams of two combine their scores into a Vegas number.", gameType: "teams", futureConfig: ["team-assignment", "score-order"] }),
  define({ id: "coin-flip", name: "Coin Flip", supportedGroupSizes: [4, 5], description: "Let a future coin flip shake up the partners.", gameType: "rotating", futureConfig: ["partner-method", "odd-player"] }),
  define({ id: "round-robin", name: "Round Robin", supportedGroupSizes: [3, 4, 5], description: "Mix it up with rotating partners and opponents.", gameType: "rotating", futureConfig: ["rotation", "segments"] }),
];

export function recommendedGames(size: GroupSize, scope: GameScope) {
  return SIDE_GAME_REGISTRY.filter(game => game.supportedGroupSizes.includes(size) && game.supportedScopes.includes(scope));
}

// Fictional fixtures only. Side-game state never reads or writes Competition.
export const GAME_PREVIEW_PLAYERS = [
  { id: "you", name: "Alex Morgan (you)", group: "Your group" },
  { id: "sam", name: "Sam Parker", group: "Your group" },
  { id: "jordan", name: "Jordan Reed", group: "Your group" },
  { id: "casey", name: "Casey Brooks", group: "Your group" },
  { id: "riley", name: "Riley Quinn", group: "Another group" },
  { id: "avery", name: "Avery Lane", group: "Another group" },
  { id: "taylor", name: "Taylor Ellis", group: "Another group" },
  { id: "jamie", name: "Jamie Rowan", group: "Another group" },
] as const;
export const GAME_PREVIEW_ROUNDS = [
  { id: "round-1", number: 1, course: "Maroon Pines", date: "Apr 16, 2027" },
  { id: "round-2", number: 2, course: "Gold Dunes", date: "Apr 17, 2027" },
  { id: "round-3", number: 3, course: "Weekend Links", date: "Apr 18, 2027" },
] as const;
