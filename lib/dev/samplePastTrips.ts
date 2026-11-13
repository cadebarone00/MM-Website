import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import type { ImportInput } from "@/lib/platform/pastTripImport";

/**
 * App simulator → Import past trip (sample): trips "imported" in the simulator, kept only in the dev server's memory
 * (gone on restart). Nothing touches the database; the real import uses supabase/golf_trip_import.sql.
 */
type Store = Map<string, ImportInput & { revision?: number }>;
const store: Store = ((globalThis as { __samplePastTrips?: Store }).__samplePastTrips ??= new Map());

export const addSamplePastTrip = (id: string, input: ImportInput) => { store.set(id, input); };
export const samplePastTrips = () => [...store.entries()].map(([id, input]) => ({ id, input })).reverse();

/** A sample trip in the shape the trip page reads: you as the organizer (your player row when you played), the rest invited. */
export function samplePastTrip(id: string): SavedGolfTrip | null {
  const input = store.get(id);
  if (!input) return null;
  const others = input.players.filter((p) => p.id !== input.organizerMemberId);
  return {
    trip: { id, name: input.name, destination: input.destination, start_date: input.startDate, end_date: input.endDate, expected_traveler_count: input.players.length,
      golf_days: new Set(input.rounds.map((r) => r.dayNumber)).size, planned_rounds: input.rounds.length, includes_tournament: "yes", lodging_plan: "no",
      flight_plan: "no", transportation_plan: "no", tournament_id: null, status: "completed", created_by: "sample", imported: true },
    members: [
      { id: input.organizerMemberId ?? "sample-organizer", profileId: "sample", displayName: input.organizerName, email: null, role: "organizer", invitationStatus: "accepted" },
      ...others.map((p) => ({ id: p.id, profileId: null, displayName: p.name, email: null, role: "member" as const, invitationStatus: "pending" })),
    ],
    rounds: input.rounds.map((r) => ({ roundNumber: r.roundNumber, dayNumber: r.dayNumber, playDate: r.playDate, courseName: r.courseName })),
  };
}
export const samplePastTripResults = (id: string) => store.get(id)?.results ?? null;

/** A fixed result in the simulator (after the same checks the real route runs). Returns the new revision. */
export function updateSamplePastTrip(id: string, results: ImportInput["results"]) {
  const input = store.get(id);
  if (!input) return null;
  input.results = results;
  input.revision = (input.revision ?? 1) + 1;
  return input.revision;
}
export const samplePastTripRevision = (id: string) => store.get(id)?.revision ?? 1;
