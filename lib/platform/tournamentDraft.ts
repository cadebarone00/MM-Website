import { isTimezone, normalizeScoring, tournamentSlugError, type ConfigError, type TournamentConfig } from "./tournamentConfig.ts";
import { assessReadiness, type SectionStatus } from "./readiness.ts";
import { DEFAULT_SITE, type TournamentSetup } from "./setup.ts";

/** Starting team colors, so a new team is never shown as The Maroon's maroon. Organizers change them later. */
export const TEAM_COLORS = ["#1f4e9c", "#b8860b", "#2e6b4f", "#8b1e3f", "#4b3f72", "#c2571a", "#256d85", "#5b5b5b"];

export { suggestTournamentSlug } from "./tournamentConfig.ts";
import { isFormatKey } from "./formats.ts";

/** Local planning data only. This deliberately cannot be passed as a ready-to-play config. */
export interface TournamentDraft {
  schemaVersion: 1;
  status: "draft";
  /** The edition year. Dates are optional at creation; the year is not. */
  seasonYear: number;
  /** startDate/endDate are "" until the organizer decides them. */
  basics: TournamentConfig["basics"];
  competitionType: "individual" | "teams";
  expectedPlayerCount: number;
  teams: Array<Omit<TournamentConfig["teams"][number], "color"> & { color: string | null }>;
  players: TournamentConfig["players"];
  rounds: Array<Omit<TournamentConfig["rounds"][number], "format" | "day"> & {
    format: TournamentConfig["rounds"][number]["format"] | null;
    day: number | null;
  }>;
  scoring: { mode: TournamentConfig["scoring"]["mode"] | null; rules: TournamentConfig["scoring"] | null };
  branding: TournamentConfig["branding"] | null;
}

export interface DraftInput {
  name: string;
  /** Web address: /t/<slug>/<seasonYear>. */
  slug: string;
  seasonYear: number;
  /** Optional at creation: "" means not decided yet. */
  startDate: string;
  endDate: string;
  timezone: string;
  visibility: TournamentConfig["basics"]["visibility"];
  competitionType: "individual" | "teams";
  expectedPlayerCount: number;
  teamNames: string[];
  roundCount: number;
  scoringMode: "match_play" | "tbd";
  formats: Array<TournamentDraft["rounds"][number]["format"]>;
  branding: TournamentConfig["branding"] | null;
}

export const INITIAL_DRAFT_INPUT: DraftInput = {
  name: "", slug: "", seasonYear: new Date().getFullYear(), startDate: "", endDate: "", timezone: "America/Chicago", visibility: "private",
  competitionType: "individual", expectedPlayerCount: 12, teamNames: ["", ""],
  roundCount: 3, scoringMode: "tbd", formats: [null, null, null], branding: null,
};

function realDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateDraftInput(input: DraftInput): ConfigError[] {
  const errors: ConfigError[] = [];
  const fail = (field: string, message: string) => errors.push({ field, message });
  if (!input.name.trim() || input.name.trim().length > 80) fail("name", "Enter a tournament name (1–80 characters).");
  const slugError = tournamentSlugError(input.slug.trim());
  if (slugError) fail("slug", slugError);
  if (!Number.isInteger(input.seasonYear) || input.seasonYear < 2000 || input.seasonYear > 2200) fail("seasonYear", "Choose the tournament year.");
  // Dates can wait, but if either is given both must be real.
  const datesGiven = input.startDate !== "" || input.endDate !== "";
  if (datesGiven && !realDate(input.startDate)) fail("startDate", "Choose a valid start date, or leave both dates blank for now.");
  if (datesGiven && !realDate(input.endDate)) fail("endDate", "Choose a valid end date, or leave both dates blank for now.");
  if (realDate(input.startDate) && Number(input.startDate.slice(0, 4)) !== input.seasonYear) fail("seasonYear", "The year must match the start date.");
  if (realDate(input.startDate) && realDate(input.endDate)) {
    const days = (Date.parse(input.endDate) - Date.parse(input.startDate)) / 86400000 + 1;
    if (days < 1 || days > 14) fail("endDate", "End date must be on or after the start, within 14 days.");
  }
  if (!isTimezone(input.timezone.trim())) fail("timezone", "Enter a valid IANA timezone, such as America/Chicago.");
  if (!["private", "unlisted", "public"].includes(input.visibility)) fail("visibility", "Choose a privacy setting.");
  if (!["individual", "teams"].includes(input.competitionType)) fail("competitionType", "Choose a competition type.");
  if (!Number.isInteger(input.expectedPlayerCount) || input.expectedPlayerCount < 2 || input.expectedPlayerCount > 64) fail("expectedPlayerCount", "Plan for 2–64 players. Names can wait.");
  if (input.competitionType === "teams") {
    if (input.teamNames.length < 2 || input.teamNames.length > 8) fail("teamNames", "Choose 2–8 teams.");
    if (input.teamNames.some(name => !name.trim() || name.trim().length > 40)) fail("teamNames", "Give every team a name (1–40 characters).");
    if (new Set(input.teamNames.map(name => name.trim().toLowerCase())).size !== input.teamNames.length) fail("teamNames", "Each team needs a different name.");
    if (input.expectedPlayerCount < input.teamNames.length) fail("expectedPlayerCount", "Plan for at least one player per team.");
  }
  if (!Number.isInteger(input.roundCount) || input.roundCount < 1 || input.roundCount > 20) fail("roundCount", "Choose 1–20 rounds.");
  if (!["tbd", "match_play"].includes(input.scoringMode)) fail("scoringMode", "Choose match play or TBD.");
  if (input.scoringMode === "match_play" && (input.competitionType !== "teams" || input.teamNames.length !== 2)) fail("scoringMode", "Match play currently supports two teams. Choose TBD for this competition.");
  if (input.formats.length !== input.roundCount || input.formats.some(format => format !== null && !isFormatKey(format))) fail("formats", "Choose a registered format or TBD for each round.");
  if (input.competitionType === "individual" && input.formats.some(format => format !== null)) fail("formats", "Individual formats remain TBD until individual scoring is supported.");
  if (input.branding && [input.branding.primary, input.branding.secondary, input.branding.accent].some(color => !/^#[a-fA-F0-9]{6}$/.test(color))) fail("branding", "Choose valid six-digit hex colors.");
  return errors;
}

export function createTournamentDraft(input: DraftInput): { ok: true; draft: TournamentDraft } | { ok: false; errors: ConfigError[] } {
  const errors = validateDraftInput(input);
  if (errors.length) return { ok: false, errors };
  const name = input.name.trim();
  return { ok: true, draft: {
    schemaVersion: 1, status: "draft", seasonYear: input.seasonYear,
    basics: { name, shortName: name.slice(0, 24).trim(), slug: input.slug.trim(), description: null, destination: null, startDate: input.startDate, endDate: input.endDate, timezone: input.timezone.trim(), visibility: input.visibility },
    competitionType: input.competitionType, expectedPlayerCount: input.expectedPlayerCount,
    teams: input.competitionType === "teams" ? input.teamNames.map((name, index) => ({ key: `team-${index + 1}`, name: name.trim(), color: null, captainPlayerKey: null })) : [],
    players: [], rounds: input.formats.map(format => ({ day: null, label: null, format, courseId: null })),
    scoring: { mode: input.scoringMode === "tbd" ? null : input.scoringMode, rules: null },
    branding: input.branding ? { ...input.branding } : null,
  } };
}

export type SetupStatus = SectionStatus;
export interface SetupSection { name: string; status: SetupStatus; detail: string; step?: number; required: boolean; missing: string[] }

/** Which wizard step edits each section of a local draft. */
const DRAFT_STEPS: Partial<Record<string, number>> = { Basics: 0, Teams: 1, Players: 2, Rounds: 5, Rules: 4, Branding: 6 };

/** A local draft seen as a saved setup, so the one readiness engine judges both. */
export function setupFromDraft(draft: TournamentDraft): TournamentSetup {
  return {
    tournament: { id: "", slug: draft.basics.slug, name: draft.basics.name, shortName: draft.basics.shortName, description: draft.basics.description,
      visibility: draft.basics.visibility, status: "draft", branding: draft.branding, isLegacy: false },
    edition: { id: "", seasonYear: draft.seasonYear, destination: draft.basics.destination, startDate: draft.basics.startDate || null,
      endDate: draft.basics.endDate || null, timezone: draft.basics.timezone, status: "draft", publishedAt: null },
    competitionType: draft.competitionType,
    expectedPlayerCount: draft.expectedPlayerCount,
    teams: draft.teams.map((team, index) => ({ id: team.key, key: team.key, name: team.name, color: team.color ?? TEAM_COLORS[index % TEAM_COLORS.length], captainPlayerId: null })),
    players: [],
    courses: [],
    rounds: draft.rounds.map((round, index) => ({ id: String(index + 1), number: index + 1, day: round.day, label: round.label, format: round.format, courseId: null, playDate: null, startType: null, startTime: null })),
    scoring: draft.scoring.mode ? normalizeScoring({ mode: draft.scoring.mode, pointsForWin: 1, pointsForHalve: 0.5 }).value : null,
    site: { ...DEFAULT_SITE },
    media: { mode: "none", links: [] },
    entitlements: {},
  };
}

/** The local draft preview's setup view, judged by lib/platform/readiness.ts like a saved tournament. */
export function draftSetup(draft: TournamentDraft) {
  const readiness = assessReadiness(setupFromDraft(draft), { liveScoringAvailable: false });
  const sections: SetupSection[] = readiness.sections.map((section) => section.name === "Publish"
    ? { name: section.name, status: "Locked", detail: "Save this tournament to your account to publish it.", required: false, missing: section.missing }
    : { name: section.name, status: section.status, detail: section.detail, step: DRAFT_STEPS[section.name], required: section.requiredFor !== "optional", missing: section.missing });
  const required = sections.filter((section) => section.required);
  const completed = required.filter((section) => section.status === "Complete").length;
  return { sections, percent: readiness.percent, completed, total: required.length, readiness };
}
