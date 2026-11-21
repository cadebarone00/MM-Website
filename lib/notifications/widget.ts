/**
 * The home screen widget's content: the live round, else the next one, else "No rounds yet".
 * Spec: project_specs.md → "Home screen widget: "What's next" for iPhone + Android".
 * The app saves `widgetTimeline()` for the Swift (WidgetKit) and Kotlin (Glance) widgets, which draw it unchanged.
 */
import { formatToPar, opponentLabel, safeAppLink, teeClock, thruLabel } from "./format.ts";
import type { LiveRoundActivity } from "./types.ts";

export type WidgetSource = "trip" | "solo" | "league" | "tournament";

/** One round the person has, from any part of the app. */
export type WidgetItem = {
  id: string;
  source: WidgetSource;
  /** Trip / league / tournament name; "Your round" for solo. */
  groupName: string;
  /** Short course name (courseDisplayName). */
  course: string;
  /** Trip-local "YYYY-MM-DDTHH:mm", or null when not set. */
  teeTime: string | null;
  /** In-app path opened on tap (scorecard while live, else the round / trip). */
  link: string;
  /** Present only while the round is live (state "live"). */
  live: LiveRoundActivity | null;
  /** My group while live, me first. */
  group?: { name: string; toPar: number; thru: number }[];
  /** While live: holes finished, oldest first. */
  holes?: { hole: number; par: number; strokes: number }[];
};

export type WidgetState = "nothing" | "next" | "live";

export type WidgetSnapshot = {
  /** Trip-local time this snapshot starts showing. */
  at: string;
  state: WidgetState;
  link: string;
  eyebrow: string;
  title: string;
  line1: string;
  line2: string;
  /** Medium / Large while live: up to 4 rows, me first. */
  group: { name: string; score: string; thru: string }[];
  /** Medium shows 2, Large shows 4. Never includes the main item. */
  upcoming: { title: string; when: string; link: string }[];
  /** Large while live: the last 3 holes played. */
  holes: { hole: number; par: number; strokes: number }[];
  lock: { circle: string; rect: [string, string]; inline: string };
};

/** A round with a tee time stays "next" until this long after it (the organizer may start late). */
const GRACE_MINUTES = 60;
const TIMELINE_HOURS = 48;
const TIMELINE_MAX = 8;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Trip-local wall times, read as UTC so they only compare with each other (same as format.ts).
const toMinutes = (local: string) => Date.parse(`${local.slice(0, 16)}:00Z`) / 60000;
const fromMinutes = (minutes: number) => new Date(minutes * 60000).toISOString().slice(0, 16);
const dayNumber = (local: string) => Math.floor(toMinutes(local) / 1440);

/** "Now" once the tee time is here, else "Today", "Tomorrow", "In 3 days" (calendar days). */
export function whenLabel(teeTime: string, nowLocal: string): string {
  if (toMinutes(nowLocal) >= toMinutes(teeTime)) return "Now";
  const days = dayNumber(teeTime) - dayNumber(nowLocal);
  if (days <= 0) return "Today";
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

/** "Sat 8:40". */
const dayAndClock = (teeTime: string) => `${DAYS[new Date(toMinutes(teeTime) * 60000).getUTCDay()]} ${teeClock(teeTime)}`;

const isLive = (item: WidgetItem) => item.live?.state === "live";
const stillAhead = (item: WidgetItem, nowLocal: string): item is WidgetItem & { teeTime: string } =>
  item.teeTime !== null && toMinutes(nowLocal) < toMinutes(item.teeTime) + GRACE_MINUTES;
const upcomingOf = (items: WidgetItem[], nowLocal: string) =>
  items.filter(item => !isLive(item) && stillAhead(item, nowLocal)).sort((a, b) => toMinutes(a.teeTime!) - toMinutes(b.teeTime!));

/** A live round wins (newest score first); else the soonest tee time still ahead; else nothing. */
export function pickWidgetItem(items: WidgetItem[], nowLocal: string): { item: WidgetItem; state: "next" | "live" } | null {
  const live = items.filter(isLive).sort((a, b) => Date.parse(b.live!.updatedAt) - Date.parse(a.live!.updatedAt));
  if (live[0]) return { item: live[0], state: "live" };
  const next = upcomingOf(items, nowLocal)[0];
  return next ? { item: next, state: "next" } : null;
}

export function buildWidgetSnapshot(items: WidgetItem[], nowLocal: string): WidgetSnapshot {
  const picked = pickWidgetItem(items, nowLocal);
  const upcoming = upcomingOf(items, nowLocal).filter(item => item.id !== picked?.item.id).slice(0, 4)
    .map(item => ({ title: item.course, when: dayAndClock(item.teeTime!), link: safeAppLink(item.link) }));
  const base = { at: nowLocal.slice(0, 16), upcoming, group: [], holes: [] };
  if (!picked) {
    return { ...base, state: "nothing", link: "/rounds/new", eyebrow: "THE MAROON", title: "No rounds yet", line1: "Tap to start one", line2: "",
      lock: { circle: "", rect: ["The Maroon", "No rounds yet"], inline: "" } };
  }
  const { item } = picked;
  const link = safeAppLink(item.link);
  if (picked.state === "next") {
    const teeTime = item.teeTime!;
    const line1 = dayAndClock(teeTime);
    return { ...base, state: "next", link, eyebrow: "NEXT · TEE TIME", title: item.course, line1, line2: whenLabel(teeTime, nowLocal),
      lock: { circle: teeClock(teeTime), rect: [item.course, line1], inline: `${item.course} ${teeClock(teeTime)}` } };
  }
  const activity = item.live!;
  const score = formatToPar(activity.toPar);
  const thru = thruLabel(activity);
  const line1 = `${score} · ${thru}`;
  const midRound = activity.thru > 0 && thru !== "F";
  return {
    ...base, state: "live", link, eyebrow: `LIVE · ${item.course.toUpperCase()}`, title: item.course, line1,
    line2: activity.match ? `${activity.match.status} vs ${opponentLabel(activity.match.opponents)}` : item.groupName,
    group: (item.group ?? []).slice(0, 4).map(row => ({ name: row.name, score: formatToPar(row.toPar), thru: row.thru >= activity.holes ? "F" : `${row.thru}` })),
    holes: (item.holes ?? []).slice(-3),
    lock: { circle: score, rect: [item.course, line1], inline: midRound ? `${score} thru ${activity.thru}` : `${score} ${thru}` },
  };
}

/** The next moment the main item's words change: a midnight before its tee date, the tee time, then tee + grace. */
function nextChange(items: WidgetItem[], atMinutes: number): number | null {
  const picked = pickWidgetItem(items, fromMinutes(atMinutes));
  if (!picked || picked.state === "live") return null;
  const tee = toMinutes(picked.item.teeTime!);
  const nextMidnight = (Math.floor(atMinutes / 1440) + 1) * 1440;
  return [nextMidnight, tee, tee + GRACE_MINUTES].filter(minutes => minutes > atMinutes && minutes <= tee + GRACE_MINUTES).sort((a, b) => a - b)[0] ?? null;
}

const sameContent = (a: WidgetSnapshot, b: WidgetSnapshot) => JSON.stringify({ ...a, at: "" }) === JSON.stringify({ ...b, at: "" });

/** Snapshot now, then one per moment the words change in the next 48 hours (max 8). Live = just now. */
export function widgetTimeline(items: WidgetItem[], nowLocal: string): WidgetSnapshot[] {
  const start = toMinutes(nowLocal);
  const entries = [buildWidgetSnapshot(items, nowLocal)];
  let at = start;
  for (let change = nextChange(items, at); change !== null && change <= start + TIMELINE_HOURS * 60 && entries.length < TIMELINE_MAX; change = nextChange(items, at)) {
    at = change;
    const snapshot = buildWidgetSnapshot(items, fromMinutes(at));
    if (!sameContent(snapshot, entries[entries.length - 1])) entries.push(snapshot);
  }
  return entries;
}
