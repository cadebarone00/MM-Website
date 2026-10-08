import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import type { SavedGolfTrip } from "./golfTripCreate.ts";
import { liveTripRound, tripGroupsPayload, tripScoringFromJson, type HoleEntryInput, type TripRoundScoring } from "./tripScoring.ts";

/**
 * Server-side saved-trip scoring (supabase/golf_trip_scoring.sql). The golfer typing is always the signed-in profile,
 * never a value from the request. Never import this from a client component.
 */

export type TripScoringLoad =
  /** No round today, too few players, or not signed in: the trip page shows no Scoring sheet. */
  | { status: "none" }
  /** golf_trip_scoring.sql not installed or the database failed: the page still loads, without scoring. */
  | { status: "unavailable" }
  | { status: "ok"; tripId: string; profileId: string; scoring: TripRoundScoring };

/**
 * Today's trip round, ready to score. The first member to open it saves the playing groups (in member order, with
 * attesters); after that the saved groups come back unchanged, and once anyone has entered a score they never change.
 * `today` is the server's date (YYYY-MM-DD). Never throws.
 */
export async function loadLiveTripScoring(trip: SavedGolfTrip, today = new Date().toISOString().slice(0, 10)): Promise<TripScoringLoad> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: "none" };
  const round = liveTripRound(trip.rounds, today);
  if (!round) return { status: "none" };
  let groups: ReturnType<typeof tripGroupsPayload>;
  try { groups = tripGroupsPayload(trip.members); } catch { return { status: "none" }; }
  const { data, error } = await createSupabaseServiceRoleClient().rpc("save_trip_scoring_groups",
    { p_profile: current.profile.profileId, p_trip: trip.trip.id, p_round_number: round.roundNumber, p_groups: groups });
  const scoring = error ? null : tripScoringFromJson(data);
  if (!scoring) {
    console.error("save_trip_scoring_groups failed:", error?.message ?? "unexpected answer");
    return { status: "unavailable" };
  }
  return { status: "ok", tripId: trip.trip.id, profileId: current.profile.profileId, scoring };
}

/** Database errors → what the API answers (the function's own messages are safe to show). */
export function scoringFailure(error: { code?: string; message?: string }): { status: number; error: string } {
  if (error.code === "42501") return { status: 403, error: error.message ?? "You can't change that score." };
  if (error.code === "P0002") return { status: 404, error: "Round not found." };
  if (error.code === "22023") return { status: 400, error: error.message ?? "Check the hole scores." };
  return { status: 500, error: "Couldn't save the score. Try again." };
}

/** Save hole entries typed by the signed-in golfer for `scoredProfileId` (themselves or the golfer they attest). */
export async function saveTripHoleScores(profileId: string, groupId: string, scoredProfileId: string, clientUpdatedAt: string, entries: HoleEntryInput[]) {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("save_hole_scores",
    { p_profile: profileId, p_group: groupId, p_scored: scoredProfileId, p_client_updated_at: clientUpdatedAt, p_entries: entries });
  if (error) return { ok: false as const, ...scoringFailure(error) };
  const scoring = tripScoringFromJson(data);
  return scoring ? { ok: true as const, scoring } : { ok: false as const, status: 500, error: "Couldn't save the score. Try again." };
}
