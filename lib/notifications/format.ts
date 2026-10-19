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
    opponent: activity.match ? opponentLabel(activity.match.opponents) : "",
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
 * pre → "13m 2:24"; live → round score, match (holes then triangle, "3▲"), thru; over → next tee time; final (or over with no next round) → result.
 */
/**
 * A finished match squeezed for the tiny circle / Android chip: the margin, not just W/L (owner 2026-10-17).
 * "W 3&2" → "3&2"; "W 2 UP" → "2▲"; "L 1 DN" → "1▼"; "Halved" / "AS" → "AS".
 */
export function resultMargin(result: string): string {
  const text = result.trim().toUpperCase();
  if (/^(HALVED|AS|A\/S|TIED)$/.test(text)) return "AS";
  const closed = /(\d+\s*&\s*\d+)/.exec(text);
  if (closed) return closed[1].replace(/\s+/g, "");
  const holes = /(\d+)\s*(UP|DN|DOWN)/.exec(text);
  if (holes) return `${holes[1]}${holes[2] === "UP" ? "▲" : "▼"}`;
  return text.slice(0, 3);
}

/** Win / loss / halved from a finished match ("W 3&2", "L 2&1", "Halved"): wins show gold, losses gray (owner 2026-10-19). */
export function resultTone(result: string | null | undefined): "win" | "loss" | "halved" | null {
  const text = (result ?? "").trim().toUpperCase();
  if (!text) return null;
  if (/^(HALVED|AS|A\/S|TIED)\b/.test(text)) return "halved";
  if (/^(W|WON)\b/.test(text)) return "win";
  if (/^(L|LOST)\b/.test(text)) return "loss";
  return null;
}

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
    return { kind: "result", result: activity.result, tiny: resultMargin(activity.result) };
  }
  const mark = activity.match ? matchMark(activity.match.status) : null;
  const toPar = formatToPar(activity.toPar);
  const tiny = !mark ? toPar : mark.direction === "even" ? "AS" : `${mark.holes}${mark.direction === "up" ? "▲" : "▼"}`;
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


/** The other side of my match: one player → full name ("Collin Ross"); a pair (fourball etc.) → last names ("Sherrell & Ross"). */
export function opponentLabel(names: string[]): string {
  const clean = names.map(name => name.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return clean.map(name => name.split(/\s+/).at(-1)).join(" & ");
}

/** Team text on the Live Activity: the team's app on-dark color, a hair brighter (owner 2026-10-17). */
export function liveTeamText(onDark: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(onDark)?.[1];
  if (!hex) return onDark;
  return `#${[0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).map(c => Math.round(c + (255 - c) * 0.12).toString(16).padStart(2, "0")).join("")}`;
}

/** "1" → "1st", "6" → "6th", "T2" stays "T2". */
export function ordinal(position: string): string {
  if (!/^\d+$/.test(position)) return position;
  const n = Number(position), tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/**
 * Android Live Update (Google's standard template — the app can't use its own layout or fonts there): one title line, one
 * text line, the status bar chip's few characters, and a progress bar while live. Same lifecycle as the iPhone.
 */
export function androidLiveUpdate(activity: LiveRoundActivity, nowLocal: string): { title: string; text: string; chip: string; progress: number | null } {
  const status = pillStatus(activity, nowLocal);
  const mine = activity.leaderboard?.find(row => row.me);
  const opponent = activity.match ? opponentLabel(activity.match.opponents) : "";
  const title = activity.teams
    ? `${activity.teams.mine.name} ${formatPoints(activity.teams.mine.points)} – ${formatPoints(activity.teams.other.points)} ${activity.teams.other.name}`
    : mine ? `${ordinal(mine.position)} · ${activity.playerName} ${formatToPar(mine.toPar)}` : activity.groupName;
  const versus = opponent ? ` vs ${opponent}` : "";
  const place = mine && activity.teams ? ` · ${ordinal(mine.position)}` : "";
  let text: string;
  if (status.kind === "countdown") text = `Tee ${status.clock}${versus || ` · ${activity.course}`}`;
  else if (status.kind === "next") text = `${activity.result ? `${activity.result}${versus} · ` : ""}Next ${status.clock}${activity.nextCourse ? ` · ${activity.nextCourse}` : ""}`;
  else if (status.kind === "result") text = `${status.result}${versus} · Final${place}`;
  else {
    const match = activity.match ? `${status.tiny}${versus} · ` : `Round ${activity.round} · `;
    text = `${match}${status.toPar} ${thruLabel(activity) === "F" ? "final" : `thru ${activity.thru}`}${place}`;
  }
  return { title, text, chip: status.tiny, progress: status.kind === "live" ? Math.min(1, activity.thru / activity.holes) : null };
}
