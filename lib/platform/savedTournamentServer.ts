import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { draftFromSaved } from "./savedTournament.ts";
import type { TournamentDraft } from "./tournamentDraft.ts";

/**
 * Loads one saved tournament edition for its setup dashboard. Server-only,
 * service role: callers must check requireTournamentRole first.
 */
export async function loadSavedTournament(tournamentId: string, seasonYear: number): Promise<TournamentDraft | null> {
  const service = createSupabaseServiceRoleClient();
  const [{ data: tournament }, { data: edition }] = await Promise.all([
    service.from("tournaments").select("name, short_name, slug, description, visibility, branding").eq("id", tournamentId).maybeSingle(),
    service.from("tournament_editions").select("id, season_year, destination, start_date, end_date, timezone").eq("tournament_id", tournamentId).eq("season_year", seasonYear).maybeSingle(),
  ]);
  if (!tournament || !edition) return null;
  const [{ data: teams }, { data: settings }] = await Promise.all([
    service.from("edition_teams").select("key, name, color").eq("edition_id", edition.id).order("sort_order"),
    service.from("edition_settings").select("scoring, plan").eq("edition_id", edition.id).maybeSingle(),
  ]);
  return draftFromSaved({ tournament, edition, teams: teams ?? [], settings: settings ?? null });
}
