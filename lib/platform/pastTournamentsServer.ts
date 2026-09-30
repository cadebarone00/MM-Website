import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { summarizePastEditions, type PastTournament } from "./pastTournaments.ts";

export type MyPastTournaments =
  | { signedIn: false }
  | { signedIn: true; ok: true; tournaments: PastTournament[] }
  | { signedIn: true; ok: false };

/**
 * The signed-in user's finished tournaments. The user id comes from the
 * session only (never the request).
 */
export async function loadMyPastTournaments(): Promise<MyPastTournaments> {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return { signedIn: false };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_my_past_editions", { p_profile: user.id });
  if (error) {
    console.error("list_my_past_editions failed:", error.message);
    return { signedIn: true, ok: false };
  }
  return { signedIn: true, ok: true, tournaments: summarizePastEditions(data) };
}
