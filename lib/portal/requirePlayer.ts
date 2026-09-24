import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug, getPlayerFirstName } from "@/lib/data/players";

export interface PlayerSession {
  userId: string;
  playerSlug: string;
  playerFullName: string;
  playerFirstName: string;
}

/**
 * Name fields for a player with no hand-written file: the full name saved on
 * their player_slots row, or the slug if none is saved.
 */
export function identityFromSlot(
  playerSlug: string,
  fullName: string | null
): { playerFullName: string; playerFirstName: string } {
  const name = fullName?.trim() || playerSlug;
  return { playerFullName: name, playerFirstName: name.split(/\s+/)[0] };
}

/**
 * Server-side guard for player-only actions (score entry, handicap, bio
 * edits). Returns null if there's no session or the account isn't linked to
 * a player slot — callers should treat null as "respond 401", never fall
 * back to a client-supplied name.
 *
 * A hand-written player (lib/data/players/*.ts) gets exactly the identity it
 * always did. A dynamically-added player has no such file: profiles.player_slug
 * is only ever set server-side (sign-up claim, or Tiger's invite) and is a
 * foreign key into player_slots, so a non-null slug is always a real
 * player_slots row — their name comes from that row instead.
 */
export async function requirePlayer(): Promise<PlayerSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("player_slug").eq("id", user.id).single();
  if (!profile?.player_slug) return null;

  const playerProfile = getPlayerProfileBySlug(profile.player_slug);
  if (playerProfile) {
    return {
      userId: user.id,
      playerSlug: profile.player_slug,
      playerFullName: playerProfile.fullName,
      playerFirstName: getPlayerFirstName(playerProfile.slug),
    };
  }

  const service = createSupabaseServiceRoleClient();
  const { data: slot } = await service
    .from("player_slots")
    .select("full_name")
    .eq("player_slug", profile.player_slug)
    .single();
  return {
    userId: user.id,
    playerSlug: profile.player_slug,
    ...identityFromSlot(profile.player_slug, slot?.full_name ?? null),
  };
}
