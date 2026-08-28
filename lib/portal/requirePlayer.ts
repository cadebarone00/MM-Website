import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";

export interface PlayerSession {
  userId: string;
  playerSlug: string;
  playerFullName: string;
  playerFirstName: string;
}

/**
 * Server-side guard for player-only actions (score entry). Returns null if
 * there's no session, the account isn't linked to a player slot, or the
 * slot doesn't match a known lib/data/players profile — callers should
 * treat null as "respond 401", never fall back to a client-supplied name.
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
  if (!playerProfile) return null;

  return {
    userId: user.id,
    playerSlug: profile.player_slug,
    playerFullName: playerProfile.fullName,
    playerFirstName: playerProfile.id,
  };
}
