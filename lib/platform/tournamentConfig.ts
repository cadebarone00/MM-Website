import { FORMATS, isFormatKey, matchesPerRound, teeTimesPerRound, type FormatKey } from "./formats.ts";

/**
 * Everything an organizer sets in the Create Tournament wizard
 * (THE_MAROON_PRODUCT_SPEC.md §5). This is the one shape the wizard submits
 * and the server validates before anything is written — nothing about a
 * specific tournament (team names, player count, round count) is assumed.
 */
export interface TournamentConfig {
  basics: {
    name: string;
    shortName: string;
    slug: string;
    description: string | null;
    destination: string | null;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    timezone: string; // IANA zone id
    visibility: Visibility;
  };
  branding: { primary: string; secondary: string; accent: string; logoUrl: string | null };
  /** Empty = an individual event (no teams). */
  teams: TeamConfig[];
  players: PlayerConfig[];
  rounds: RoundConfig[];
  scoring: ScoringConfig;
}

export type Visibility = "public" | "unlisted" | "private";

export interface TeamConfig {
  key: string;
  name: string;
  color: string;
  captainPlayerKey: string | null;
}

export interface PlayerConfig {
  key: string;
  name: string;
  email: string | null;
  handicap: number | null;
  teamKey: string | null;
}

export interface RoundConfig {
  day: number;
  label: string | null; // e.g. "Morning"
  format: FormatKey;
  courseId: string | null; // chosen from the course library later in setup
}

export interface ScoringConfig {
  mode: "match_play";
  pointsForWin: number;
  pointsForHalve: number;
  handicap: "gross" | "net";
  allowancePercent: number;
  allowEarlyFinish: boolean;
  allowConcessions: boolean;
  individualLeaderboard: boolean;
}

export interface ConfigError {
  field: string;
  message: string;
}

export type ValidationResult = { ok: true; config: TournamentConfig } | { ok: false; errors: ConfigError[] };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Slugs that would collide with platform routes. */
const RESERVED_SLUGS = new Set(["new", "create", "admin", "api", "portal", "settings", "the-maroon"]);
const MAX_TEAMS = 8;
const MAX_PLAYERS = 64;
const MAX_ROUNDS = 20;
const MAX_DAYS = 14;

function isRealDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed === "" ? null : trimmed;
}

type Fields = Record<string, unknown>;

/** Untrusted JSON as an object (anything else becomes empty). */
function fields(value: unknown): Fields {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : {};
}

function list(value: unknown): Fields[] {
  return Array.isArray(value) ? value.map(fields) : [];
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Validates untrusted wizard input. Returns every problem at once (the
 * wizard shows them next to the right step) or a clean, normalized config.
 */
export function validateTournamentConfig(input: unknown): ValidationResult {
  const errors: ConfigError[] = [];
  const fail = (field: string, message: string) => errors.push({ field, message });
  const raw = fields(input);

  // --- Basics ---
  const b = fields(raw.basics);
  const name = text(b.name);
  const shortName = text(b.shortName);
  const slug = text(b.slug);
  if (name.length < 1 || name.length > 80) fail("basics.name", "Tournament name must be 1-80 characters.");
  if (shortName.length < 1 || shortName.length > 24) fail("basics.shortName", "Short name must be 1-24 characters.");
  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 60) {
    fail("basics.slug", "Web address must be 3-60 lowercase letters, numbers, and dashes.");
  } else if (RESERVED_SLUGS.has(slug)) {
    fail("basics.slug", "That web address is reserved. Pick another.");
  }
  const description = optionalText(b.description);
  if (description && description.length > 2000) fail("basics.description", "Description must be 2000 characters or fewer.");
  if (!isRealDate(b.startDate)) fail("basics.startDate", "Pick a start date.");
  if (!isRealDate(b.endDate)) fail("basics.endDate", "Pick an end date.");
  if (isRealDate(b.startDate) && isRealDate(b.endDate)) {
    const days = daysBetween(b.startDate, b.endDate);
    if (days < 1) fail("basics.endDate", "End date can't be before the start date.");
    else if (days > MAX_DAYS) fail("basics.endDate", `A tournament can last at most ${MAX_DAYS} days.`);
  }
  if (!isTimezone(b.timezone)) fail("basics.timezone", "Pick a valid time zone.");
  const visibility: Visibility = b.visibility === "public" || b.visibility === "unlisted" ? b.visibility : "private";

  // --- Branding ---
  const br = fields(raw.branding);
  for (const key of ["primary", "secondary", "accent"] as const) {
    const color = br[key];
    if (typeof color !== "string" || !HEX.test(color)) fail(`branding.${key}`, "Colors must be hex codes like #500001.");
  }

  // --- Teams ---
  const rawTeams = list(raw.teams);
  if (rawTeams.length === 1) fail("teams", "A team event needs at least 2 teams (or 0 for an individual event).");
  if (rawTeams.length > MAX_TEAMS) fail("teams", `At most ${MAX_TEAMS} teams.`);
  const teams: TeamConfig[] = rawTeams.map((team, i) => {
    const teamName = text(team.name);
    const key = text(team.key);
    const color = text(team.color);
    if (teamName.length < 1 || teamName.length > 40) fail(`teams.${i}.name`, "Team name must be 1-40 characters.");
    if (!SLUG.test(key)) fail(`teams.${i}.key`, "Team id must be lowercase letters, numbers, and dashes.");
    if (!HEX.test(color)) fail(`teams.${i}.color`, "Team color must be a hex code like #1f4e9c.");
    return { key, name: teamName, color, captainPlayerKey: optionalText(team.captainPlayerKey) };
  });
  const teamKeys = new Set(teams.map((t) => t.key));
  if (teamKeys.size !== teams.length) fail("teams", "Every team needs its own id.");
  if (new Set(teams.map((t) => t.name.toLowerCase())).size !== teams.length) fail("teams", "Two teams can't share a name.");

  // --- Players ---
  const rawPlayers = list(raw.players);
  if (rawPlayers.length < 2) fail("players", "Add at least 2 players.");
  if (rawPlayers.length > MAX_PLAYERS) fail("players", `At most ${MAX_PLAYERS} players.`);
  const players: PlayerConfig[] = rawPlayers.map((player, i) => {
    const playerName = text(player.name);
    const key = text(player.key);
    const email = optionalText(player.email);
    const handicap = player.handicap === null || player.handicap === undefined || player.handicap === "" ? null : Number(player.handicap);
    const teamKey = optionalText(player.teamKey);
    if (playerName.length < 1 || playerName.length > 80) fail(`players.${i}.name`, "Player name must be 1-80 characters.");
    if (!SLUG.test(key)) fail(`players.${i}.key`, "Player id must be lowercase letters, numbers, and dashes.");
    if (email && !EMAIL.test(email)) fail(`players.${i}.email`, `${playerName || "Player"}'s email doesn't look right.`);
    if (handicap !== null && (!Number.isFinite(handicap) || handicap < -10 || handicap > 54)) {
      fail(`players.${i}.handicap`, "Handicap must be between -10 and 54.");
    }
    if (teams.length > 0 && (!teamKey || !teamKeys.has(teamKey))) fail(`players.${i}.teamKey`, `Put ${playerName || "this player"} on a team.`);
    if (teams.length === 0 && teamKey) fail(`players.${i}.teamKey`, "This is an individual event, so players have no team.");
    return { key, name: playerName, email, handicap, teamKey: teams.length > 0 ? teamKey : null };
  });
  if (new Set(players.map((p) => p.key)).size !== players.length) fail("players", "Every player needs their own id.");
  teams.forEach((team, i) => {
    if (team.captainPlayerKey && players.find((p) => p.key === team.captainPlayerKey)?.teamKey !== team.key) {
      fail(`teams.${i}.captainPlayerKey`, `${team.name}'s captain must be on ${team.name}.`);
    }
  });

  // --- Scoring ---
  const s = fields(raw.scoring);
  if (s.mode !== "match_play") fail("scoring.mode", "Only match play events are supported right now.");
  const pointsForWin = Number(s.pointsForWin);
  const pointsForHalve = Number(s.pointsForHalve);
  if (!(pointsForWin > 0 && pointsForWin <= 10)) fail("scoring.pointsForWin", "Points for a win must be more than 0 and at most 10.");
  if (!(pointsForHalve >= 0 && pointsForHalve <= pointsForWin)) fail("scoring.pointsForHalve", "Points for a halve must be between 0 and the points for a win.");
  const handicap = s.handicap === "net" ? "net" : "gross";
  const allowancePercent = s.allowancePercent === undefined ? 100 : Number(s.allowancePercent);
  if (!(allowancePercent >= 0 && allowancePercent <= 100)) fail("scoring.allowancePercent", "Handicap allowance must be 0-100%.");
  if (s.mode === "match_play" && teams.length !== 2) fail("teams", "Match play events need exactly 2 teams.");

  // --- Rounds ---
  const rawRounds = list(raw.rounds);
  if (rawRounds.length < 1) fail("rounds", "Add at least 1 round.");
  if (rawRounds.length > MAX_ROUNDS) fail("rounds", `At most ${MAX_ROUNDS} rounds.`);
  // Only bound round days by a date range that is itself valid, so one bad
  // date doesn't also flag every round.
  const range = isRealDate(b.startDate) && isRealDate(b.endDate) ? daysBetween(b.startDate, b.endDate) : 0;
  const days = range >= 1 && range <= MAX_DAYS ? range : MAX_DAYS;
  const smallestTeam = teams.length > 0 ? Math.min(...teams.map((t) => players.filter((p) => p.teamKey === t.key).length)) : 0;
  const rounds: RoundConfig[] = rawRounds.map((round, i) => {
    const day = Number(round.day);
    const format = round.format;
    if (!Number.isInteger(day) || day < 1 || day > days) fail(`rounds.${i}.day`, `Round ${i + 1} must be on day 1-${days}.`);
    if (!isFormatKey(format)) {
      fail(`rounds.${i}.format`, `Pick a format for round ${i + 1}.`);
    } else if (teams.length === 2 && matchesPerRound(format, smallestTeam) < 1) {
      fail(`rounds.${i}.format`, `Each team needs at least ${FORMATS[format].playersPerSide} players for ${FORMATS[format].label}.`);
    }
    return { day, label: optionalText(round.label), format: format as FormatKey, courseId: optionalText(round.courseId) };
  });

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      basics: { name, shortName, slug, description, destination: optionalText(b.destination), startDate: text(b.startDate), endDate: text(b.endDate), timezone: text(b.timezone), visibility },
      branding: { primary: text(br.primary), secondary: text(br.secondary), accent: text(br.accent), logoUrl: optionalText(br.logoUrl) },
      teams,
      players,
      rounds,
      scoring: {
        mode: "match_play",
        pointsForWin,
        pointsForHalve,
        handicap,
        allowancePercent,
        allowEarlyFinish: s.allowEarlyFinish !== false,
        allowConcessions: s.allowConcessions === true,
        individualLeaderboard: s.individualLeaderboard !== false,
      },
    },
  };
}

export interface StructureSummary {
  rounds: { day: number; label: string | null; format: FormatKey; matches: number; teeTimes: number; points: number }[];
  pointsAvailable: number;
  /** Strictly more than half: 33 available -> 17, 28 -> 14.5. */
  pointsToWin: number;
}

/** What the Review step shows: matches, tee times, and points each round produces. */
export function summarizeStructure(config: TournamentConfig): StructureSummary {
  const smallestTeam = Math.min(...config.teams.map((t) => config.players.filter((p) => p.teamKey === t.key).length));
  const rounds = config.rounds.map((round) => {
    const matches = matchesPerRound(round.format, smallestTeam);
    return {
      day: round.day,
      label: round.label,
      format: round.format,
      matches,
      teeTimes: teeTimesPerRound(round.format, smallestTeam),
      points: matches * config.scoring.pointsForWin,
    };
  });
  const pointsAvailable = rounds.reduce((sum, round) => sum + round.points, 0);
  const half = pointsAvailable / 2;
  const step = config.scoring.pointsForHalve > 0 && config.scoring.pointsForHalve < config.scoring.pointsForWin ? config.scoring.pointsForHalve : config.scoring.pointsForWin;
  return { rounds, pointsAvailable, pointsToWin: Math.floor(half / step) * step + step };
}
