import { cache } from "react";
import { randomBytes } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile, notGolfer, tripProfileId, type CurrentProfile } from "@/lib/profile/currentProfile";
import { initializeProfile } from "@/lib/profile/profileInitialization";
import { acceptResultFromJson, declineResultFromJson, invitationPreviewFromJson, type AcceptInvitationResult, type DeclineInvitationResult, type InvitationPreview, type InviteInput } from "./golfTripInvitations.ts";
import { isTripInviteCode, joinLinkFromJson, joinPreviewFromJson, joinResultFromJson, newJoinCode, type JoinLink, type JoinPreview, type JoinResult } from "./golfTripJoinLinks.ts";
import { membersForViewer } from "./golfTripMembers.ts";
import { golfTripSummaries, golfTripViewer, isGolfTripId, type GolfTripSummary, type GolfTripViewer, type SavedGolfTrip } from "./golfTripCreate.ts";
import { flightsFromRows, type GolfTripFlight } from "./golfTripFlights.ts";
import { profilePhotoUrl } from "@/lib/profile/profilePhoto";
import { importedTripFromJson, type ImportedTrip } from "./pastTripImport.ts";

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
  return getGolfTripForProfile(tripId, await getCurrentProfile());
});

/** Server-only context from the verified identity boundary, never a client profile ID. */
export async function getGolfTripForProfile(tripId: string, current: CurrentProfile): Promise<GolfTripLoad> {
  if (current.status === "signed-out") return { status: "signed-out" };
  // An account without a profile isn't on any trip. An unfinished profile may view a trip it accepted (Accounts V2).
  const profileId = tripProfileId(current);
  if (!profileId || !isGolfTripId(tripId)) return { status: "not-found" };

  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip", { p_profile: profileId, p_trip: tripId });
  if (error) throw new Error(`get_golf_trip failed: ${error.message}`);
  const saved = data as SavedGolfTrip | null;
  // Privacy at the server boundary: only the organizer gets other members' emails (lib/platform/golfTripMembers.ts).
  const trip = saved ? { ...saved, members: await withMemberPhotos(membersForViewer(saved.members, profileId), profileId) } : null;
  const viewer = trip ? golfTripViewer(trip, profileId) : null;
  return trip && viewer ? { status: "ok", trip, viewer } : { status: "not-found" };
}

/**
 * Adds each accepted member's profile photo (profile_photos.sql). Same rule as the profile page: you always see your
 * own; someone else's shows only if their profile is Public. Until profile_photos.sql / player_rounds.sql are run
 * the read fails and everyone just shows initials.
 */
export async function withMemberPhotos(members: SavedGolfTrip["members"], viewerId: string): Promise<SavedGolfTrip["members"]> {
  const ids = members.filter((m) => m.invitationStatus === "accepted" && m.profileId).map((m) => m.profileId as string);
  if (!ids.length) return members;
  const { data, error } = await createSupabaseServiceRoleClient().from("profiles").select("id, avatar_path, rounds_visibility").in("id", ids);
  if (error || !data) return members;
  const photos = new Map<string, string | null>();
  for (const row of data as { id: string; avatar_path: string | null; rounds_visibility: string | null }[]) {
    photos.set(row.id, row.id === viewerId || row.rounds_visibility === "public" ? profilePhotoUrl(row.avatar_path) : null);
  }
  return members.map((m) => (m.profileId && photos.get(m.profileId) ? { ...m, avatarUrl: photos.get(m.profileId) } : m));
}

/** An imported trip's results (supabase/golf_trip_import.sql) and their revision (golf_trip_import_edits.sql; 0 before
 *  that file is run, when results can't be fixed yet) for a member of it; null for anyone else or a trip that wasn't imported. */
export async function getImportedTrip(tripId: string, profileId: string): Promise<{ trip: ImportedTrip; revision: number } | null> {
  if (!isGolfTripId(tripId)) return null;
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip_imported_results", { p_profile: profileId, p_trip: tripId });
  if (error) {
    console.error("get_golf_trip_imported_results failed:", error.message);
    return null;
  }
  const withRevision = data && typeof data === "object" && "revision" in data ? data as { results: unknown; revision: unknown } : null;
  const trip = importedTripFromJson(withRevision ? withRevision.results : data);
  return trip ? { trip, revision: withRevision && Number.isInteger(withRevision.revision) ? withRevision.revision as number : 0 } : null;
}

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
  return getUserGolfTripsForProfile(await getCurrentProfile());
});

/** Same loader as the browser list, with explicit request-scoped verified identity. */
export async function getUserGolfTripsForProfile(current: CurrentProfile): Promise<UserGolfTrips> {
  if (current.status === "signed-out") return { status: "signed-out" };
  const profileId = tripProfileId(current);
  if (!profileId) return { status: "ok", trips: [] };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_my_golf_trips", { p_profile: profileId });
  if (error) {
    console.error("list_my_golf_trips failed:", error.message);
    return { status: "error" };
  }
  return { status: "ok", trips: golfTripSummaries(data) };
}

// --- Invitations and membership (supabase/golf_trip_invitations.sql) -------------------------------------------

type DatabaseError = Error & { code?: string };
const failure = (fn: string, error: { message: string; code?: string }): DatabaseError =>
  Object.assign(new Error(`${fn} failed: ${error.message}`), { code: error.code });

/** Organizer invites someone by name (+ optional email). Returns the invite secret ONCE (only its hash is stored);
 *  "forbidden" = not this trip's organizer (same answer for a missing trip). Throws on database errors. */
export async function inviteGolfTripMember(tripId: string, input: InviteInput):
  Promise<{ status: "ok"; memberId: string; inviteToken: string } | { status: "signed-out" | "no-profile" | "forbidden" }> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: notGolfer(current) };
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
    p_profile: tripProfileId(current), p_token: token,
  });
  if (error) {
    console.error("get_golf_trip_invitation failed:", error.message);
    return null;
  }
  return invitationPreviewFromJson(data);
}

/** The signed-in person accepts: their profile is attached to the invited member row. Safe to repeat. An unfinished
 *  profile may accept (Accounts V2); a verified account with no profile yet gets one first (initialize). */
/** `caller` = the request's verified identity (website cookie or app Bearer, Phase 7B); defaults to the cookie session. */
export async function acceptGolfTripInvitation(token: string, caller?: CurrentProfile): Promise<AcceptInvitationResult | { status: "signed-out" | "no-profile" }> {
  const current = caller ?? await getCurrentProfile();
  if (current.status === "signed-out") return { status: "signed-out" };
  let profileId = tripProfileId(current);
  if (!profileId) {
    const initialized = await initializeProfile(current.account.id);
    if (initialized.status !== "ok") return { status: "no-profile" };
    profileId = current.account.id;
  }
  const { data, error } = await createSupabaseServiceRoleClient().rpc("accept_golf_trip_invitation", { p_profile: profileId, p_token: token });
  if (error) throw failure("accept_golf_trip_invitation", error);
  return acceptResultFromJson(data);
}

/** The signed-in person holding the link says no: the row stays as "declined" with no profile; the link dies. */
export async function declineGolfTripInvitation(token: string, caller?: CurrentProfile): Promise<DeclineInvitationResult | "signed-out" | "no-profile"> {
  const current = caller ?? await getCurrentProfile();
  if (current.status === "signed-out") return "signed-out";
  const profileId = tripProfileId(current);
  if (!profileId) return "no-profile";
  const { data, error } = await createSupabaseServiceRoleClient().rpc("decline_golf_trip_invitation", { p_profile: profileId, p_token: token });
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

// --- Trip Builder: the shareable trip link (supabase/golf_trip_join_links.sql) ------------------------------------

/** The RPC isn't in this database yet (the SQL file hasn't been run). */
const notInstalled = (error: { code?: string }) => error.code === "PGRST202" || error.code === "42883" || error.code === "42P01";

/** Anyone on the trip: the current 30-minute link (a fresh one when it's missing or nearly expired). */
export async function getGolfTripJoinLink(tripId: string, origin: string):
  Promise<{ status: "ok"; link: JoinLink } | { status: "signed-out" | "not-found" | "unavailable" }> {
  const current = await getCurrentProfile();
  const profileId = tripProfileId(current);
  if (current.status === "signed-out" || !profileId) return { status: "signed-out" };
  if (!isGolfTripId(tripId)) return { status: "not-found" };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("golf_trip_join_code", { p_profile: profileId, p_trip: tripId, p_new_code: newJoinCode() });
  if (error) {
    if (notInstalled(error)) return { status: "unavailable" };
    throw failure("golf_trip_join_code", error);
  }
  const link = joinLinkFromJson(data, origin);
  return link ? { status: "ok", link } : { status: "not-found" };
}

/** Organizer only: a brand-new link; the old one stops working. */
export async function resetGolfTripJoinLink(tripId: string, origin: string):
  Promise<{ status: "ok"; link: JoinLink } | { status: "signed-out" | "forbidden" | "not-found" | "unavailable" }> {
  const current = await getCurrentProfile();
  const profileId = tripProfileId(current);
  if (current.status === "signed-out" || !profileId) return { status: "signed-out" };
  if (!isGolfTripId(tripId)) return { status: "not-found" };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("reset_golf_trip_join_code", { p_profile: profileId, p_trip: tripId, p_new_code: newJoinCode() });
  if (error) {
    if (notInstalled(error)) return { status: "unavailable" };
    if (error.code === "42501") return { status: "forbidden" };
    throw failure("reset_golf_trip_join_code", error);
  }
  const link = joinLinkFromJson(data, origin);
  return link ? { status: "ok", link } : { status: "not-found" };
}

/** What the join page shows (signed in or not). Null for an unknown/replaced link or when the SQL isn't installed.
 *  A 6-character invite code (supabase/join_codes.sql) shows the same preview; it never expires. */
export async function getGolfTripJoinPreview(code: string): Promise<JoinPreview | null> {
  const current = await getCurrentProfile();
  if (isTripInviteCode(code)) {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("find_golf_trip_by_code", { p_profile: tripProfileId(current), p_code: code });
    if (error) { if (!notInstalled(error)) console.error("find_golf_trip_by_code failed:", error.message); return null; }
    const found = data as { tripId: string; tripName: string; destination: string | null; startDate: string | null; endDate: string | null; organizerName: string | null; member: boolean } | null;
    return found && joinPreviewFromJson({ ...found, destination: found.destination ?? "", startDate: found.startDate ?? "", endDate: found.endDate ?? "", status: found.member ? "member" : "open" });
  }
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip_join_preview", { p_profile: tripProfileId(current), p_code: code });
  if (error) {
    if (!notInstalled(error)) console.error("get_golf_trip_join_preview failed:", error.message);
    return null;
  }
  return joinPreviewFromJson(data);
}

/** The signed-in person joins through the link. A verified account with no profile yet gets one first. */
export async function joinGolfTripByCode(code: string, caller?: CurrentProfile): Promise<JoinResult | { status: "signed-out" | "no-profile" }> {
  const current = caller ?? await getCurrentProfile();
  if (current.status === "signed-out") return { status: "signed-out" };
  let profileId = tripProfileId(current);
  if (!profileId) {
    const initialized = await initializeProfile(current.account.id);
    if (initialized.status !== "ok") return { status: "no-profile" };
    profileId = current.account.id;
  }
  // The 6-character invite code adds you straight in, the same as the link (supabase/join_codes.sql).
  if (isTripInviteCode(code)) {
    const before = await getGolfTripJoinPreview(code);
    if (!before) return { status: "not_found" };
    const { data, error } = await createSupabaseServiceRoleClient().rpc("join_golf_trip_by_invite_code", { p_profile: profileId, p_code: code });
    if (error) {
      if (notInstalled(error) || error.code === "22023") return { status: "not_found" };
      throw failure("join_golf_trip_by_invite_code", error);
    }
    return { status: before.status === "member" ? "already_member" : "joined", tripId: data as string };
  }
  const { data, error } = await createSupabaseServiceRoleClient().rpc("join_golf_trip_by_code", { p_profile: profileId, p_code: code });
  if (error) {
    if (notInstalled(error)) return { status: "not_found" };
    throw failure("join_golf_trip_by_code", error);
  }
  return joinResultFromJson(data);
}
