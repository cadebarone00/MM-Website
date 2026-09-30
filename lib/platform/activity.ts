import type { TournamentSetup } from "./setup.ts";

/**
 * Tournament activity: the data contract the Tournament Home (/t/[tournament]/[year])
 * consumes. Built by get_tournament_activity (supabase/platform_activity.sql).
 * This file is the typed interface only — no UI. In user-facing words a
 * tournament is a league, an edition a season and an organizer the
 * commissioner; the database roles (owner/organizer/player) are unchanged.
 */

/** Activity types the platform records today. */
export const ACTIVITY_TYPES = ["commissioner_announcement", "tournament_published", "schedule_updated", "players_updated", "teams_updated"] as const;
/** Reserved for C4 (live scoring). Not recorded yet; listed so the UI can plan for them. */
export const RESERVED_C4_ACTIVITY_TYPES = ["pairings_posted", "match_started", "match_final", "team_score_changed", "round_started", "round_final", "leaderboard_changed"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type ReservedActivityType = (typeof RESERVED_C4_ACTIVITY_TYPES)[number];

export const ANNOUNCEMENT_VISIBILITIES = ["everyone", "players_only"] as const;
export type ActivityVisibility = (typeof ANNOUNCEMENT_VISIBILITIES)[number];

export interface TournamentActivityItem {
  /** Short key (a1, a2 …), stable for this viewer; never a database id. */
  ref: string;
  type: ActivityType;
  visibility: ActivityVisibility;
  title: string | null;
  body: string | null;
  /** Non-personal counts for automatic events, e.g. { added: 2 }. */
  metadata: Record<string, number>;
  createdAt: string;
  /** Poster's display name — members only; null for visitors and system events. */
  authorName: string | null;
  /** Plain-English one-liner for automatic events ("2 players added."), null for announcements. */
  summary: string | null;
}

export interface ActivityViewer {
  signedIn: boolean;
  /** The viewer's membership role in this tournament, if any (owner/organizer = commissioner). */
  role: "owner" | "organizer" | "player" | "viewer" | null;
  isPlatformAdmin: boolean;
  canPostAnnouncement: boolean;
  canSeePlayersOnly: boolean;
}

export interface TournamentActivityFeed {
  published: boolean;
  viewer: ActivityViewer;
  /** Newest first. */
  activity: TournamentActivityItem[];
}

const isType = (value: unknown): value is ActivityType => (ACTIVITY_TYPES as readonly unknown[]).includes(value);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Readable summary of an automatic event from its counts. */
export function activitySummary(type: ActivityType, metadata: Record<string, number>): string | null {
  const m = (key: string) => metadata[key] ?? 0;
  const parts: string[] = [];
  if (type === "tournament_published") return "The tournament site is live.";
  if (type === "players_updated") {
    if (m("added")) parts.push(`${plural(m("added"), "player")} added`);
    if (m("removed")) parts.push(`${plural(m("removed"), "player")} removed`);
  } else if (type === "teams_updated") {
    if (m("teamsAdded")) parts.push(`${plural(m("teamsAdded"), "team")} added`);
    if (m("teamsRemoved")) parts.push(`${plural(m("teamsRemoved"), "team")} removed`);
    if (m("playersMoved")) parts.push(`${plural(m("playersMoved"), "player")} changed teams`);
  } else if (type === "schedule_updated") {
    if (m("roundsAdded")) parts.push(`${plural(m("roundsAdded"), "round")} added`);
    if (m("roundsRemoved")) parts.push(`${plural(m("roundsRemoved"), "round")} removed`);
    if (m("roundsRescheduled")) parts.push(`${plural(m("roundsRescheduled"), "round")} rescheduled`);
    if (m("datesChanged")) parts.push("tournament dates changed");
  } else {
    return null;
  }
  if (!parts.length) return null;
  const text = parts.join(", ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

/** get_tournament_activity's jsonb → the typed feed. Unknown (e.g. future C4) types are skipped. */
export function parseActivityFeed(raw: unknown): TournamentActivityFeed | null {
  if (raw === null || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const v = (root.viewer ?? {}) as Record<string, unknown>;
  const role = v.role === "owner" || v.role === "organizer" || v.role === "player" || v.role === "viewer" ? v.role : null;
  const activity = (Array.isArray(root.activity) ? root.activity : []).flatMap((row): TournamentActivityItem[] => {
    const r = (row ?? {}) as Record<string, unknown>;
    if (!isType(r.type) || typeof r.ref !== "string") return [];
    const metadata = Object.fromEntries(Object.entries((r.metadata ?? {}) as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])));
    return [{
      ref: r.ref, type: r.type, visibility: r.visibility === "players_only" ? "players_only" : "everyone",
      title: typeof r.title === "string" ? r.title : null, body: typeof r.body === "string" ? r.body : null,
      metadata, createdAt: String(r.createdAt ?? ""), authorName: typeof r.authorName === "string" ? r.authorName : null,
      summary: r.type === "commissioner_announcement" ? null : activitySummary(r.type, metadata),
    }];
  });
  return {
    published: root.published === true,
    viewer: { signedIn: v.signedIn === true, role, isPlatformAdmin: v.isPlatformAdmin === true, canPostAnnouncement: v.canPostAnnouncement === true, canSeePlayersOnly: v.canSeePlayersOnly === true },
    activity,
  };
}

export interface AnnouncementInput { title: string | null; body: string; visibility: ActivityVisibility }

export function validateAnnouncement(body: unknown): { ok: true; data: AnnouncementInput } | { ok: false; error: string } {
  const raw = (body !== null && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const text = typeof raw.body === "string" ? raw.body.trim() : "";
  const visibility = raw.visibility ?? "everyone";
  if (!text || text.length > 2000) return { ok: false, error: "Write a message (up to 2,000 characters)." };
  if (title.length > 120) return { ok: false, error: "Keep the title under 120 characters." };
  if (visibility !== "everyone" && visibility !== "players_only") return { ok: false, error: "Choose who can see it." };
  return { ok: true, data: { title: title || null, body: text, visibility } };
}

export interface SetupActivityChange { type: Exclude<ActivityType, "commissioner_announcement" | "tournament_published">; metadata: Record<string, number> }

/**
 * Which automatic events a dashboard save deserves, from the saved setup
 * before and after. Only real changes count: renames/typo fixes, colors,
 * branding, rules and identical re-saves produce nothing.
 */
export function setupActivityChanges(before: TournamentSetup, after: TournamentSetup): SetupActivityChange[] {
  const changes: SetupActivityChange[] = [];
  const beforePlayers = new Map(before.players.map((p) => [p.id, p]));
  const afterIds = new Set(after.players.map((p) => p.id));
  const added = after.players.filter((p) => !beforePlayers.has(p.id)).length;
  const removed = before.players.filter((p) => !afterIds.has(p.id)).length;
  if (added || removed) changes.push({ type: "players_updated", metadata: { added, removed } });

  const beforeTeams = new Set(before.teams.map((t) => t.key));
  const afterTeams = new Set(after.teams.map((t) => t.key));
  const teamsAdded = [...afterTeams].filter((key) => !beforeTeams.has(key)).length;
  const teamsRemoved = [...beforeTeams].filter((key) => !afterTeams.has(key)).length;
  const playersMoved = after.players.filter((p) => {
    const was = beforePlayers.get(p.id);
    return was !== undefined && was.teamKey !== p.teamKey;
  }).length;
  if (teamsAdded || teamsRemoved || playersMoved) changes.push({ type: "teams_updated", metadata: { teamsAdded, teamsRemoved, playersMoved } });

  const beforeRounds = new Map(before.rounds.map((r) => [r.number, r]));
  const afterRounds = new Map(after.rounds.map((r) => [r.number, r]));
  const roundsAdded = [...afterRounds.keys()].filter((n) => !beforeRounds.has(n)).length;
  const roundsRemoved = [...beforeRounds.keys()].filter((n) => !afterRounds.has(n)).length;
  const roundsRescheduled = [...afterRounds.values()].filter((r) => {
    const was = beforeRounds.get(r.number);
    return was !== undefined && (was.playDate !== r.playDate || was.startType !== r.startType || was.startTime !== r.startTime || was.courseId !== r.courseId);
  }).length;
  const datesChanged = before.edition.startDate !== after.edition.startDate || before.edition.endDate !== after.edition.endDate ? 1 : 0;
  if (roundsAdded || roundsRemoved || roundsRescheduled || datesChanged) changes.push({ type: "schedule_updated", metadata: { roundsAdded, roundsRemoved, roundsRescheduled, datesChanged } });
  return changes;
}
