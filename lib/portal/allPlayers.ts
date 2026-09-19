// Server-only: imports @/lib/supabase/server, which pulls in next/headers
// transitively — never import this from a Client Component.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { playerProfiles } from "@/lib/data/players";

export interface PlayerRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
  email: string | null;
}

/**
 * Every player, static (lib/data/players/*.ts) or dynamic (a player_slots
 * row with no hand-written file). A player_slots row's full_name always
 * wins when set — that's the one field "Edit name" writes to, so an edit
 * is guaranteed to show up wherever this list is used. Shared by the
 * Global Players page, the per-year Players & Teams page, and the public
 * confirmed roster, so the union logic lives in exactly one place.
 */
export async function getAllPlayerRows(): Promise<PlayerRow[]> {
  const service = createSupabaseServiceRoleClient();
  const { data: slots, error } = await service
    .from("player_slots")
    .select("player_slug, username, claimed_by, email, full_name");
  if (error) console.error("getAllPlayerRows: could not read player_slots:", error.message);
  const bySlug = new Map((slots ?? []).map((s) => [s.player_slug, s]));

  const staticRows: PlayerRow[] = playerProfiles.map((p) => {
    const slot = bySlug.get(p.slug);
    return {
      playerSlug: p.slug,
      fullName: slot?.full_name ?? p.fullName,
      username: slot?.username ?? null,
      claimedBy: slot?.claimed_by ?? null,
      email: slot?.email ?? null,
    };
  });

  const staticSlugs = new Set(playerProfiles.map((p) => p.slug));
  const dynamicRows: PlayerRow[] = (slots ?? [])
    .filter((s) => !staticSlugs.has(s.player_slug))
    .map((s) => ({
      playerSlug: s.player_slug,
      fullName: s.full_name ?? s.player_slug,
      username: s.username,
      claimedBy: s.claimed_by,
      email: s.email,
    }));

  return [...staticRows, ...dynamicRows];
}
