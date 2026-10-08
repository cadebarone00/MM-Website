import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireTournamentRole } from "./tournamentAccess.ts";
import { parseSetup, type TournamentSetup } from "./setup.ts";

/**
 * Server-only access to one tournament edition's setup. Every call first
 * checks the signed-in user manages the tournament (requireTournamentRole),
 * and the database functions check it again.
 */
export interface ManagedEdition {
  /** The organizer's profile (profiles.id). */
  profileId: string;
  editionId: string;
}

/**
 * The edition behind /tournaments/<slug>/<year> — the same Tournament +
 * Edition the public site will show at /t/<slug>/<year>. null when signed
 * out, not an organizer, or no such tournament/year (all look the same).
 */
export async function resolveManagedEdition(slug: string, year: string | number): Promise<ManagedEdition | null> {
  const seasonYear = Number(year);
  if (!Number.isInteger(seasonYear)) return null;
  const access = await requireTournamentRole(slug, "organizer");
  if (!access) return null;
  const { data } = await createSupabaseServiceRoleClient()
    .from("tournament_editions").select("id").eq("tournament_id", access.tournamentId).eq("season_year", seasonYear).maybeSingle();
  return data ? { profileId: access.profileId, editionId: data.id } : null;
}

type Rpc<T> = { ok: true; value: T } | { ok: false; error: { code?: string; message?: string } };

async function rpc(name: string, args: Record<string, unknown>): Promise<Rpc<TournamentSetup>> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc(name, args);
  if (error) return { ok: false, error };
  return { ok: true, value: parseSetup(data) };
}

export function loadSetup(edition: ManagedEdition) {
  return rpc("get_tournament_setup", { p_profile: edition.profileId, p_edition: edition.editionId });
}

export function saveSection(edition: ManagedEdition, section: string, data: Record<string, unknown>) {
  return rpc("save_tournament_section", { p_profile: edition.profileId, p_edition: edition.editionId, p_section: section, p_data: data });
}

export function setPublished(edition: ManagedEdition, publish: boolean) {
  return rpc("set_edition_published", { p_profile: edition.profileId, p_edition: edition.editionId, p_publish: publish });
}
