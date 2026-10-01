// The one place tournament theme colors are defined and resolved.
// Data: tournaments.branding (primary/secondary/accent) + edition_teams.color.
// See project_specs.md → "Tournament Theme & Personalization System".

export interface ThemeTeam { id: string; name: string; color: string }
/** Base roles every tournament has. Individual events have no teams; team events can have any number. */
export interface TournamentTheme { primary: string; secondary: string; accent: string; teams: ThemeTeam[] }
export interface ResolvedTeam extends ThemeTeam { textOn: string }
export interface ResolvedTournamentTheme {
  theme: { primary: string; secondary: string; accent: string; textOnPrimary: string; textOnSecondary: string; textOnAccent: string };
  /** team1/team2 are teams[0]/teams[1], matching the competition/team-1 and team-2 tokens. */
  competition: { teams: ResolvedTeam[]; team1?: string; team2?: string; textOnTeam1?: string; textOnTeam2?: string };
}

/** Used when a tournament has set no colors. Provisional until a proper Default/Neutral theme is designed. Never The Maroon. */
export const SYSTEM_DEFAULT_THEME: TournamentTheme = { primary: "#1f2937", secondary: "#ffffff", accent: "#9ca3af", teams: [] };

/** The Maroon Tournament's saved theme (Figma variables, 2026-09-30). Mirrors supabase/maroon_theme_colors.sql. */
export const MAROON_THEME_PRESET: TournamentTheme = {
  primary: "#500001", secondary: "#f7f4ee", accent: "#d6a75c",
  teams: [{ id: "maroon", name: "Team Maroon", color: "#500001" }, { id: "white", name: "Team White", color: "#f7f4ee" }],
};

/** Used for a team whose saved color is missing or invalid. */
export const NEUTRAL_TEAM_COLOR = "#6b7280";
const TEXT_DARK = "#000000";
const TEXT_LIGHT = "#ffffff";

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

/** WCAG relative luminance of a six-digit hex color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const n = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two six-digit hex colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Black or white text, whichever reads better on the background. Invalid colors are treated as the default primary. */
export function readableTextOn(background: string): string {
  const color = isHexColor(background) ? background : SYSTEM_DEFAULT_THEME.primary;
  return contrastRatio(color, TEXT_DARK) >= contrastRatio(color, TEXT_LIGHT) ? TEXT_DARK : TEXT_LIGHT;
}

type BrandingInput = { primary?: unknown; secondary?: unknown; accent?: unknown } | null | undefined;
type TeamInput = { id: string; name: string; color?: unknown };

/** Saved branding + teams → validated colors with readable text colors. Anything missing or invalid falls back to the system default. */
export function resolveTournamentTheme(branding: BrandingInput, teams: TeamInput[] = []): ResolvedTournamentTheme {
  const pick = (value: unknown, fallback: string) => (isHexColor(value) ? value : fallback);
  const primary = pick(branding?.primary, SYSTEM_DEFAULT_THEME.primary);
  const secondary = pick(branding?.secondary, SYSTEM_DEFAULT_THEME.secondary);
  const accent = pick(branding?.accent, SYSTEM_DEFAULT_THEME.accent);
  const resolvedTeams = teams.map((team) => {
    const color = pick(team.color, NEUTRAL_TEAM_COLOR);
    return { id: team.id, name: team.name, color, textOn: readableTextOn(color) };
  });
  const [team1, team2] = resolvedTeams;
  return {
    theme: { primary, secondary, accent, textOnPrimary: readableTextOn(primary), textOnSecondary: readableTextOn(secondary), textOnAccent: readableTextOn(accent) },
    competition: { teams: resolvedTeams, team1: team1?.color, team2: team2?.color, textOnTeam1: team1?.textOn, textOnTeam2: team2?.textOn },
  };
}

/** CSS custom properties for a resolved theme. Team variables are only set for teams that exist. */
export function themeCssVariables(resolved: ResolvedTournamentTheme): Record<string, string> {
  const { theme, competition } = resolved;
  const variables: Record<string, string> = {
    "--theme-primary": theme.primary, "--theme-secondary": theme.secondary, "--theme-accent": theme.accent,
    "--theme-on-primary": theme.textOnPrimary, "--theme-on-secondary": theme.textOnSecondary, "--theme-on-accent": theme.textOnAccent,
  };
  competition.teams.forEach((team, index) => {
    variables[`--competition-team-${index + 1}`] = team.color;
    variables[`--competition-on-team-${index + 1}`] = team.textOn;
  });
  return variables;
}
