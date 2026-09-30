import { isFormatKey, type FormatKey } from "./formats.ts";

/**
 * One tournament edition's saved setup, exactly as get_tournament_setup
 * (supabase/platform_dashboard.sql) returns it. The dashboard, the section
 * rules and the readiness engine all work from this one shape.
 */
export interface TournamentSetup {
  tournament: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    description: string | null;
    visibility: "public" | "unlisted" | "private";
    status: string;
    branding: Branding | null;
    isLegacy: boolean;
  };
  edition: {
    id: string;
    seasonYear: number;
    destination: string | null;
    startDate: string | null;
    endDate: string | null;
    timezone: string;
    status: string;
    publishedAt: string | null;
  };
  competitionType: "individual" | "teams";
  expectedPlayerCount: number;
  teams: SetupTeam[];
  players: SetupPlayer[];
  courses: SetupCourse[];
  rounds: SetupRound[];
  scoring: Scoring | null;
  site: SiteSections;
  media: Media;
  entitlements: Record<string, unknown>;
}

export interface Branding { primary: string; secondary: string; accent: string; logoUrl: string | null }
export interface SetupTeam { id: string; key: string; name: string; color: string; captainPlayerId: string | null }
export interface SetupPlayer { id: string; name: string; email: string | null; handicap: number | null; teamKey: string | null }
export interface SetupCourse { id: string; name: string; city: string | null; state: string | null; teeName: string | null; par: number | null; yards: number | null; rating: number | null; slope: number | null }
export interface SetupRound {
  id: string;
  number: number;
  day: number | null;
  label: string | null;
  format: FormatKey | null;
  courseId: string | null;
  playDate: string | null;
  startType: "tee_times" | "shotgun" | null;
  startTime: string | null; // "HH:MM"
}
export interface Scoring {
  mode: "match_play";
  pointsForWin: number;
  pointsForHalve: number;
  handicap: "gross" | "net";
  allowancePercent: number;
  allowEarlyFinish: boolean;
  allowConcessions: boolean;
  individualLeaderboard: boolean;
}

/** Which parts of the future public site at /t/[tournament]/[year] are shown. */
export const SITE_SECTIONS = ["leaderboard", "matches", "schedule", "players", "teams", "courses", "stats", "media", "results", "history"] as const;
export type SiteSection = (typeof SITE_SECTIONS)[number];
export type SiteSections = Record<SiteSection, boolean>;

/**
 * Media (spec §12). Commercial V1: "none" or "device_external" (media stays on
 * players' phones or on sites like YouTube, linked here). "maroon_hosted" is
 * reserved for plans with the hosted_media entitlement (The Maroon).
 */
export type MediaMode = "none" | "device_external" | "maroon_hosted";
export interface Media { mode: MediaMode; links: { label: string; url: string }[] }

export const DEFAULT_SITE: SiteSections = Object.fromEntries(SITE_SECTIONS.map((section) => [section, true])) as SiteSections;

const obj = (value: unknown): Record<string, unknown> => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const arr = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(obj) : []);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const num = (value: unknown): number | null => (value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);

/** Defensive parse of get_tournament_setup's jsonb. */
export function parseSetup(raw: unknown): TournamentSetup {
  const root = obj(raw);
  const t = obj(root.tournament);
  const e = obj(root.edition);
  const plan = obj(root.plan);
  const scoring = obj(root.scoring);
  const branding = obj(t.branding);
  const site = obj(root.site);
  const media = obj(root.media);
  const visibility = t.visibility === "public" || t.visibility === "unlisted" ? t.visibility : "private";
  return {
    tournament: {
      id: String(t.id ?? ""), slug: String(t.slug ?? ""), name: String(t.name ?? ""), shortName: String(t.shortName ?? ""),
      description: str(t.description), visibility, status: String(t.status ?? "draft"), isLegacy: t.isLegacy === true,
      branding: typeof branding.primary === "string" && typeof branding.secondary === "string" && typeof branding.accent === "string"
        ? { primary: branding.primary, secondary: branding.secondary, accent: branding.accent, logoUrl: null } : null,
    },
    edition: {
      id: String(e.id ?? ""), seasonYear: Number(e.seasonYear), destination: str(e.destination), startDate: str(e.startDate),
      endDate: str(e.endDate), timezone: String(e.timezone ?? "America/Chicago"), status: String(e.status ?? "draft"), publishedAt: str(e.publishedAt),
    },
    competitionType: plan.competitionType === "teams" ? "teams" : "individual",
    expectedPlayerCount: num(plan.expectedPlayerCount) ?? 0,
    teams: arr(root.teams).map((team) => ({ id: String(team.id), key: String(team.key), name: String(team.name), color: String(team.color), captainPlayerId: str(team.captainPlayerId) })),
    players: arr(root.players).map((player) => ({ id: String(player.id), name: String(player.name), email: str(player.email), handicap: num(player.handicap), teamKey: str(player.teamKey) })),
    courses: arr(root.courses).map((course) => ({ id: String(course.id), name: String(course.name), city: str(course.city), state: str(course.state), teeName: str(course.teeName),
      par: num(course.par), yards: num(course.yards), rating: num(course.rating), slope: num(course.slope) })),
    rounds: arr(root.rounds).map((round) => ({
      id: String(round.id), number: Number(round.number), day: num(round.day), label: str(round.label),
      format: isFormatKey(round.format) ? round.format : null, courseId: str(round.courseId), playDate: str(round.playDate),
      startType: round.startType === "tee_times" || round.startType === "shotgun" ? round.startType : null, startTime: str(round.startTime),
    })),
    scoring: scoring.mode === "match_play" ? {
      mode: "match_play", pointsForWin: num(scoring.pointsForWin) ?? 1, pointsForHalve: num(scoring.pointsForHalve) ?? 0.5,
      handicap: scoring.handicap === "net" ? "net" : "gross", allowancePercent: num(scoring.allowancePercent) ?? 100,
      allowEarlyFinish: scoring.allowEarlyFinish !== false, allowConcessions: scoring.allowConcessions === true, individualLeaderboard: scoring.individualLeaderboard !== false,
    } : null,
    site: Object.fromEntries(SITE_SECTIONS.map((section) => [section, site[section] !== false])) as SiteSections,
    media: {
      mode: media.mode === "device_external" || media.mode === "maroon_hosted" ? media.mode : "none",
      links: arr(media.links).map((link) => ({ label: String(link.label ?? ""), url: String(link.url ?? "") })),
    },
    entitlements: obj(root.entitlements),
  };
}
