import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ProfileId } from "@/lib/profile/profileIdentity";
import type { PlayerRound } from "./playerRounds.ts";
import { DEFAULT_ROUNDS_VISIBILITY, type RoundsVisibility } from "./playerRoundsPrivacy.ts";
import { playerRoundPayload, playerRoundsFromJson } from "./playerRoundsRows.ts";

/**
 * Server-side player rounds (supabase/player_rounds.sql). Rounds belong to the golfer's PROFILE (player_rounds.profile_id
 * → profiles.id). Callers pass `getCurrentProfile()`'s `profile.profileId` — from the signed-in session, never the request. Never import this from a client component.
 * Reads never throw: until the SQL is run, rounds are "unavailable" and privacy shows the default.
 */

export type MyPlayerRounds = { status: "ok"; rounds: PlayerRound[] } | { status: "unavailable" };

export async function getMyPlayerRounds(profileId: ProfileId): Promise<MyPlayerRounds> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_my_player_rounds", { p_profile: profileId });
  if (error) {
    console.error("list_my_player_rounds failed:", error.message);
    return { status: "unavailable" };
  }
  return { status: "ok", rounds: playerRoundsFromJson(data) };
}

/** Saves once; a second save of the same round returns the one already saved. Throws if the database refuses it. */
export async function saveMyPlayerRound(profileId: ProfileId, round: PlayerRound, sourceLabel: string | null): Promise<{ saved: boolean; round: PlayerRound }> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("save_player_round", { p_profile: profileId, p_round: playerRoundPayload(round, sourceLabel) });
  if (error) throw new Error(`save_player_round failed: ${error.message}`);
  const [stored] = playerRoundsFromJson([(data as { round?: unknown } | null)?.round]);
  if (!stored) throw new Error("save_player_round returned no round.");
  return { saved: Boolean((data as { saved?: boolean }).saved), round: stored };
}

export type MyRoundsVisibility = { status: "ok"; visibility: RoundsVisibility } | { status: "unavailable"; visibility: RoundsVisibility };

export async function getMyRoundsVisibility(profileId: ProfileId): Promise<MyRoundsVisibility> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_rounds_visibility", { p_profile: profileId });
  if (error) {
    console.error("get_rounds_visibility failed:", error.message);
    return { status: "unavailable", visibility: DEFAULT_ROUNDS_VISIBILITY };
  }
  return { status: "ok", visibility: data === "public" ? "public" : "private" };
}

/** "not-installed" = player_rounds.sql hasn't been run in this database yet. */
export async function setMyRoundsVisibility(profileId: ProfileId, visibility: RoundsVisibility): Promise<"ok" | "not-installed" | "failed"> {
  const { error } = await createSupabaseServiceRoleClient().rpc("set_rounds_visibility", { p_profile: profileId, p_visibility: visibility });
  if (!error) return "ok";
  if (error.code === "PGRST202" || error.code === "42883") return "not-installed";
  console.error("set_rounds_visibility failed:", error.message);
  return "failed";
}
