import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { loadLegacyPlayingRows, withoutLegacyRows } from "./legacyTournaments.ts";
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
 * user is on the roster of (commissioners included — they play too). Legacy
 * tournaments' rows come live from their adapters (legacyTournaments.ts);
 * every other tournament's from list_my_active_editions.
 */
export async function loadMyPlayingTournaments(): Promise<MyPastTournaments> {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return { signedIn: false };
  const [platform, legacy] = await Promise.all([
    createSupabaseServiceRoleClient().rpc("list_my_active_editions", { p_profile: user.id }),
    loadLegacyPlayingRows(user.id).catch((error: unknown) => error instanceof Error ? error : new Error(String(error))),
  ]);
  if (platform.error) {
    console.error("list_my_active_editions failed:", platform.error.message);
    return { signedIn: true, ok: false };
  }
  if (legacy instanceof Error) {
    console.error("loadLegacyPlayingRows failed:", legacy.message);
    return { signedIn: true, ok: false };
  }
  // Same order as the database list: earliest start first, undated last, then by name.
  const tournaments = [...legacy, ...summarizeMyTournaments(withoutLegacyRows(platform.data))].sort((a, b) =>
    (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || a.name.localeCompare(b.name) || a.year - b.year);
  return { signedIn: true, ok: true, tournaments };
}

async function loadRosterList(
  fn: "list_my_past_editions",
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
