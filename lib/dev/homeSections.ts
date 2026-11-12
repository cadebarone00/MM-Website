/**
 * DEV ONLY: Golf Trip → Home, one simulator Conditional per state of each Home section (Overview, Momentum, Upcoming,
 * Competition, Players). "source" (or unset) = the section shows the trip's own data. ("source" is spelled out because
 * the Conditionals list comes from the server, and a value left undefined is dropped on the way.) Pure data, safe to import anywhere.
 */
import type { ItineraryItem } from "@/lib/platform/golfTripItinerary";
import type { MomRound } from "@/lib/platform/momNotifications";
import type { MomentumEvent } from "@/lib/platform/tripPush";
import type { TripWeather } from "@/lib/platform/weather/types";
import type { BigBoardScore } from "@/lib/platform/bigBoard";

export const HOME_OVERVIEW_STAGES = ["source", "normal", "weather-loading", "no-destination", "no-dates"] as const;
export const HOME_MOMENTUM_STAGES = ["source", "team-scores", "split", "leader", "highlights", "arrival", "next-round", "empty"] as const;
export const HOME_UPCOMING_STAGES = ["source", "live", "next", "none", "flights"] as const;
export const HOME_COMPETITION_STAGES = ["source", "none", "empty"] as const;
export const HOME_INVITE_STAGES = ["source", "ready", "loading", "off", "copied"] as const;
export const HOME_PLAYERS_STAGES = ["source", "none", "list", "photos"] as const;
export type HomeOverviewStage = (typeof HOME_OVERVIEW_STAGES)[number];
export type HomeMomentumStage = (typeof HOME_MOMENTUM_STAGES)[number];
export type HomeUpcomingStage = (typeof HOME_UPCOMING_STAGES)[number];
export type HomeCompetitionStage = (typeof HOME_COMPETITION_STAGES)[number];
export type HomeInviteStage = (typeof HOME_INVITE_STAGES)[number];
export type HomePlayersStage = (typeof HOME_PLAYERS_STAGES)[number];

/** A section's forced state, or undefined when it shows the trip's own data. */
export const forcedStage = <T extends string>(stage: T | undefined): Exclude<T, "source"> | undefined => stage === "source" ? undefined : stage as Exclude<T, "source"> | undefined;

/** Overview: a sample place, dates and weather. */
export const SAMPLE_DESTINATION = "Scottsdale, AZ";
export const SAMPLE_DATE_RANGE = "Apr 22 – Apr 26, 2027";
export const SAMPLE_WEATHER: TripWeather = { status: "ok", weather: { temperature: 78, temperatureUnit: "F", condition: "Sunny", high: 84, low: 61, precipitationChance: 5, windSpeed: "6 mph", windDirection: "SW", updatedAt: "2027-04-22T08:00:00Z" } };

/** Momentum: two round highlights (they rotate every 10 seconds). */
export const SAMPLE_HIGHLIGHTS: MomentumEvent[] = [
  { id: "sim-h1", cause: null, subject_name: "Cam", result_label: null, kind: "milestone", title: "Heating Up!", detail: "3 birdies in a row for Cam", round_number: 1, created_at: "2027-04-22T15:00:00Z" },
  { id: "sim-h2", cause: null, subject_name: "Drew", result_label: null, kind: "score", title: "Eagle!", detail: "Drew eagles the 7th", round_number: 1, created_at: "2027-04-22T14:40:00Z" },
];

/** Big Board top half: sample scores (team match, or an individual leader). */
export const SAMPLE_TEAM_SCORE: BigBoardScore = { kind: "team", left: { name: "Maroon", points: 7.5 }, right: { name: "Gold", points: 5.5 }, toWin: 10.5, line: "Round 3 · Fourball" };
export const SAMPLE_SPLIT_SCORE: BigBoardScore = { kind: "both", left: { name: "Maroon", points: 7.5 }, right: { name: "Gold", points: 5.5 }, toWin: 10.5, line: "Round 3 · Fourball",
  top: [{ position: "1", name: "Cam Latto", total: "-4" }, { position: "2", name: "Drew Weisser", total: "-2" }, { position: "T3", name: "Cade Barone", total: "E" },
    { position: "T3", name: "Kyle Schnabel", total: "E" }, { position: "5", name: "Jake Parker", total: "+1" }] };
export const SAMPLE_LEADER_SCORE: BigBoardScore = { kind: "individual", leader: "Cam Latto", total: "-4", thru: "Thru 14", line: "Round 2 · Stroke Play" };

/** Momentum "Next round": a round today, with arrival day already passed so no countdown shows. */
export const sampleNextRound = (today: string): MomRound[] => [{ number: 1, date: today, course: "Troon North · Monument", format: "Best Ball" }];

/** Momentum "Countdown to arrival": arrival 30 days after `today`. */
export function daysAfter(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Upcoming: sample itinerary items, timed around `now` ("YYYY-MM-DDTHH:mm"). */
export function sampleUpcoming(stage: "live" | "next", now: string): { status: "LIVE" | "NOW" | "NEXT" | "UPCOMING"; item: ItineraryItem }[] {
  const day = now.slice(0, 10);
  const round: ItineraryItem = { id: "sim-round", kind: "teeTime", title: "Troon North · Monument", detail: "Round 1 · 4 players", startsAt: `${day}T08:30`, round: 1 };
  const dinner: ItineraryItem = { id: "sim-dinner", kind: "dining", title: "Mastro's City Hall", detail: "Team dinner", startsAt: `${day}T19:00` };
  const ride: ItineraryItem = { id: "sim-ride", kind: "ride", title: "Shuttle to the course", detail: "Pickup at the villa", startsAt: `${daysAfter(day, 1)}T07:15` };
  const round2: ItineraryItem = { id: "sim-round-2", kind: "teeTime", title: "Troon North · Pinnacle", detail: "Round 2 · 4 players", startsAt: `${daysAfter(day, 1)}T08:40`, round: 2 };
  const villa: ItineraryItem = { id: "sim-villa", kind: "lodging", title: "Desert Mountain Villas", detail: "Check-out", startsAt: `${daysAfter(day, 2)}T11:00` };
  return stage === "live"
    ? [{ status: "LIVE", item: round }, { status: "NEXT", item: dinner }, { status: "UPCOMING", item: ride }, { status: "UPCOMING", item: round2 }, { status: "UPCOMING", item: villa }]
    : [{ status: "NEXT", item: dinner }, { status: "UPCOMING", item: ride }, { status: "UPCOMING", item: round2 }, { status: "UPCOMING", item: villa }];
}

/** Players: made-up names (they get placeholder @usernames); "photos" gives some of them real profile pictures. */
export function samplePlayers(withPhotos: boolean): { name: string; avatarUrl?: string | null }[] {
  const people: [string, string | null][] = [
    ["Cade Barone", "/players/cade-barone/avatar.png"], ["Cam Latto", "/players/cam-latto/avatar.png"], ["Jake Parker", null],
    ["Drew Weisser", "/players/drew-weisser/avatar.png"], ["Mike Chen", null], ["Collin Ross", "/players/collin-ross/avatar.png"],
  ];
  return people.map(([name, photo]) => ({ name, avatarUrl: withPhotos ? photo : null }));
}
