/**
 * DEV ONLY: made-up notifications for the simulator's Notifications group. Highlight wording comes from the approved
 * momentum copy (lib/platform/momentumCopy.ts); the other lines are preview wording, not approved for real sending yet.
 */
import { momentumHeadline, momentumSubheading } from "@/lib/platform/momentumCopy";
import type { AppNotification, LiveRoundActivity } from "@/lib/notifications/types";

/** Every preview screen in the group. The first id of each surface is its default. */
export const NOTIFICATION_PREVIEWS = {
  phone: ["lock", "lock-stack", "banner", "signed-out-lock", "signed-out-tap"],
  live: ["live-lock", "live-lock-match", "island-compact", "island-compact-team", "island-expanded", "island-minimal", "island-minimal-team", "live-final"],
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
  "live-lock": "Lock screen · live round",
  "live-lock-match": "Lock screen · live round in a match",
  "island-compact": "Dynamic Island · compact",
  "island-compact-team": "Dynamic Island · compact, team + match (owner idea)",
  "island-expanded": "Dynamic Island · expanded (long press)",
  "island-minimal": "Dynamic Island · minimal (another app's activity too)",
  "island-minimal-team": "Dynamic Island · tiny circle, what fits (owner idea)",
  "live-final": "Lock screen · round final",
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
  position: "T2", match: null, state: "live", updatedAt: minutesAgo(2),
};
export const SAMPLE_LIVE_MATCH: LiveRoundActivity = { ...SAMPLE_LIVE_ROUND, match: { status: "2 UP", opponent: "Jake Parker" } };
export const SAMPLE_FINAL_ROUND: LiveRoundActivity = { ...SAMPLE_LIVE_ROUND, toPar: -1, thru: 18, position: "2", match: { status: "Won 3&2", opponent: "Jake Parker" }, state: "final" };

/** Owner's example (2026-10-17): Cam on Maroon, +2 for the round, 3 UP thru 15, Maroon leads 3½ to 1½. */
export const SAMPLE_LIVE_TEAM: LiveRoundActivity = {
  ...SAMPLE_LIVE_ROUND, playerName: "Cam Latto", toPar: 2, thru: 15, match: { status: "3 UP", opponent: "Collin Ross" },
  teams: { mine: { name: "Maroon", color: "#c2474f", points: 3.5 }, other: { name: "White", color: "#ffffff", points: 1.5 } },
};
