/**
 * DEV ONLY: made-up notifications for the simulator's Notifications group. Highlight wording comes from the approved
 * momentum copy (lib/platform/momentumCopy.ts); the other lines are preview wording, not approved for real sending yet.
 */
import { momentumHeadline, momentumSubheading } from "@/lib/platform/momentumCopy";
import type { AppNotification, LeaderboardRow, LiveRoundActivity } from "@/lib/notifications/types";

/** Every preview screen in the group. The first id of each surface is its default. */
export const NOTIFICATION_PREVIEWS = {
  phone: ["lock", "lock-stack", "banner", "signed-out-lock", "signed-out-tap"],
  live: ["both-live", "both-live-top3", "both-pre", "both-over", "both-final", "both-expanded", "pill-pre", "pill-live", "pill-over", "pill-final", "android-pre", "android-live", "android-over", "android-final"],
  inApp: ["bell-unread", "bell-read", "bell-empty", "top-banner"],
} as const;
export type NotificationSurface = keyof typeof NOTIFICATION_PREVIEWS;
export type NotificationPreview = (typeof NOTIFICATION_PREVIEWS)[NotificationSurface][number];
export const NOTIFICATION_PREVIEW_LABELS: Record<NotificationPreview, string> = {
  "lock": "Locked phone · one notification",
  "lock-stack": "Locked phone · several from one group (stacked)",
  "banner": "Unlocked phone · banner over the home screen",
  "signed-out-lock": "Signed out · real notifications still arrive",
  "signed-out-tap": "Signed out · after tapping (sign in, then the update)",
  "pill-pre": "Pill · popped up, 13m to a 2:24 tee time",
  "pill-live": "Pill · live round (+2, 3 up, thru 15)",
  "pill-over": "Pill · round over, next tee time 2:00",
  "pill-final": "Pill · after the last round (W 3&2)",
  "android-pre": "Android chip · popped up (13m)",
  "android-live": "Android chip · live round (▲3)",
  "android-over": "Android chip · round over, next tee time",
  "android-final": "Android chip · after the last round",
  "both-live": "Lock screen · live, I'm 6th (top 2 + me)",
  "both-live-top3": "Lock screen · live, I'm 2nd (top 3)",
  "both-pre": "Lock screen · popped up, 13m to tee time",
  "both-over": "Lock screen · round over, next tee time",
  "both-final": "Lock screen · after the last round",
  "both-expanded": "Dynamic Island · expanded (long press)",
  "bell-unread": "Bell · new notifications",
  "bell-read": "Bell · all read",
  "bell-empty": "Bell · nothing yet",
  "top-banner": "Top banner while using the app",
};
export const ALL_NOTIFICATION_PREVIEWS: readonly string[] = Object.values(NOTIFICATION_PREVIEWS).flat();

/** The preview's clock, fixed so screenshots stay the same. */
export const SAMPLE_NOW = new Date("2026-10-16T21:41:00.000Z");
const minutesAgo = (minutes: number) => new Date(SAMPLE_NOW.getTime() - minutes * 60000).toISOString();
const trip = { groupId: "sample-desert-classic", groupName: "Desert Classic" };
const link = `/golf-trips/00000000-0000-4000-8000-000000000001#momentum`;

export const SAMPLE_NOTIFICATIONS: AppNotification[] = [
  { ...trip, id: "s1", kind: "highlight", title: momentumHeadline("birdie_3"), body: momentumSubheading("birdie_3", "Jake Parker"), link, createdAt: minutesAgo(0), read: false },
  { ...trip, id: "s2", kind: "highlight", title: momentumHeadline("early_match_win"), body: momentumSubheading("early_match_win", "Mike Chen", "3&2"), link, createdAt: minutesAgo(6), read: false },
  { ...trip, id: "s3", kind: "opponentSubmitted", title: "Jake submitted Round 2", body: "Check his card against yours before you submit.", link, createdAt: minutesAgo(18), read: false },
  { ...trip, id: "s4", kind: "teeTime", title: "Tee time in 30 minutes", body: "Round 2 · PGA West Stadium · 2:10 PM", link, createdAt: minutesAgo(95), read: true },
  { ...trip, id: "s5", kind: "joinRequest", title: "Alex Rivera wants to join", body: "Desert Classic · tap to accept or decline", link, createdAt: minutesAgo(60 * 26), read: true },
];

export const SAMPLE_LIVE_ROUND: LiveRoundActivity = {
  ...trip, round: 2, course: "PGA West Stadium", playerName: "Cade Barone", toPar: -2, thru: 12, holes: 18,
  position: "T2", match: null, state: "live", teeTime: null, result: null, updatedAt: minutesAgo(2),
};

/** Owner's example (2026-10-17): Cam on Maroon, +2 for the round, 3 UP thru 15, Maroon leads 3½ to 1½. */
/** The preview's trip-local clock for the countdown: 2:11 PM (owner's example: 2:24 tee time → "13m 2:24"). */
export const SAMPLE_LOCAL_NOW = "2026-10-16T14:11";
/** Owner's example leaderboard (2026-10-17): Cam -4, Collin +1, … Cade 6th at +5. */
const LEADERBOARD = ([["1", "Cam Latto", -4], ["2", "Collin Ross", 1], ["T3", "Jake Parker", 2], ["T3", "Mike Chen", 2], ["5", "Pete Peabody", 4], ["6", "Cade Barone", 5], ["7", "Alex Rivera", 7]] as const)
  .map(([position, name, toPar]): LeaderboardRow => ({ position, name, toPar, me: name === "Cade Barone" }));
/** Same trip with Cade 2nd at -5: Cam, Cade, Collin. */
const LEADERBOARD_SECOND = ([["1", "Cam Latto", -6], ["2", "Cade Barone", -5], ["3", "Collin Ross", 1], ["T4", "Jake Parker", 2]] as const)
  .map(([position, name, toPar]): LeaderboardRow => ({ position, name, toPar, me: name === "Cade Barone" }));
export const SAMPLE_LIVE_TEAM: LiveRoundActivity = {
  ...SAMPLE_LIVE_ROUND, playerName: "Cade Barone", leaderboard: LEADERBOARD, nextCourse: null, toPar: 2, thru: 15, match: { status: "3 UP", opponent: "Collin Ross" },
  teams: { mine: { name: "Maroon", color: "#6b161a", points: 3.5 }, other: { name: "White", color: "#fbf8f1", points: 1.5 } },
};
export const SAMPLE_LIVE_TOP3: LiveRoundActivity = { ...SAMPLE_LIVE_TEAM, toPar: -2, match: { status: "1 DN", opponent: "Collin Ross" }, leaderboard: LEADERBOARD_SECOND };

/** The team Live Activity at each lifecycle step (pill previews). */
const teams = (mine: number, other: number) => ({ mine: { name: "Maroon", color: "#6b161a", points: mine }, other: { name: "White", color: "#fbf8f1", points: other } });
export const SAMPLE_TEAM_STEPS: Record<"pre" | "live" | "over" | "final", LiveRoundActivity> = {
  pre: { ...SAMPLE_LIVE_TEAM, state: "pre", toPar: 0, thru: 0, match: { status: "AS", opponent: "Collin Ross" }, teeTime: "2026-10-16T14:24" },
  live: SAMPLE_LIVE_TEAM,
  over: { ...SAMPLE_LIVE_TEAM, state: "over", thru: 18, match: { status: "Won 3&2", opponent: "Collin Ross" }, result: "W 3&2", teeTime: "2026-10-16T14:00", nextCourse: "PGA West Nicklaus", teams: teams(4.5, 1.5) },
  final: { ...SAMPLE_LIVE_TEAM, state: "final", thru: 18, match: { status: "Won 3&2", opponent: "Collin Ross" }, result: "W 3&2", teams: teams(10.5, 7.5) },
};
