export type ScoringMethod = "match_play" | "stroke_play" | "stableford" | "quota" | "skins";
export type TeamStructure = "individual" | "pair" | "team";
export type LayoutTemplate = "versus_match" | "stroke_leaderboard" | "points_leaderboard";
export type GolfSlideKey = "Match" | "Leaderboard" | "Overview" | "Skins";

/**
 * Match formats the platform and golf trips can run. Formats are business logic, so they
 * live here in code; a tournament or golf trip only chooses which ones it uses.
 *
 * Tournament keys match the existing live engine's MatchFormat values exactly (Singles, Fourball, Foursome),
 * while GolfFormatKey extends the system with formats for golf trips.
 */
export interface FormatDefinition {
  key: GolfFormatKey;
  label: string;
  description: string;
  /** Golfers on each side of one match (1 = singles, 2 = pairs, 4 = four-person team). */
  playersPerSide: number;
  /** False for team-ball formats: the round never counts toward a player's own stats or handicap. */
  countsIndividualStats: boolean;
  /** How this format is scored. */
  scoringMethod: ScoringMethod;
  /** Individual players, 2-golfer pairs, or multi-player teams. */
  teamStructure: TeamStructure;
  /** Presentation template the match/leaderboard UI renders. */
  layoutTemplate: LayoutTemplate;
  /** Default primary slide tab when viewing this format. */
  defaultSlide: GolfSlideKey;
  /** Slides enabled for this format. */
  supportedSlides: readonly GolfSlideKey[];
}

/** The 3 match play formats supported by the tournament engine. */
export type TournamentFormatKey = "Singles" | "Fourball" | "Foursome";
export type FormatKey = TournamentFormatKey;

/** All golf formats available across trips and tournaments. */
export type GolfFormatKey =
  | TournamentFormatKey
  | "SinglesStroke"
  | "Scramble"
  | "Shamble"
  | "BestBall"
  | "Stableford"
  | "Custom";

/** Golfers who go off one tee time together. */
export const GROUP_SIZE = 4;

export const FORMATS: Record<GolfFormatKey, FormatDefinition> = {
  Singles: {
    key: "Singles",
    label: "Singles Match Play",
    description: "One golfer against one golfer in hole-by-hole match play.",
    playersPerSide: 1,
    countsIndividualStats: true,
    scoringMethod: "match_play",
    teamStructure: "individual",
    layoutTemplate: "versus_match",
    defaultSlide: "Match",
    supportedSlides: ["Match", "Leaderboard", "Overview"],
  },
  Fourball: {
    key: "Fourball",
    label: "Fourball",
    description: "Pairs, each golfer plays their own ball; the better score counts.",
    playersPerSide: 2,
    countsIndividualStats: true,
    scoringMethod: "match_play",
    teamStructure: "pair",
    layoutTemplate: "versus_match",
    defaultSlide: "Match",
    supportedSlides: ["Match", "Leaderboard", "Overview"],
  },
  Foursome: {
    key: "Foursome",
    label: "Alternate Shot",
    description: "Pairs share one ball and take turns hitting it.",
    playersPerSide: 2,
    countsIndividualStats: false,
    scoringMethod: "match_play",
    teamStructure: "pair",
    layoutTemplate: "versus_match",
    defaultSlide: "Match",
    supportedSlides: ["Match", "Leaderboard", "Overview"],
  },
  SinglesStroke: {
    key: "SinglesStroke",
    label: "Singles Stroke Play",
    description: "Individual stroke play against the field.",
    playersPerSide: 1,
    countsIndividualStats: true,
    scoringMethod: "stroke_play",
    teamStructure: "individual",
    layoutTemplate: "stroke_leaderboard",
    defaultSlide: "Leaderboard",
    supportedSlides: ["Leaderboard", "Overview"],
  },
  Scramble: {
    key: "Scramble",
    label: "Scramble",
    description: "Teams hit from the best shot on every stroke until holed out.",
    playersPerSide: 4,
    countsIndividualStats: false,
    scoringMethod: "stroke_play",
    teamStructure: "team",
    layoutTemplate: "stroke_leaderboard",
    defaultSlide: "Leaderboard",
    supportedSlides: ["Leaderboard", "Match", "Overview"],
  },
  Shamble: {
    key: "Shamble",
    label: "Shamble",
    description: "Teams pick the best tee shot, then each golfer plays their own ball into the hole.",
    playersPerSide: 4,
    countsIndividualStats: true,
    scoringMethod: "stroke_play",
    teamStructure: "team",
    layoutTemplate: "stroke_leaderboard",
    defaultSlide: "Leaderboard",
    supportedSlides: ["Leaderboard", "Overview"],
  },
  BestBall: {
    key: "BestBall",
    label: "Best Ball",
    description: "Each golfer plays their own ball; the lowest score in the group or pair counts.",
    playersPerSide: 2,
    countsIndividualStats: true,
    scoringMethod: "stroke_play",
    teamStructure: "pair",
    layoutTemplate: "stroke_leaderboard",
    defaultSlide: "Leaderboard",
    supportedSlides: ["Leaderboard", "Match", "Overview"],
  },
  Stableford: {
    key: "Stableford",
    label: "Stableford",
    description: "Points scored per hole based on strokes relative to par (e.g., Eagle 5, Birdie 3, Par 2, Bogey 1).",
    playersPerSide: 1,
    countsIndividualStats: true,
    scoringMethod: "stableford",
    teamStructure: "individual",
    layoutTemplate: "points_leaderboard",
    defaultSlide: "Leaderboard",
    supportedSlides: ["Leaderboard", "Overview"],
  },
  Custom: {
    key: "Custom",
    label: "Custom Format",
    description: "Customized golf format and scoring rules.",
    playersPerSide: 1,
    countsIndividualStats: true,
    scoringMethod: "stroke_play",
    teamStructure: "individual",
    layoutTemplate: "stroke_leaderboard",
    defaultSlide: "Leaderboard",
    supportedSlides: ["Leaderboard", "Match", "Overview"],
  },
};

export const TOURNAMENT_FORMAT_KEYS: readonly TournamentFormatKey[] = ["Singles", "Fourball", "Foursome"] as const;
export const FORMAT_KEYS = TOURNAMENT_FORMAT_KEYS;
export const GOLF_FORMAT_KEYS = Object.keys(FORMATS) as GolfFormatKey[];

export function isFormatKey(value: unknown): value is FormatKey {
  return typeof value === "string" && (TOURNAMENT_FORMAT_KEYS as readonly string[]).includes(value);
}

export function isGolfFormatKey(value: unknown): value is GolfFormatKey {
  return typeof value === "string" && Object.hasOwn(FORMATS, value);
}

/** Resolves any format key or colloquial string (e.g. "Singles Match Play", "Alternate Shot") into its FormatDefinition. */
export function resolveGolfFormat(value: unknown): FormatDefinition {
  if (typeof value === "string") {
    if (isGolfFormatKey(value)) return FORMATS[value];
    const normalized = value.trim().toLowerCase();
    if (normalized.includes("stableford")) return FORMATS.Stableford;
    if (normalized.includes("scramble")) return FORMATS.Scramble;
    if (normalized.includes("shamble")) return FORMATS.Shamble;
    if (normalized.includes("best ball") || normalized.includes("better ball")) return FORMATS.BestBall;
    if (normalized.includes("alternate") || normalized.includes("foursome")) return FORMATS.Foursome;
    if (normalized.includes("fourball") || normalized.includes("four-ball")) return FORMATS.Fourball;
    if (normalized.includes("stroke")) return FORMATS.SinglesStroke;
    if (normalized.includes("singles") || normalized.includes("match play")) return FORMATS.Singles;
  }
  return FORMATS.Singles;
}

/**
 * Matches one round can hold when two teams play each other: the smaller
 * team's size divided by golfers per side. For The Maroon's 6-a-side
 * teams this is Singles 6, Fourball/Foursome 3 — the same numbers
 * lib/live/orchestration.ts hard-codes today.
 */
export function matchesPerRound(format: GolfFormatKey, smallerTeamSize: number): number {
  if (!Number.isInteger(smallerTeamSize) || smallerTeamSize < 0) return 0;
  const def = FORMATS[format] ?? FORMATS.Singles;
  return Math.floor(smallerTeamSize / Math.max(1, def.playersPerSide));
}

/** How many matches go off one tee time (Singles pairs up, 2 matches per group of 4). */
export function matchesPerTeeTime(format: GolfFormatKey): number {
  const def = FORMATS[format] ?? FORMATS.Singles;
  return Math.max(1, Math.floor(GROUP_SIZE / (2 * Math.max(1, def.playersPerSide))));
}

/** Tee times a round needs: The Maroon's 3 for every format, 4 for a 16-player event. */
export function teeTimesPerRound(format: GolfFormatKey, smallerTeamSize: number): number {
  return Math.ceil(matchesPerRound(format, smallerTeamSize) / matchesPerTeeTime(format));
}
