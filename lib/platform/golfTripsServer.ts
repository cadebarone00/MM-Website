import { cache } from "react";
import { randomBytes } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { acceptResultFromJson, declineResultFromJson, invitationPreviewFromJson, type AcceptInvitationResult, type DeclineInvitationResult, type InvitationPreview, type InviteInput } from "./golfTripInvitations.ts";
import { membersForViewer } from "./golfTripMembers.ts";
import { golfTripSummaries, golfTripViewer, isGolfTripId, type GolfTripSummary, type GolfTripViewer, type SavedGolfTrip } from "./golfTripCreate.ts";
import { flightsFromRows, type GolfTripFlight } from "./golfTripFlights.ts";

/**
 * Server-side Golf Trips (supabase/golf_trips.sql, golf_trip_invitations.sql). The golfer is the signed-in
 * PROFILE (getCurrentProfile -> profile.profileId), never a value from the request; a trip member is that profile's
 * golf_trip_members row. The database functions only return trips that profile belongs to. Never import this
 * from a client component.
 */

export type GolfTripLoad =
  | { status: "signed-out" }
  | { status: "not-found" }
  | { status: "ok"; trip: SavedGolfTrip; viewer: GolfTripViewer };

/** One saved trip plus the signed-in person's role on it. A stranger gets "not-found", same as a missing trip. */
export const getGolfTrip = cache(async (tripId: string): Promise<GolfTripLoad> => {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return { status: "signed-out" };
  // An account without a profile isn't a golfer on any trip.
  if (current.status === "no-profile" || !isGolfTripId(tripId)) return { status: "not-found" };
  const profileId = current.profile.profileId;

  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip", { p_profile: profileId, p_trip: tripId });
  if (error) throw new Error(`get_golf_trip failed: ${error.message}`);
  const saved = data as SavedGolfTrip | null;
  // Privacy at the server boundary: only the organizer gets other members' emails (lib/platform/golfTripMembers.ts).
  const trip = saved ? { ...saved, members: membersForViewer(saved.members, profileId) } : null;
  const viewer = trip ? golfTripViewer(trip, profileId) : null;
  return trip && viewer ? { status: "ok", trip, viewer } : { status: "not-found" };
});

export type MyGolfTripFlights =
  | { status: "ok"; flights: GolfTripFlight[] }
  /** Not signed in, not on the trip, or golf_trip_flights.sql not installed: the trip page still loads, flights just don't show. */
  | { status: "unavailable" };

/** The signed-in person's own flights on this trip (supabase/golf_trip_flights.sql). Never throws. */
export const getMyGolfTripFlights = cache(async (tripId: string): Promise<MyGolfTripFlights> => {
  const current = await getCurrentProfile();
  if (current.status !== "ok" || !isGolfTripId(tripId)) return { status: "unavailable" };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_my_golf_trip_flights", { p_profile: current.profile.profileId, p_trip: tripId });
  if (error) {
    console.error("list_my_golf_trip_flights failed:", error.message);
    return { status: "unavailable" };
  }
  return data === null ? { status: "unavailable" } : { status: "ok", flights: flightsFromRows(data) };
});

export type UserGolfTrips =
  | { status: "signed-out" }
  | { status: "error" }
  | { status: "ok"; trips: GolfTripSummary[] };

/** Every Golf Trip the signed-in person is on (organizer or member), soonest first: the data for My Trips. */
export const getUserGolfTrips = cache(async (): Promise<UserGolfTrips> => {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return { status: "signed-out" };
  if (current.status === "no-profile") return { status: "ok", trips: [] };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_my_golf_trips", { p_profile: current.profile.profileId });
  if (error) {
    console.error("list_my_golf_trips failed:", error.message);
    return { status: "error" };
  }
  return { status: "ok", trips: golfTripSummaries(data) };
});

// --- Invitations and membership (supabase/golf_trip_invitations.sql) -------------------------------------------

type DatabaseError = Error & { code?: string };
const failure = (fn: string, error: { message: string; code?: string }): DatabaseError =>
  Object.assign(new Error(`${fn} failed: ${error.message}`), { code: error.code });

/** Organizer invites someone by name (+ optional email). Returns the invite secret ONCE (only its hash is stored);
 *  "forbidden" = not this trip's organizer (same answer for a missing trip). Throws on database errors. */
export async function inviteGolfTripMember(tripId: string, input: InviteInput):
  Promise<{ status: "ok"; memberId: string; inviteToken: string } | { status: "signed-out" | "no-profile" | "forbidden" }> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: current.status };
  if (!isGolfTripId(tripId)) return { status: "forbidden" };
  const inviteToken = randomBytes(24).toString("base64url");
  const { data, error } = await createSupabaseServiceRoleClient().rpc("invite_golf_trip_member", {
    p_profile: current.profile.profileId, p_trip: tripId, p_input: input, p_token: inviteToken,
  });
  if (error) throw failure("invite_golf_trip_member", error);
  const memberId = (data as { memberId?: unknown } | null)?.memberId;
  return typeof memberId === "string" ? { status: "ok", memberId, inviteToken } : { status: "forbidden" };
}

/** What an invite link shows (signed in or not). Null for an unknown or cancelled invitation. */
export async function getGolfTripInvitation(token: string): Promise<InvitationPreview | null> {
  const current = await getCurrentProfile();
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip_invitation", {
    p_profile: current.status === "ok" ? current.profile.profileId : null, p_token: token,
  });
  if (error) {
    console.error("get_golf_trip_invitation failed:", error.message);
    return null;
  }
  return invitationPreviewFromJson(data);
}

/** The signed-in golfer accepts: their profile is attached to the invited member row. Safe to repeat. */
export async function acceptGolfTripInvitation(token: string): Promise<AcceptInvitationResult | { status: "signed-out" | "no-profile" }> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: current.status };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("accept_golf_trip_invitation", { p_profile: current.profile.profileId, p_token: token });
  if (error) throw failure("accept_golf_trip_invitation", error);
  return acceptResultFromJson(data);
}

/** The signed-in person holding the link says no: the row stays as "declined" with no profile; the link dies. */
export async function declineGolfTripInvitation(token: string): Promise<DeclineInvitationResult | "signed-out" | "no-profile"> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return current.status;
  const { data, error } = await createSupabaseServiceRoleClient().rpc("decline_golf_trip_invitation", { p_profile: current.profile.profileId, p_token: token });
  if (error) throw failure("decline_golf_trip_invitation", error);
  return declineResultFromJson(data);
}

/** Organizer replaces an unaccepted invitation's link (same row; the old link stops working). Returns the new
 *  secret ONCE, or null when not allowed (not the organizer, already accepted, or not found). */
export async function regenerateGolfTripInvite(tripId: string, memberId: string): Promise<{ inviteToken: string } | null | "signed-out"> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return "signed-out";
  if (!isGolfTripId(tripId) || !isGolfTripId(memberId)) return null;
  const inviteToken = randomBytes(24).toString("base64url");
  const { data, error } = await createSupabaseServiceRoleClient().rpc("regenerate_golf_trip_invite", {
    p_profile: current.profile.profileId, p_trip: tripId, p_member: memberId, p_token: inviteToken,
  });
  if (error) throw failure("regenerate_golf_trip_invite", error);
  return data === true ? { inviteToken } : null;
}

/** Organizer removes a member or cancels an invitation. False = not allowed or not found (same answer). */
export async function removeGolfTripMember(tripId: string, memberId: string): Promise<boolean | "signed-out"> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return "signed-out";
  if (!isGolfTripId(tripId) || !isGolfTripId(memberId)) return false;
  const { data, error } = await createSupabaseServiceRoleClient().rpc("remove_golf_trip_member", { p_profile: current.profile.profileId, p_trip: tripId, p_member: memberId });
  if (error) throw failure("remove_golf_trip_member", error);
  return data === true;
}

/** A member leaves the trip themselves (the organizer can't). False = not on the trip. */
export async function leaveGolfTrip(tripId: string): Promise<boolean | "signed-out"> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return "signed-out";
  if (!isGolfTripId(tripId)) return false;
  const { data, error } = await createSupabaseServiceRoleClient().rpc("leave_golf_trip", { p_profile: current.profile.profileId, p_trip: tripId });
  if (error) throw failure("leave_golf_trip", error);
  return data === true;
}
