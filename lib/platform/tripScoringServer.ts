import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import type { SavedGolfTrip } from "./golfTripCreate.ts";
import { submitResultFromJson } from "./tripSubmission.ts";
import { correctionsFromJson, tripCorrectionListFromJson, type TripCorrectionList, type TripCorrections } from "./tripCorrections.ts";
import { liveTripRound, opResultsFromJson, tripGroupsPayload, tripScoringFromJson, type HoleEntryInput, type HoleOpInput, type TripRoundScoring } from "./tripScoring.ts";

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

/**
 * A round that was already played (Step 6: corrections on any later day, completed trips included), opened from Trip
 * Settings → Corrections as /golf-trips/<id>?round=<n>. Read-only load: it never saves or changes playing groups, so
 * nothing is created and no score moves to today's round; the round keeps its own date. Today's round goes through
 * loadLiveTripScoring as before; a round that hasn't come yet shows nothing. Never throws.
 */
export async function loadPlayedTripRound(trip: SavedGolfTrip, roundNumber: number, today = new Date().toISOString().slice(0, 10)): Promise<TripScoringLoad> {
  const round = trip.rounds.find((r) => r.roundNumber === roundNumber);
  if (!round?.playDate || round.playDate > today) return { status: "none" };
  if (round.playDate === today) return loadLiveTripScoring(trip, today);
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: "none" };
  const scoring = await getTripRoundScoring(current.profile.profileId, trip.trip.id, roundNumber);
  if (scoring === "failed") return { status: "unavailable" };
  if (!scoring || scoring.groups.length === 0) return { status: "none" };
  return { status: "ok", tripId: trip.trip.id, profileId: current.profile.profileId, scoring };
}

/** Database errors → what the API answers (the function's own messages are safe to show). */
export function scoringFailure(error: { code?: string; message?: string }): { status: number; error: string; reason?: "locked" } {
  // A submitted card is locked: the phone stops resending changes to it (they stay on the phone).
  if (error.code === "42501" && error.message === "That card is already submitted.") return { status: 403, error: error.message, reason: "locked" };
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

/** One trip round's groups and entries for a member (live sync refresh). Null when not on the trip or the round is missing. */
export async function getTripRoundScoring(profileId: string, tripId: string, roundNumber: number): Promise<TripRoundScoring | null | "failed"> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_trip_round_scoring", { p_profile: profileId, p_trip: tripId, p_round_number: roundNumber });
  if (error) { console.error("get_trip_round_scoring failed:", error.message); return "failed"; }
  return data === null ? null : tripScoringFromJson(data) ?? "failed";
}

/**
 * Save queued ops (Step 4 offline scoring, supabase/golf_trip_scoring_offline.sql): each is applied once, or answered
 * "conflict" when the saved score moved on since the phone last saw it.
 */
export async function saveTripHoleOps(profileId: string, groupId: string, scoredProfileId: string, ops: HoleOpInput[]) {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("save_hole_score_ops",
    { p_profile: profileId, p_group: groupId, p_scored: scoredProfileId, p_ops: ops });
  if (error) return { ok: false as const, ...scoringFailure(error) };
  const answer = opResultsFromJson(data);
  return answer ? { ok: true as const, ...answer } : { ok: false as const, status: 500, error: "Couldn't save the score. Try again." };
}

/**
 * Submit the signed-in golfer's own card (Step 5, supabase/golf_trip_scoring_submission.sql). The database checks
 * completeness, the attester match and the card version under the same lock as score writes, then locks the card.
 */
export async function submitTripScorecard(profileId: string, groupId: string, golferProfileId: string, cardVersion: number) {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("submit_trip_scorecard",
    { p_profile: profileId, p_group: groupId, p_golfer: golferProfileId, p_card_version: cardVersion });
  if (error) return { ok: false as const, ...scoringFailure(error) };
  const result = submitResultFromJson(data);
  return result ? { ok: true as const, result } : { ok: false as const, status: 500, error: "Couldn't submit the card. Try again." };
}

// --- Step 6: corrections (supabase/golf_trip_scoring_corrections.sql) -------------------------------------------

/** A trip round's correction requests and submission history. Null when not installed / not on the trip (never throws). */
export async function getScorecardCorrections(profileId: string, tripId: string, roundNumber: number): Promise<TripCorrections | null> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_scorecard_corrections", { p_profile: profileId, p_trip: tripId, p_round_number: roundNumber });
  if (error) { console.error("get_scorecard_corrections failed:", error.message); return null; }
  return correctionsFromJson(data);
}

/** Trip Settings → Corrections: every round and every request this golfer may see, on any day. Null when not installed / not on the trip. */
export async function listTripCorrections(profileId: string, tripId: string): Promise<TripCorrectionList | null> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_trip_corrections", { p_profile: profileId, p_trip: tripId });
  if (error) { console.error("list_trip_corrections failed:", error.message); return null; }
  return tripCorrectionListFromJson(data);
}

/** The golfer asks to correct their own submitted card. */
export async function requestScorecardCorrection(profileId: string, groupId: string, golferProfileId: string, holes: number[], reason: string) {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("request_scorecard_correction",
    { p_profile: profileId, p_group: groupId, p_golfer: golferProfileId, p_holes: holes, p_reason: reason });
  if (error) return { ok: false as const, ...scoringFailure(error) };
  return { ok: true as const, status: (data as { status?: string })?.status ?? "requested" };
}

/** The trip organizer (or, for the organizer's own card, their attester) approves (reopens that card) or denies (with a reason). */
export async function decideScorecardCorrection(profileId: string, requestId: string, approve: boolean, note: string | null) {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("decide_scorecard_correction",
    { p_profile: profileId, p_request: requestId, p_approve: approve, p_note: note });
  if (error) return { ok: false as const, ...scoringFailure(error) };
  return { ok: true as const, status: (data as { status?: string })?.status ?? "decided" };
}
