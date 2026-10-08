import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { loadLegacyPastRows, loadLegacyPlayingRows, withoutLegacyRows } from "./legacyTournaments.ts";
import { summarizeMyTournaments, summarizePastEditions, type PastTournament } from "./pastTournaments.ts";

export type MyPastTournaments =
  | { signedIn: false }
  | { signedIn: true; ok: true; tournaments: PastTournament[] }
  | { signedIn: true; ok: false };

/**
 * The signed-in golfer's finished tournaments (through their profile: tournament_players.profile_id).
 * The profile comes from the session only (getCurrentProfile, never the request). Legacy tournaments' rows come live from
 * their adapters (legacyTournaments.ts) and open their /play home.
 */
export async function loadMyPastTournaments(): Promise<MyPastTournaments> {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return { signedIn: false };
  // An account without a profile is no golfer in any tournament.
  if (current.status === "no-profile") return { signedIn: true, ok: true, tournaments: [] };
  const profileId = current.profile.profileId;
  const [platform, legacy] = await Promise.all([
    createSupabaseServiceRoleClient().rpc("list_my_past_editions", { p_profile: profileId }),
    loadLegacyPastRows(profileId).catch((error: unknown) => error instanceof Error ? error : new Error(String(error))),
  ]);
  if (platform.error) {
    console.error("list_my_past_editions failed:", platform.error.message);
    return { signedIn: true, ok: false };
  }
  if (legacy instanceof Error) {
    console.error("loadLegacyPastRows failed:", legacy.message);
    return { signedIn: true, ok: false };
  }
  // Newest first, like the database list.
  const tournaments = [...legacy, ...summarizePastEditions(withoutLegacyRows(platform.data))].sort((a, b) =>
    (b.endDate ?? b.startDate ?? String(b.year)).localeCompare(a.endDate ?? a.startDate ?? String(a.year)) || a.name.localeCompare(b.name));
  return { signedIn: true, ok: true, tournaments };
}

/**
 * My Tournaments (/tournaments/mine): the unfinished tournaments the signed-in
 * user is on the roster of (commissioners included — they play too). Legacy
 * tournaments' rows come live from their adapters (legacyTournaments.ts);
 * every other tournament's from list_my_active_editions.
 */
export async function loadMyPlayingTournaments(): Promise<MyPastTournaments> {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return { signedIn: false };
  // An account without a profile is no golfer in any tournament.
  if (current.status === "no-profile") return { signedIn: true, ok: true, tournaments: [] };
  const profileId = current.profile.profileId;
  const [platform, legacy] = await Promise.all([
    createSupabaseServiceRoleClient().rpc("list_my_active_editions", { p_profile: profileId }),
    loadLegacyPlayingRows(profileId).catch((error: unknown) => error instanceof Error ? error : new Error(String(error))),
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

