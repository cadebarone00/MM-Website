import type { AppNotification, LiveRoundActivity } from "./types.ts";

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
  if (activity.state === "final" || activity.thru >= activity.holes) return "F";
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
    final: activity.state === "final" || activity.thru >= activity.holes,
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
