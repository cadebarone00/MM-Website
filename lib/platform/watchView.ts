import type { CodeTournament } from "./codeTournaments.ts";
import { savedTripAsDraft, type SavedGolfTrip } from "./golfTripCreate.ts";
import type { GolfTripDraft } from "./golfTripDraft.ts";
import type { TripSetupSnapshot } from "./savedTripSetup.ts";
import type { TripRoundScoring } from "./tripScoring.ts";

/**
 * Watch codes (project_specs.md, "Feature: Watch codes"): what a spectator's phone is allowed to receive. Everything
 * here runs on the server before the reply leaves it: real profile ids become stand-ins ("p1", "p2"…), and codes,
 * emails, invite details, the destination, coordinates and travel plans are dropped.
 */

export interface SpectatorTrip { savedTrip: SavedGolfTrip; scoring: TripRoundScoring | null; setup: TripSetupSnapshot; draft: GolfTripDraft }
export type WatchView = { kind: "tournament"; tournament: CodeTournament } | { kind: "trip"; trip: SpectatorTrip };

/** Replaces every real id in `value` with its stand-in (anywhere it appears: keys, values, nested). */
function swapIds<T>(value: T, ids: Map<string, string>): T {
  let text = JSON.stringify(value);
  for (const [real, stand] of ids) text = text.split(real).join(stand);
  return JSON.parse(text) as T;
}

/** A tournament for spectators: players as p1, p2…; no join code, no organizer id, no Info PDF or tee sheets (players only). */
export function spectatorTournament(t: CodeTournament): CodeTournament {
  const ids = new Map(t.players.map((p, i) => [p.profileId, `p${i + 1}`]));
  // Info and the tee sheets are for players only.
  const shown: CodeTournament = { ...t, code: "", organizer: "", infoPdf: null, players: t.players.map((p) => ({ ...p, username: null })),
    rounds: t.rounds.map((r) => ({ ...r, teeSheet: null })) };
  delete shown.watchCode;
  return swapIds(shown, ids);
}

/**
 * A golf trip for spectators: only accepted players (name and the photo they show publicly), the rounds and courses,
 * the competition settings and one round's scores. `watchId` stands in for the trip id.
 */
export function spectatorTrip(trip: SavedGolfTrip, scoring: TripRoundScoring | null, setup: TripSetupSnapshot, watchId: string): SpectatorTrip {
  const accepted = trip.members.filter((m) => m.invitationStatus === "accepted" && m.profileId);
  const ids = new Map<string, string>(accepted.map((m, i) => [m.profileId as string, `p${i + 1}`]));
  trip.members.forEach((m, i) => ids.set(m.id, `m${i + 1}`));
  ids.set(trip.trip.id, watchId);
  const t = trip.trip;
  const savedTrip: SavedGolfTrip = {
    trip: { id: t.id, name: t.name, destination: "", start_date: t.start_date, end_date: t.end_date, expected_traveler_count: null, golf_days: t.golf_days,
      planned_rounds: t.planned_rounds, includes_tournament: t.includes_tournament, lodging_plan: "undecided", flight_plan: "undecided", transportation_plan: "undecided",
      tournament_id: null, status: t.status, created_by: "" },
    members: accepted.map((m) => ({ id: m.id, profileId: m.profileId, displayName: m.displayName, email: null, role: m.role, invitationStatus: "accepted", username: null, avatarUrl: m.avatarUrl ?? null })),
    rounds: trip.rounds.map((r) => ({ roundNumber: r.roundNumber, dayNumber: r.dayNumber, playDate: r.playDate, courseName: r.courseName })),
  };
  const draft: GolfTripDraft = { ...savedTripAsDraft(savedTrip), destination: "", yourName: "", yourEmail: "" };
  delete draft.destinationLatitude; delete draft.destinationLongitude;
  return swapIds({ savedTrip, scoring, setup, draft }, ids);
}
