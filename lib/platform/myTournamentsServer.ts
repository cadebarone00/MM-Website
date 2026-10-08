import { cache } from "react";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { summarizeManagedEditions, type TournamentSummary } from "./myTournaments.ts";

export type MyTournaments =
  | { signedIn: false }
  | { signedIn: true; ok: true; tournaments: TournamentSummary[] }
  | { signedIn: true; ok: false };

/**
 * The signed-in golfer's My Tournaments list. The profile comes from the
 * session only (getCurrentProfile, never the request), and list_managed_editions
 * returns just that profile's owner/organizer memberships.
 */
export const loadMyTournaments = cache(async (): Promise<MyTournaments> => {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return { signedIn: false };
  // An account without a profile is no golfer in any tournament.
  if (current.status === "no-profile") return { signedIn: true, ok: true, tournaments: [] };
  const profileId = current.profile.profileId;
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_managed_editions", { p_profile: profileId });
  if (error) {
    console.error("list_managed_editions failed:", error.message);
    return { signedIn: true, ok: false };
  }
  return { signedIn: true, ok: true, tournaments: summarizeManagedEditions(data) };
});
