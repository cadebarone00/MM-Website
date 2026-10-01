import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getProfileOverrides, mergeProfile } from "@/lib/data/players/overrides";
import { getPlayerStatsByYear } from "@/lib/data/stats";
import { summarizePastEditions, type PastTournament } from "@/lib/platform/pastTournaments";
import {
  careerStats, initialsFor, maroonYearsPlayed, memberSinceLabel, mergeCompleted, playerFullName, profileDisplayName, teamsPlayed, type MyProfile,
} from "./myProfile";

/** A platform list, or empty if its SQL isn't installed yet or fails. */
async function platformList(fn: "list_my_active_editions" | "list_my_past_editions", profileId: string): Promise<PastTournament[]> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc(fn, { p_profile: profileId });
  if (error) {
    console.error(`${fn} failed:`, error.message);
    return [];
  }
  return summarizePastEditions(data);
}

/**
 * Everything /profile shows for the signed-in person, or null if signed out.
 * The user id comes from the session only (never the request).
 */
export async function loadMyProfile(): Promise<MyProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase.from("profiles").select("player_slug, display_name, username, email").eq("id", user.id).single();
  const playerSlug: string | null = row?.player_slug ?? null;

  let fullName: string | null = null;
  let avatarSrc: string | null = null;
  let bio: string | null = null;
  if (playerSlug) {
    const { data: slot } = await createSupabaseServiceRoleClient().from("player_slots").select("full_name").eq("player_slug", playerSlug).single();
    const staticProfile = getPlayerProfileBySlug(playerSlug);
    fullName = playerFullName(slot?.full_name, staticProfile?.fullName);
    avatarSrc = staticProfile?.avatarSrc ?? null;
    const base = staticProfile ?? { id: playerSlug, slug: playerSlug, fullName: fullName ?? playerSlug, avatarSrc: null, bio: "", history: [] };
    bio = mergeProfile(base, await getProfileOverrides(playerSlug)).bio?.trim() || null;
  }

  const [active, platformPast] = await Promise.all([
    platformList("list_my_active_editions", user.id),
    platformList("list_my_past_editions", user.id),
  ]);
  const name = profileDisplayName({ fullName, displayName: row?.display_name, username: row?.username, email: row?.email ?? user.email });
  const stats = playerSlug ? careerStats(getPlayerStatsByYear(playerSlug)) : null;

  return {
    name,
    initials: initialsFor(name),
    avatarSrc,
    memberSince: memberSinceLabel(user.created_at),
    canEditBio: Boolean(playerSlug),
    teams: teamsPlayed(playerSlug),
    active,
    completed: mergeCompleted(maroonYearsPlayed(playerSlug), platformPast),
    stats,
    statsHref: stats && playerSlug ? `/teams/stats/players/${(getPlayerProfileBySlug(playerSlug)?.id ?? playerSlug).toLowerCase()}` : null,
    bio,
  };
}
