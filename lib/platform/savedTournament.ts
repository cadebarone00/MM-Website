import { isFormatKey } from "./formats.ts";
import type { TournamentDraft } from "./tournamentDraft.ts";

/** A saved tournament as its rows come back from the platform tables. */
export interface SavedTournamentRows {
  tournament: { name: string; short_name: string; slug: string; description: string | null; visibility: string; branding: Record<string, unknown> | null };
  edition: { season_year: number; destination: string | null; start_date: string | null; end_date: string | null; timezone: string };
  teams: { key: string; name: string; color: string }[];
  settings: { scoring: Record<string, unknown> | null; plan: Record<string, unknown> | null } | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Rebuilds the dashboard's draft shape from saved rows, so one setup view serves drafts and saved tournaments. */
export function draftFromSaved(rows: SavedTournamentRows): TournamentDraft {
  const plan = rows.settings?.plan ?? {};
  const branding = rows.tournament.branding ?? {};
  const rounds = Array.isArray(plan.rounds) ? (plan.rounds as { format?: unknown }[]) : [];
  const visibility = rows.tournament.visibility;
  return {
    schemaVersion: 1,
    status: "draft",
    seasonYear: rows.edition.season_year,
    basics: {
      name: rows.tournament.name,
      shortName: rows.tournament.short_name,
      slug: rows.tournament.slug,
      description: rows.tournament.description,
      destination: rows.edition.destination,
      startDate: rows.edition.start_date ?? "",
      endDate: rows.edition.end_date ?? "",
      timezone: rows.edition.timezone,
      visibility: visibility === "public" || visibility === "unlisted" ? visibility : "private",
    },
    competitionType: plan.competitionType === "teams" ? "teams" : "individual",
    expectedPlayerCount: typeof plan.expectedPlayerCount === "number" ? plan.expectedPlayerCount : 0,
    teams: rows.teams.map((team) => ({ key: team.key, name: team.name, color: team.color, captainPlayerKey: null })),
    players: [],
    rounds: rounds.map((round) => ({ day: null, label: null, format: isFormatKey(round.format) ? round.format : null, courseId: null })),
    scoring: { mode: rows.settings?.scoring?.mode === "match_play" ? "match_play" : null, rules: null },
    branding: [branding.primary, branding.secondary, branding.accent].every((color) => typeof color === "string" && HEX.test(color))
      ? { primary: branding.primary as string, secondary: branding.secondary as string, accent: branding.accent as string, logoUrl: null }
      : null,
  };
}
