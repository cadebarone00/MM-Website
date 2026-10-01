import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { summarizeMyTournaments, summarizePastEditions, type PastTournament } from "./pastTournaments.ts";

export type MyPastTournaments =
  | { signedIn: false }
  | { signedIn: true; ok: true; tournaments: PastTournament[] }
  | { signedIn: true; ok: false };

/**
 * The signed-in user's finished tournaments. The user id comes from the
 * session only (never the request).
 */
export function loadMyPastTournaments(): Promise<MyPastTournaments> {
  return loadRosterList("list_my_past_editions", summarizePastEditions);
}

/**
 * My Tournaments (/tournaments/mine): the unfinished tournaments the signed-in
 * user is on the roster of (commissioners included — they play too).
 */
export function loadMyPlayingTournaments(): Promise<MyPastTournaments> {
  return loadRosterList("list_my_active_editions", summarizeMyTournaments);
}

async function loadRosterList(
  fn: "list_my_past_editions" | "list_my_active_editions",
  summarize: (raw: unknown) => PastTournament[],
): Promise<MyPastTournaments> {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return { signedIn: false };
  const { data, error } = await createSupabaseServiceRoleClient().rpc(fn, { p_profile: user.id });
  if (error) {
    console.error(`${fn} failed:`, error.message);
    return { signedIn: true, ok: false };
  }
  return { signedIn: true, ok: true, tournaments: summarize(data) };
}
