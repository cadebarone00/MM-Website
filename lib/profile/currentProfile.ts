import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileIdentityFromRow, type ProfileIdentity } from "./profileIdentity";

/**
 * "What profile does this signed-in account control?" — the one place to ask. The account comes from the session
 * only (never the request); the profile is the row whose id is that account's id (lib/profile/profileIdentity.ts).
 * New golf / product code should take `profile.profileId` from here rather than using `user.id` directly.
 */
export type CurrentProfile =
  | { status: "signed-out" }
  /** Logged in, but the profile row is missing (signup stopped half-way). Treat as "finish your profile", never guess one. */
  | { status: "no-profile"; account: User }
  | { status: "ok"; account: User; profile: ProfileIdentity };

export const getCurrentProfile = cache(async (): Promise<CurrentProfile> => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "signed-out" };
  // Own row only (RLS profiles_select_own: auth.uid() = id).
  const { data: row } = await supabase.from("profiles").select("id, display_name, username, email, player_slug").eq("id", user.id).maybeSingle();
  const profile = profileIdentityFromRow(row);
  return profile ? { status: "ok", account: user, profile } : { status: "no-profile", account: user };
});
