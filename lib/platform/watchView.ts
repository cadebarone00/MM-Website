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

/** Only competition display data belongs in the anonymous response, including nested keys. */
function publicSetupValues(values: Record<string, unknown>): Record<string, unknown> {
  const shown: Record<string, unknown> = {};
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
  for (const key of ["teamNames", "teamColors"]) if (Array.isArray(values[key])) shown[key] = values[key].filter(item => typeof item === "string" || item === null);
  for (const key of ["playerTotal", "dayCount"]) if (typeof values[key] === "number") shown[key] = values[key];
  if (object(values.localCompetitionType)) shown.localCompetitionType = Object.fromEntries(["individual", "team"].filter(key => values.localCompetitionType && (typeof (values.localCompetitionType as Record<string, unknown>)[key] === "string" || (values.localCompetitionType as Record<string, unknown>)[key] === null)).map(key => [key, (values.localCompetitionType as Record<string, unknown>)[key]]));
  for (const key of ["compRounds", "roundsPerDay", "teamPicks"]) if (object(values[key])) shown[key] = Object.fromEntries(Object.entries(values[key]).filter(([index, value]) => /^\d+(?:-\d+)?$/.test(index) && (typeof value === "boolean" || typeof value === "number")));
  if (Array.isArray(values.submittedTeams) && values.submittedTeams.every(group => Array.isArray(group) && group.every(index => Number.isInteger(index) && index >= 0 && index < 64))) shown.submittedTeams = values.submittedTeams;
  if (object(values.compFormats)) shown.compFormats = Object.fromEntries(Object.entries(values.compFormats).filter(([key, value]) => /^\d+-\d+$/.test(key) && object(value)).map(([key, value]) => [key, Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([field, setting]) => ["players", "format", "matchType", "nassau", "pointsPerMatch", "scoring"].includes(field) && ["string", "number", "boolean"].includes(typeof setting)))]));
  return shown;
}

/** A tournament for spectators: players as p1, p2…; no join code, no organizer id, no Info PDF or tee sheets (players only). */
export function spectatorTournament(t: CodeTournament): CodeTournament {
  const ids = new Map(t.players.map((p, i) => [p.profileId, `p${i + 1}`]));
  // Info and the tee sheets are for players only.
  const shown: CodeTournament = { ...t, code: "", organizer: "", infoPdf: null, attests: [], players: t.players.map((p) => ({ ...p, username: null })),
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
  // Public settings are an explicit allowlist, not the member settings snapshot.
  const publicSetup: TripSetupSnapshot = { available: setup.available, revision: 0,
    basis: { startDate: savedTrip.trip.start_date, endDate: savedTrip.trip.end_date, rounds: savedTrip.rounds },
    values: publicSetupValues(setup.values) };
  const acceptedIds = new Set(accepted.map(member => member.profileId));
  const publicScoring: TripRoundScoring | null = scoring ? {
    roundId: watchId + "-round-" + scoring.roundNumber, roundNumber: scoring.roundNumber,
    pars: scoring.pars ? { pars: scoring.pars.pars, source: scoring.pars.source, courseName: scoring.pars.courseName, courseRef: null, tee: null, confirmedBy: null, confirmedAt: null, lockedAt: scoring.pars.lockedAt } : null,
    groups: scoring.groups.map((group, index) => ({ id: watchId + "-group-" + (index + 1), groupNumber: group.groupNumber ?? index + 1,
      lockedAt: group.lockedAt ?? null, startHole: group.startHole,
      players: group.players.filter(player => acceptedIds.has(player.profileId)).map(player => ({
        profileId: player.profileId, displayName: accepted.find(member => member.profileId === player.profileId)!.displayName,
        playOrder: player.playOrder, side: player.side ?? null, submittedAt: player.submittedAt ?? null,
        attesterProfileId: acceptedIds.has(player.attesterProfileId) ? player.attesterProfileId : null,
      })) })),
    entries: scoring.entries.filter(entry => acceptedIds.has(entry.scoredProfileId) && acceptedIds.has(entry.enteredByProfileId)).map(entry => ({
      scoredProfileId: entry.scoredProfileId, enteredByProfileId: entry.enteredByProfileId, hole: entry.hole, strokes: entry.strokes,
      putts: entry.putts ?? null, fairway: entry.fairway ?? null, green: entry.green ?? null,
      penaltyFairway: entry.penaltyFairway ?? false, penaltyGreen: entry.penaltyGreen ?? false, clientUpdatedAt: "", version: 1,
    })),
  } : null;
  return swapIds({ savedTrip, scoring: publicScoring, setup: publicSetup, draft }, ids);
}
