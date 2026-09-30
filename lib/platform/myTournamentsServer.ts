import { cache } from "react";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { summarizeManagedEditions, type TournamentSummary } from "./myTournaments.ts";

export type MyTournaments =
  | { signedIn: false }
  | { signedIn: true; ok: true; tournaments: TournamentSummary[] }
  | { signedIn: true; ok: false };

/**
 * The signed-in user's My Tournaments list. The user id comes from the
 * session only (never the request), and list_managed_editions returns just
 * that profile's owner/organizer memberships.
 */
export const loadMyTournaments = cache(async (): Promise<MyTournaments> => {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return { signedIn: false };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_managed_editions", { p_profile: user.id });
  if (error) {
    console.error("list_managed_editions failed:", error.message);
    return { signedIn: true, ok: false };
  }
  return { signedIn: true, ok: true, tournaments: summarizeManagedEditions(data) };
});
