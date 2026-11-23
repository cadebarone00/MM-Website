import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import type { LiveEvent } from "@/lib/platform/liveDirectory";
import type { LiveVisibility } from "@/lib/platform/liveVisibility";
import type { TripRoundScoring } from "@/lib/platform/tripScoring";
import { spectatorLeague, spectatorTrip, type WatchView } from "@/lib/platform/watchView";
import { sampleLeague } from "./sampleLeague";
import { sampleTourney } from "./sampleTourney";

/**
 * Made-up data for The Maroon Live screens in the dev simulator. Nothing is real, loaded or saved. The trip and league go
 * through the same server code that strips a watcher's copy (lib/platform/watchView.ts), so the preview shows exactly
 * what a real watcher gets.
 */

const today = () => new Date().toLocaleDateString("en-CA");
const shift = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toLocaleDateString("en-CA"); };

/** The directory: something Live, Upcoming and Past for each kind. */
export function sampleLiveEvents(): LiveEvent[] {
  return [
    { kind: "trip", name: "Pinehurst Boys Trip", href: "/dev/live/event", firstDate: shift(-1), lastDate: shift(2), ended: false, course: "Pinehurst No. 2", playerCount: 12, place: "Pinehurst, NC" },
    { kind: "tournament", name: "The Fall Classic", href: "/dev/live/event", firstDate: today(), lastDate: shift(1), ended: false, course: "Stevens Park", playerCount: 24, place: null },
    { kind: "league", name: "Thursday Night League", href: "/dev/live/event", firstDate: today(), lastDate: today(), ended: false, course: "Cedar Crest", playerCount: 16, place: null },
    { kind: "trip", name: "Bandon Week", href: "/dev/live/event", firstDate: shift(20), lastDate: shift(24), ended: false, course: "Pacific Dunes", playerCount: 8, place: "Bandon, OR" },
    { kind: "tournament", name: "Member-Guest", href: "/dev/live/event", firstDate: shift(9), lastDate: shift(10), ended: false, course: null, playerCount: 40, place: null },
    { kind: "trip", name: "Scottsdale Spring", href: "/dev/live/event", firstDate: shift(-60), lastDate: shift(-57), ended: true, course: "TPC Scottsdale", playerCount: 8, place: "Scottsdale, AZ" },
    { kind: "league", name: "Summer Scramble League", href: "/dev/live/event", firstDate: shift(-30), lastDate: shift(-30), ended: true, course: "Tenison Highlands", playerCount: 20, place: null },
  ];
}

const NAMES = ["Cade Barone", "Cam Latto", "Jake Hill", "Jackson Collins", "Ryan Ortiz", "Luke Sherrell", "Ben Alvarez", "Will Harper"];
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A saved trip with 8 players and one round today. `live`: The Maroon Live settings (Trip Settings preview). */
export function sampleLiveSavedTrip(live: { visibility: LiveVisibility; playersCanShare: boolean; organizer: boolean }): { trip: SavedGolfTrip; isOrganizer: boolean } {
  const canSee = live.visibility !== "private" && (live.organizer || live.playersCanShare);
  return { isOrganizer: live.organizer, trip: {
    trip: { id: id(900), name: "Pinehurst Boys Trip", destination: "Pinehurst, NC", start_date: shift(-1), end_date: shift(2), expected_traveler_count: 8, golf_days: 3,
      planned_rounds: 3, includes_tournament: "yes", lodging_plan: "undecided", flight_plan: "undecided", transportation_plan: "undecided", tournament_id: null, status: "active",
      created_by: id(1), watch_code: canSee ? "W4K9PZ" : null, live_visibility: live.visibility, live_players_can_share: live.playersCanShare },
    members: NAMES.map((name, i) => ({ id: id(100 + i), profileId: id(i + 1), displayName: name, email: null, role: i === 0 ? "organizer" : "member", invitationStatus: "accepted",
      username: name.toLowerCase().replace(/ /g, ""), avatarUrl: null })),
    rounds: [{ roundNumber: 1, dayNumber: 1, playDate: shift(-1), courseName: "Pinehurst No. 4" }, { roundNumber: 2, dayNumber: 2, playDate: today(), courseName: "Pinehurst No. 2" },
      { roundNumber: 3, dayNumber: 3, playDate: shift(1), courseName: "Tobacco Road" }],
  } };
}

/** The trip as a watcher sees it: round 2 in progress, two groups of four. */
export function sampleLiveTrip(): WatchView {
  const { trip } = sampleLiveSavedTrip({ visibility: "link", playersCanShare: true, organizer: true });
  const strokes = [[4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3], [5, 4, 4, 4, 5, 3, 4, 4], [4, 4, 5, 5, 4, 4, 4, 5, 5, 4], [3, 4, 4, 4, 4, 3, 5, 4, 4],
    [5, 5, 4, 4, 5, 4, 4], [4, 4, 4, 5, 4, 3, 4, 5, 4, 4, 4, 3], [4, 5, 5, 4, 4, 4, 4, 5], [5, 4, 4, 5, 4, 4, 5, 4, 4]];
  const scoring: TripRoundScoring = { roundId: "r2", roundNumber: 2, pars: { pars: [4, 4, 4, 4, 5, 3, 4, 4, 4, 4, 5, 4, 4, 3, 4, 5, 3, 4], source: "manual", courseName: "Pinehurst No. 2", courseRef: null, tee: null, confirmedBy: null, confirmedAt: null, lockedAt: null },
    groups: [0, 1].map((g) => ({ id: `g${g}`, groupNumber: g + 1, lockedAt: null, startHole: 1, players: [0, 1, 2, 3].map((p) => {
      const n = g * 4 + p;
      return { profileId: id(n + 1), displayName: NAMES[n], playOrder: p + 1, side: null, attesterProfileId: id(g * 4 + ((p + 1) % 4) + 1), submittedAt: null };
    }) })),
    entries: strokes.flatMap((card, n) => card.map((s, h) => ({ scoredProfileId: id(n + 1), enteredByProfileId: id(n + 1), hole: h + 1, strokes: s, putts: null, fairway: null, green: null,
      penaltyFairway: false, penaltyGreen: false, clientUpdatedAt: new Date().toISOString(), version: 1 }))) };
  const setup = { available: true, revision: 1, basis: { startDate: trip.trip.start_date, endDate: trip.trip.end_date, rounds: trip.rounds },
    values: { localCompetitionType: { individual: "Stroke Play", team: null }, playerTotal: 8, dayCount: 3 } };
  return { kind: "trip", trip: spectatorTrip(trip, scoring, setup, "watch-W4K9PZ") };
}

/** The tournament as a watcher sees it (the Tourneys sample's spectator view). */
export const sampleLiveTournament = (): WatchView => ({ kind: "tournament", tournament: sampleTourney("spectator").tournament });

/**
 * The league as a watcher sees it. The sample's short player ids ("me", "p6") are first swapped for real-looking ids,
 * since a watcher's copy replaces ids wherever they appear (a real id is a long unique code; "me" would match "name").
 */
export function sampleLiveLeague(): WatchView {
  const league = sampleLeague();
  let text = JSON.stringify(league);
  league.players.forEach((p, i) => { text = text.split(`"${p.profileId}"`).join(`"${id(500 + i)}"`); });
  return { kind: "league", league: spectatorLeague(JSON.parse(text), "watch-WLEAGU") };
}
