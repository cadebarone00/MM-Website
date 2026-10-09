import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireTournamentRole } from "./tournamentAccess.ts";
import { parseSetup, type TournamentSetup } from "./setup.ts";
import { dashboardFailure } from "./dashboardApi.ts";
import { nextEditionDraftFromJson, type NextEditionDraft, type NextEditionInput } from "./nextEdition.ts";

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

// --- Start next year (supabase/platform_next_edition.sql) ------------------------------------------------------

/** The Start next year page's data for the edition it starts from. Null when unavailable (or The Maroon). */
export async function getNextEditionDraft(edition: ManagedEdition): Promise<NextEditionDraft | null> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_next_edition_draft", { p_profile: edition.profileId, p_from_edition: edition.editionId });
  if (error) {
    if (error.code !== "PGRST202" && error.code !== "42883") console.error("get_next_edition_draft failed:", error.message);
    return null;
  }
  return nextEditionDraftFromJson(data);
}

/** Creates the new edition (same tournament, chosen returning players). The database checks everything again. */
export async function createNextEdition(edition: ManagedEdition, input: NextEditionInput):
  Promise<{ ok: true; seasonYear: number; tournamentSlug: string } | { ok: false; status: number; error: string }> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("create_next_edition", { p_profile: edition.profileId, p_from_edition: edition.editionId, p_input: input });
  if (error) {
    // "This tournament already has 2028" is worth showing as written.
    if (error.code === "23505") return { ok: false, status: 409, error: error.message || "That year already exists." };
    return { ok: false, ...dashboardFailure(error) };
  }
  const reply = data as { seasonYear?: unknown; tournamentSlug?: unknown } | null;
  return typeof reply?.seasonYear === "number" && typeof reply.tournamentSlug === "string"
    ? { ok: true, seasonYear: reply.seasonYear, tournamentSlug: reply.tournamentSlug }
    : { ok: false, status: 500, error: "Could not start the new year. Try again." };
}
