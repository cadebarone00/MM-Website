import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { profileIdentityFromRow, type ProfileId, type ProfileIdentity } from "./profileIdentity";

/**
 * "What profile does this signed-in account control?" — the one place to ask. The account comes from the session
 * only (never the request); the profile is the row whose id is that account's id (lib/profile/profileIdentity.ts).
 * New golf / product code should take `profile.profileId` from here rather than using `user.id` directly.
 *
 * Accounts V2 (supabase/profile_initialization.sql): a profile row can exist before setup is finished. That state is
 * "incomplete" and deliberately carries NO `profile`, so code written for golfers can't use it by accident. Only the
 * places allowed for unfinished profiles (accepting / viewing a Golf Trip) read its `profileId`, via tripProfileId().
 */
export type CurrentProfile =
  | { status: "signed-out" }
  /** Logged in, no profile row yet. Treat as "finish your profile" (initialization creates it); never guess one. */
  | { status: "no-profile"; account: User }
  /** Profile row exists, but no username or display name yet (setup not finished). */
  | { status: "incomplete"; account: User; profileId: ProfileId; displayName: string | null }
  | { status: "ok"; account: User; profile: ProfileIdentity };

const filled = (value: unknown) => typeof value === "string" && value.trim() !== "";

/** Deletion requested or done for this account (supabase/account_deletion.sql)? False until that file is installed. */
async function isClosedAccount(accountId: string): Promise<boolean> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("account_deletion_state", { p_account: accountId });
  return !error && !!((data ?? {}) as { state?: string | null }).state;
}

export const getCurrentProfile = cache(async (): Promise<CurrentProfile> => {
  return loadCurrentProfile(await createSupabaseServerClient());
});

/** Explicit request boundary for selected APIs; never caches an identity across requests. */
export async function getCurrentProfileForRequest(request: Request): Promise<CurrentProfile> {
  return loadCurrentProfile(await createSupabaseServerClient(request), true);
}

async function loadCurrentProfile(supabase: SupabaseClient, strict = false): Promise<CurrentProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "signed-out" };
  // Own row only (RLS profiles_select_own: auth.uid() = id).
  const { data: row, error } = await supabase.from("profiles").select("id, display_name, username, email, player_slug").eq("id", user.id).maybeSingle();
  if (strict && error) throw new Error("Profile lookup unavailable.");
  const profile = profileIdentityFromRow(row);
  // A closed account (deletion requested or done; supabase/account_deletion.sql) can't read its own row any more:
  // treat it as signed out, never as "finish your profile".
  if (!profile) return (await isClosedAccount(user.id)) ? { status: "signed-out" } : { status: "no-profile", account: user };
  if (!filled(row?.username) || !filled(row?.display_name)) {
    return { status: "incomplete", account: user, profileId: profile.profileId, displayName: filled(row?.display_name) ? String(row?.display_name) : null };
  }
  return { status: "ok", account: user, profile };
}

/** For "not a finished golfer" answers: an unfinished profile gets the same reply as a missing one. */
export function notGolfer(current: Exclude<CurrentProfile, { status: "ok" }>): "signed-out" | "no-profile" {
  return current.status === "signed-out" ? "signed-out" : "no-profile";
}

/** The profile id allowed to accept / view Golf Trips: finished or unfinished profiles (requirement: trip invites work
 *  before setup is done; scoring and competition still need a finished profile). Null when there is no profile row. */
export function tripProfileId(current: CurrentProfile): ProfileId | null {
  if (current.status === "ok") return current.profile.profileId;
  if (current.status === "incomplete") return current.profileId;
  return null;
}
