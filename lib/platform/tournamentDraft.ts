import { isTimezone, type ConfigError, type TournamentConfig } from "./tournamentConfig.ts";
import { isFormatKey } from "./formats.ts";

/** Local planning data only. This deliberately cannot be passed as a ready-to-play config. */
export interface TournamentDraft {
  schemaVersion: 1;
  status: "draft";
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
  name: "", startDate: "", endDate: "", timezone: "America/Chicago", visibility: "private",
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
  if (!realDate(input.startDate)) fail("startDate", "Choose a valid start date.");
  if (!realDate(input.endDate)) fail("endDate", "Choose a valid end date.");
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
  // A suggestion only: no URL is reserved or created by this local shell.
  const slugBase = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 49).replace(/-$/, "");
  return { ok: true, draft: {
    schemaVersion: 1, status: "draft",
    basics: { name, shortName: name.slice(0, 24), slug: `${slugBase || "new"}-tournament`, description: null, destination: null, startDate: input.startDate, endDate: input.endDate, timezone: input.timezone.trim(), visibility: input.visibility },
    competitionType: input.competitionType, expectedPlayerCount: input.expectedPlayerCount,
    teams: input.competitionType === "teams" ? input.teamNames.map((name, index) => ({ key: `team-${index + 1}`, name: name.trim(), color: null, captainPlayerKey: null })) : [],
    players: [], rounds: input.formats.map(format => ({ day: null, label: null, format, courseId: null })),
    scoring: { mode: input.scoringMode === "tbd" ? null : input.scoringMode, rules: null },
    branding: input.branding ? { ...input.branding } : null,
  } };
}

export type SetupStatus = "Complete" | "Needs Attention" | "Optional" | "Not Started" | "Locked";
export interface SetupSection { name: string; status: SetupStatus; detail: string; step?: number; required: boolean }

export function draftSetup(draft: TournamentDraft) {
  const sections: SetupSection[] = [
    { name: "Basics", status: "Complete", detail: "Name, dates, timezone and privacy are set.", step: 0, required: true },
    { name: "Players", status: "Not Started", detail: `0 of ${draft.expectedPlayerCount} planned players added. Player names, emails and handicaps come later.`, required: true },
    { name: "Teams", status: draft.teams.length ? "Needs Attention" : "Optional", detail: draft.teams.length ? `${draft.teams.length} teams named. Assign players and captains later.` : "Not needed for an individual tournament.", step: draft.teams.length ? 1 : undefined, required: draft.teams.length > 0 },
    { name: "Courses", status: "Not Started", detail: "Choose courses and tees for each round later.", required: true },
    { name: "Rounds", status: draft.rounds.every(round => round.format) ? "Complete" : "Needs Attention", detail: `${draft.rounds.length} rounds planned; ${draft.rounds.filter(round => !round.format).length} formats TBD.`, step: 5, required: true },
    { name: "Schedule", status: "Not Started", detail: "Assign round dates, tee times and pairings later.", required: true },
    { name: "Rules", status: "Needs Attention", detail: draft.scoring.mode ? "Match play selected. Detailed rules still need review." : "Scoring style and detailed rules are TBD.", step: 4, required: true },
    { name: "Branding", status: draft.branding ? "Complete" : "Optional", detail: draft.branding ? "Tournament colors chosen. Logos can be added later." : "Add colors and logos whenever you are ready.", step: 6, required: false },
    { name: "Website", status: "Locked", detail: "A tournament website has not been created. Website setup comes in a future release.", required: false },
    { name: "Media", status: "Optional", detail: "Optional. Skip media, keep it on players' phones, or link videos from sites like YouTube. Hosted uploads and broadcast aren't included.", required: false },
    { name: "Publish", status: "Locked", detail: "Publishing and live scoring are unavailable in this draft preview. Privacy is a preference until publishing is connected.", required: false },
  ];
  const required = sections.filter(section => section.required);
  return { sections, percent: Math.round(required.filter(section => section.status === "Complete").length / required.length * 100), completed: required.filter(section => section.status === "Complete").length, total: required.length };
}
