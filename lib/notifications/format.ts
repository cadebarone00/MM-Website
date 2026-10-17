import type { AppNotification, LeaderboardRow, LiveRoundActivity } from "./types.ts";

/** Same limits as the web push worker (public/trip-push-sw.js). */
export const TITLE_LIMIT = 80;
export const BODY_LIMIT = 180;
const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text);

/** Only same-app paths are opened from a notification; anything else falls back to the app's start screen. */
export function safeAppLink(link: string): string {
  return /^\/(?!\/)[a-zA-Z0-9/_#?=&.-]*$/.test(link) ? link : "/";
}

/** "E", "-2", "+3". */
export function formatToPar(toPar: number): string {
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

/** "Starting", "Thru 12", "F". */
export function thruLabel(activity: Pick<LiveRoundActivity, "thru" | "holes" | "state">): string {
  if (activity.state === "over" || activity.state === "final" || activity.thru >= activity.holes) return "F";
  return activity.thru <= 0 ? "Starting" : `Thru ${activity.thru}`;
}

/** iPhone-style time: "now", "5m ago", "2h ago", "Yesterday", "Oct 3". */
export function timeAgo(createdAt: string, now: Date): string {
  const then = new Date(createdAt);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 48 * 60) return "Yesterday";
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function newestFirst(list: AppNotification[]): AppNotification[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unreadCount(list: AppNotification[]): number {
  return list.filter(item => !item.read).length;
}

/**
 * The Apple (APNs) payload for one notification. `thread-id` stacks a group's notifications together on the phone;
 * `link` is read by the app when the notification is tapped (signed out → sign in first, then this link).
 */
export function apnsPayload(notification: AppNotification, badge: number) {
  return {
    aps: {
      alert: { title: clip(notification.title, TITLE_LIMIT), body: clip(notification.body, BODY_LIMIT) },
      sound: "default",
      badge: Math.max(0, Math.floor(badge)),
      "thread-id": notification.groupId,
    },
    id: notification.id,
    kind: notification.kind,
    link: safeAppLink(notification.link),
  };
}

/** The Live Activity's changing content, in the exact shape the Swift widget's ContentState decodes. */
export function liveActivityContent(activity: LiveRoundActivity) {
  return {
    toPar: formatToPar(activity.toPar),
    thru: thruLabel(activity),
    progress: Math.min(1, Math.max(0, activity.thru / activity.holes)),
    position: activity.position ?? "",
    matchStatus: activity.match?.status ?? "",
    opponent: activity.match?.opponent ?? "",
    final: activity.state === "over" || activity.state === "final" || activity.thru >= activity.holes,
  };
}

/** Team points with halves: 3.5 → "3½", 4 → "4", 0.5 → "½". */
export function formatPoints(points: number): string {
  const whole = Math.floor(points);
  const half = points - whole >= 0.5;
  return half ? `${whole === 0 ? "" : whole}½` : `${whole}`;
}

/** Match status for a small arrow: "3 UP" → up 3, "2 DN" → down 2, "AS" → even. Anything else (e.g. "Won 3&2") → null. */
export function matchMark(status: string): { direction: "up" | "down" | "even"; holes: number } | null {
  const text = status.trim().toUpperCase();
  if (text === "AS") return { direction: "even", holes: 0 };
  const found = /^(\d+)\s*(UP|DN|DOWN)$/.exec(text);
  return found ? { direction: found[2] === "UP" ? "up" : "down", holes: Number(found[1]) } : null;
}

/** Trip-local wall times ("YYYY-MM-DDTHH:mm"), compared only with each other. */
const wallMinutes = (local: string) => Date.parse(`${local.slice(0, 16)}:00Z`) / 60000;

/** "2026-10-16T14:24" → "2:24". */
export function teeClock(local: string): string {
  const [hours, minutes] = local.slice(11, 16).split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")}`;
}

/** Minutes until the tee time, never below 0 (the organizer may start a little late). */
export function minutesUntil(teeTime: string, nowLocal: string): number {
  const minutes = Math.ceil(wallMinutes(teeTime) - wallMinutes(nowLocal));
  return Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
}

/**
 * The right side of the Dynamic Island pill and its tiny circle, following the Live Activity lifecycle:
 * pre → "13m 2:24"; live → round score, match arrow, thru; over → next tee time; final (or over with no next round) → result.
 */
export type PillStatus =
  | { kind: "countdown"; minutes: string; clock: string; tiny: string }
  | { kind: "live"; toPar: string; mark: ReturnType<typeof matchMark>; thru: number; tiny: string }
  | { kind: "next"; clock: string; tiny: string }
  | { kind: "result"; result: string; tiny: string };

export function pillStatus(activity: LiveRoundActivity, nowLocal: string): PillStatus {
  if (activity.state === "pre" && activity.teeTime) {
    const minutes = `${minutesUntil(activity.teeTime, nowLocal)}m`;
    return { kind: "countdown", minutes, clock: teeClock(activity.teeTime), tiny: minutes };
  }
  if (activity.state === "over" && activity.teeTime) {
    const clock = teeClock(activity.teeTime);
    return { kind: "next", clock, tiny: clock };
  }
  if ((activity.state === "over" || activity.state === "final") && activity.result) {
    return { kind: "result", result: activity.result, tiny: activity.result.charAt(0).toUpperCase() };
  }
  const mark = activity.match ? matchMark(activity.match.status) : null;
  const toPar = formatToPar(activity.toPar);
  const tiny = !mark ? toPar : mark.direction === "even" ? "AS" : `${mark.direction === "up" ? "▲" : "▼"}${mark.holes}`;
  return { kind: "live", toPar, mark, thru: activity.thru, tiny };
}

/**
 * The Live Activity's 3 leaderboard rows, straight from the leaderboard (owner rule 2026-10-17): me in the top 3 → the
 * top 3 with me in place; otherwise rows 1 and 2, a line, then me. Not on the leaderboard → the top 3.
 */
export function liveLeaderboard(rows: LeaderboardRow[]): { rows: LeaderboardRow[]; split: boolean } {
  const mine = rows.findIndex(row => row.me);
  if (mine < 3) return { rows: rows.slice(0, 3), split: false };
  return { rows: [rows[0], rows[1], rows[mine]], split: true };
}

/** A team color as text on the black Dynamic Island: dark colors are lightened so they stay readable. */
export function readableOnBlack(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (light >= 0.35) return color.toLowerCase();
  const lift = (value: number) => Math.round(value + (255 - value) * 0.45).toString(16).padStart(2, "0");
  return `#${lift(r)}${lift(g)}${lift(b)}`;
}

/** Text color on a team's fill: dark text on light fills, white on dark ones. */
export function textOnFill(color: string): "dark" | "light" {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return "dark";
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? "dark" : "light";
}
