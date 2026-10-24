import "server-only";
import { getCurrentProfileForRequest, tripProfileId } from "@/lib/profile/currentProfile";
import { getGolfTripForProfile, getUserGolfTripsForProfile } from "./golfTripsServer";
import { loadSavedTripSetup } from "./savedTripSetupServer";
import type { GolfTripSummary } from "./golfTripCreate";

const headers = { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" };
const failure = (status: number, code: string, error: string) => Response.json({ ok: false, code, error }, { status, headers });

/** Explicit allowlist: additional database/RPC fields must never expand the API. */
const summary = (trip: GolfTripSummary) => ({
  id: trip.id, name: trip.name, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate,
  status: trip.status, expectedTravelerCount: trip.expectedTravelerCount, memberCount: trip.memberCount, role: trip.role,
});

export async function golfTripListResponse(request: Request): Promise<Response> {
  try {
    const current = await getCurrentProfileForRequest(request);
    if (current.status === "signed-out") return failure(401, "unauthorized", "Sign in to view your trips.");
    if (!tripProfileId(current)) return failure(403, "profile_required", "Set up your profile first.");
    const result = await getUserGolfTripsForProfile(current);
    if (result.status !== "ok") return failure(503, "unavailable", "Trips are temporarily unavailable.");
    return Response.json({ ok: true, trips: result.trips.map(summary) }, { headers });
  } catch {
    return failure(503, "unavailable", "Trips are temporarily unavailable.");
  }
}

export async function golfTripDetailResponse(request: Request, tripId: string): Promise<Response> {
  try {
    const current = await getCurrentProfileForRequest(request);
    if (current.status === "signed-out") return failure(401, "unauthorized", "Sign in to view your trips.");
    if (!tripProfileId(current)) return failure(403, "profile_required", "Set up your profile first.");
    const result = await getGolfTripForProfile(tripId, current);
    if (result.status !== "ok") return failure(404, "not_found", "Trip not found.");
    const { trip: saved, viewer } = result;
    const { trip } = saved;
    // Load optional setup only AFTER membership authorization; missing table uses the browser fallback.
    const setup = await loadSavedTripSetup(saved);
    return Response.json({
      ok: true,
      trip: { id: trip.id, name: trip.name, destination: trip.destination, startDate: trip.start_date,
        endDate: trip.end_date, status: trip.status, expectedTravelerCount: trip.expected_traveler_count },
      viewer: { role: viewer.role },
      members: saved.members.filter(member => member.profileId && member.invitationStatus === "accepted")
        .map(member => ({ displayName: member.displayName, role: member.role })),
      rounds: saved.rounds.map(round => ({ roundNumber: round.roundNumber, dayNumber: round.dayNumber,
        playDate: round.playDate, courseName: round.courseName })),
      setup: { available: setup.available },
    }, { headers });
  } catch {
    return failure(503, "unavailable", "Trip is temporarily unavailable.");
  }
}
