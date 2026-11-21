/**
 * DEV ONLY: made-up rounds for the simulator's Notifications → Home screen widget preview (lib/notifications/widget.ts).
 */
import type { WidgetItem } from "@/lib/notifications/widget";
import { SAMPLE_LOCAL_NOW, SAMPLE_TEAM_STEPS, minutesAgo } from "./sampleNotifications";

export const WIDGET_SIZES = ["small", "medium", "large", "lock"] as const;
export const WIDGET_STATES = ["nothing", "next", "live", "long"] as const;
export const WIDGET_PHONES = ["ios", "android"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];
export type WidgetSampleState = (typeof WIDGET_STATES)[number];
export type WidgetPhone = (typeof WIDGET_PHONES)[number];

/** The preview's trip-local clock: the same as every Notifications preview (Friday, October 16, 2:11 PM). */
export const WIDGET_SAMPLE_NOW = SAMPLE_LOCAL_NOW;

const TRIP = "Pinehurst Weekend";
/** Coming up: a trip round in 2 days, then a league round, a round on my own and a tournament round. */
const UPCOMING: WidgetItem[] = [
  { id: "trip-r1", source: "trip", groupName: TRIP, course: "Pinehurst No. 2", teeTime: "2026-10-18T08:40", link: "/golf-trips/sample", live: null },
  { id: "trip-r2", source: "trip", groupName: TRIP, course: "Pinehurst No. 4", teeTime: "2026-10-19T09:10", link: "/golf-trips/sample", live: null },
  { id: "league", source: "league", groupName: "Tuesday Night League", course: "Cedar Crest", teeTime: "2026-10-20T17:30", link: "/leagues", live: null },
  { id: "solo", source: "solo", groupName: "Your round", course: "Stevens Park", teeTime: "2026-10-23T07:50", link: "/rounds/new", live: null },
  { id: "tourney", source: "tournament", groupName: "Turkey Shoot", course: "Tenison Highlands", teeTime: "2026-10-24T11:00", link: "/tournaments/join", live: null },
];

const liveRound = (course: string, groupName: string): WidgetItem => ({
  id: "trip-live", source: "trip", groupName, course, teeTime: "2026-10-16T11:20", link: "/golf-trips/sample",
  live: { ...SAMPLE_TEAM_STEPS.live, groupName, course, toPar: 3, thru: 12, match: { status: "2 UP", opponents: ["Collin Ross"] }, updatedAt: minutesAgo(2) },
  group: [{ name: "Cade Barone", toPar: 3, thru: 12 }, { name: "Collin Ross", toPar: 5, thru: 12 }, { name: "Jake Parker", toPar: 1, thru: 12 }, { name: "Mike Chen", toPar: 8, thru: 12 }],
  holes: [{ hole: 10, par: 5, strokes: 5 }, { hole: 11, par: 3, strokes: 2 }, { hole: 12, par: 4, strokes: 6 }],
});

export function sampleWidgetItems(state: WidgetSampleState): WidgetItem[] {
  switch (state) {
    case "nothing": return [];
    case "next": return UPCOMING;
    case "live": return [liveRound("Pinehurst No. 2", TRIP), ...UPCOMING.slice(1)];
    case "long": return [liveRound("Bandon Dunes Sheep Ranch Links", "Annual Fall Pacific Northwest Classic"), ...UPCOMING.slice(1)];
  }
}
