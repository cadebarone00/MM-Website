import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";

/**
 * Who may manage a tournament (THE_MAROON_PRODUCT_SPEC.md §4). Checked on
 * the server for every tournament page and route; hiding buttons is never
 * the protection.
 */
export type TournamentRole = "viewer" | "player" | "organizer" | "owner";

const RANK: Record<TournamentRole, number> = { viewer: 0, player: 1, organizer: 2, owner: 3 };

export function roleAtLeast(role: TournamentRole | null, minimum: TournamentRole): boolean {
  return role !== null && RANK[role] >= RANK[minimum];
}

export interface TournamentAccess {
  /** The signed-in golfer's profile (profiles.id) — tournament roles belong to the profile. */
  profileId: string;
  tournamentId: string;
  /** Platform admins act as owner of every tournament. */
  role: TournamentRole;
}

/** null = not signed in, no such tournament, or not allowed — callers treat all three the same. */
export async function requireTournamentRole(tournamentSlug: string, minimum: TournamentRole): Promise<TournamentAccess | null> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return null;
  const profileId = current.profile.profileId;

  const service = createSupabaseServiceRoleClient();
  const [{ data: tournament }, { data: profile }] = await Promise.all([
    service.from("tournaments").select("id").eq("slug", tournamentSlug).maybeSingle(),
    service.from("profiles").select("platform_role").eq("id", profileId).maybeSingle(),
  ]);
  if (!tournament) return null;
  if (profile?.platform_role === "admin") return { profileId, tournamentId: tournament.id, role: "owner" };

  const { data: member } = await service
    .from("tournament_members")
    .select("role")
    .eq("tournament_id", tournament.id)
    .eq("profile_id", profileId)
    .maybeSingle();
  const role = (member?.role ?? null) as TournamentRole | null;
  return roleAtLeast(role, minimum) ? { profileId, tournamentId: tournament.id, role: role! } : null;
}
