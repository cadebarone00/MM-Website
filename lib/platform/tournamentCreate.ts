import { isFormatKey } from "./formats.ts";
import { createTournamentDraft, type DraftInput, type TournamentDraft } from "./tournamentDraft.ts";
import type { ConfigError } from "./tournamentConfig.ts";

/**
 * CREATE → EXIST (THE_MAROON_PRODUCT_SPEC.md §5.1). Turns the wizard's input
 * into the one payload supabase/platform_create_tournament.sql accepts. The
 * server runs the same createTournamentDraft rules the wizard does, so there
 * is one rulebook for what a new tournament shell needs.
 */
export interface CreateTournamentPayload {
  name: string;
  shortName: string;
  slug: string;
  seasonYear: number;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  visibility: "public" | "unlisted" | "private";
  branding: { primary: string; secondary: string; accent: string; logoUrl: string | null } | null;
  teams: { key: string; name: string; color: string }[];
  scoring: { mode?: "match_play" };
  plan: {
    competitionType: "individual" | "teams";
    expectedPlayerCount: number;
    rounds: { format: string | null }[];
  };
}

/** Starting team colors, so a new team is never shown as The Maroon's maroon. Organizers change them later. */
export const TEAM_COLORS = ["#1f4e9c", "#b8860b", "#2e6b4f", "#8b1e3f", "#4b3f72", "#c2571a", "#256d85", "#5b5b5b"];

export function payloadFromDraft(draft: TournamentDraft): CreateTournamentPayload {
  return {
    name: draft.basics.name,
    shortName: draft.basics.shortName,
    slug: draft.basics.slug,
    seasonYear: draft.seasonYear,
    startDate: draft.basics.startDate || null,
    endDate: draft.basics.endDate || null,
    timezone: draft.basics.timezone,
    visibility: draft.basics.visibility,
    branding: draft.branding,
    teams: draft.teams.map((team, index) => ({ key: team.key, name: team.name, color: team.color ?? TEAM_COLORS[index % TEAM_COLORS.length] })),
    scoring: draft.scoring.mode ? { mode: draft.scoring.mode } : {},
    plan: {
      competitionType: draft.competitionType,
      expectedPlayerCount: draft.expectedPlayerCount,
      rounds: draft.rounds.map((round) => ({ format: round.format })),
    },
  };
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const int = (value: unknown) => (typeof value === "number" ? value : Number.NaN);

/** Untrusted request body → DraftInput. Wrong types become values the validator rejects. */
export function draftInputFromBody(body: unknown): DraftInput {
  const raw = (body !== null && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const branding = raw.branding !== null && typeof raw.branding === "object" ? (raw.branding as Record<string, unknown>) : null;
  const visibility = text(raw.visibility);
  return {
    name: text(raw.name),
    slug: text(raw.slug),
    seasonYear: int(raw.seasonYear),
    startDate: text(raw.startDate),
    endDate: text(raw.endDate),
    timezone: text(raw.timezone),
    visibility: visibility === "public" || visibility === "unlisted" ? visibility : visibility === "private" ? "private" : ("" as DraftInput["visibility"]),
    competitionType: raw.competitionType === "teams" ? "teams" : raw.competitionType === "individual" ? "individual" : ("" as DraftInput["competitionType"]),
    expectedPlayerCount: int(raw.expectedPlayerCount),
    teamNames: Array.isArray(raw.teamNames) ? raw.teamNames.map(text) : [],
    roundCount: int(raw.roundCount),
    scoringMode: raw.scoringMode === "match_play" ? "match_play" : raw.scoringMode === "tbd" ? "tbd" : ("" as DraftInput["scoringMode"]),
    formats: Array.isArray(raw.formats) ? raw.formats.map((format) => (format === null ? null : isFormatKey(format) ? format : ("?" as never))) : [],
    branding: branding ? { primary: text(branding.primary), secondary: text(branding.secondary), accent: text(branding.accent), logoUrl: null } : null,
  };
}

/** Maps a create_tournament_shell failure to what the organizer sees. */
export function createFailure(error: { code?: string; message?: string }): { status: number; error: string } {
  if (error.code === "42501") return { status: 403, error: "Creating tournaments is invite-only right now. Ask The Maroon for access." };
  if (error.code === "23505") return { status: 409, error: "That web address is already taken. Pick another." };
  // Function or tables not installed yet (platform migrations not run in this database).
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "PGRST205") {
    return { status: 503, error: "Saving tournaments isn't switched on yet." };
  }
  return { status: 500, error: "Could not create the tournament. Try again." };
}

export function tournamentManageUrl(slug: string, seasonYear: number): string {
  return `/tournaments/${slug}/${seasonYear}`;
}

export function createPayloadFromBody(body: unknown): { ok: true; payload: CreateTournamentPayload } | { ok: false; errors: ConfigError[] } {
  const result = createTournamentDraft(draftInputFromBody(body));
  return result.ok ? { ok: true, payload: payloadFromDraft(result.draft) } : result;
}
