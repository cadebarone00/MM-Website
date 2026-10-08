import "server-only";
import { randomBytes } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { isPlayerId, playerAcceptResultFromJson, playerInvitationFromJson, type PlayerAcceptResult, type TournamentPlayerInvitation } from "./tournamentPlayerInvitations.ts";

/**
 * Server-side tournament player claiming (supabase/tournament_player_identity.sql). The golfer is the signed-in
 * PROFILE (getCurrentProfile → profile.profileId), never a value from the request. Never import from a client component.
 */

type DatabaseError = Error & { code?: string };
const failure = (fn: string, error: { message: string; code?: string }): DatabaseError =>
  Object.assign(new Error(`${fn} failed: ${error.message}`), { code: error.code });

/** Organizer gives an unclaimed player an invite link (a new one replaces the old). The secret is returned ONCE;
 *  "forbidden" = not an owner / organizer of that tournament, already claimed, or not found (same answer). */
export async function inviteTournamentPlayer(playerId: string): Promise<{ status: "ok"; inviteToken: string } | { status: "signed-out" | "no-profile" | "forbidden" }> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: current.status };
  if (!isPlayerId(playerId)) return { status: "forbidden" };
  const inviteToken = randomBytes(24).toString("base64url");
  const { data, error } = await createSupabaseServiceRoleClient().rpc("invite_tournament_player", { p_profile: current.profile.profileId, p_player: playerId, p_token: inviteToken });
  if (error) throw failure("invite_tournament_player", error);
  return data === true ? { status: "ok", inviteToken } : { status: "forbidden" };
}

/** What a tournament invite link shows (signed in or not). Null for an unknown or replaced link. */
export async function getTournamentPlayerInvitation(token: string): Promise<TournamentPlayerInvitation | null> {
  const current = await getCurrentProfile();
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_tournament_player_invitation", {
    p_profile: current.status === "ok" ? current.profile.profileId : null, p_token: token,
  });
  if (error) {
    console.error("get_tournament_player_invitation failed:", error.message);
    return null;
  }
  return playerInvitationFromJson(data);
}

/** The signed-in golfer claims their place: their profile is attached to that tournament player. Safe to repeat. */
export async function acceptTournamentPlayerInvitation(token: string): Promise<PlayerAcceptResult | { status: "signed-out" | "no-profile" }> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: current.status };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("accept_tournament_player_invitation", { p_profile: current.profile.profileId, p_token: token });
  if (error) throw failure("accept_tournament_player_invitation", error);
  return playerAcceptResultFromJson(data);
}
