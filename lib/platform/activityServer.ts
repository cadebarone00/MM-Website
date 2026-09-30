import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseActivityFeed, setupActivityChanges, type TournamentActivityFeed } from "./activity.ts";
import type { ManagedEdition } from "./dashboardServer.ts";
import type { TournamentSetup } from "./setup.ts";

/**
 * Server-side access to tournament activity. The viewer always comes from
 * the session; access (tournament visibility first, then each item's
 * visibility) is decided inside get_tournament_activity.
 */

/** The activity feed for /t/<slug>/<year> as the current viewer may see it; null = not found / not allowed. */
export async function loadTournamentActivity(slug: string, year: string | number, options: { limit?: number } = {}): Promise<TournamentActivityFeed | null> {
  const seasonYear = Number(year);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60 || !Number.isInteger(seasonYear)) return null;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_tournament_activity", {
    p_slug: slug, p_year: seasonYear, p_viewer: user?.id ?? null, p_limit: options.limit ?? 30,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("get_tournament_activity failed:", error.message);
    return null;
  }
  return parseActivityFeed(data);
}

async function record(edition: ManagedEdition, type: string, metadata: Record<string, number>) {
  const { error } = await createSupabaseServiceRoleClient().rpc("record_edition_activity", {
    p_profile: edition.userId, p_edition: edition.editionId, p_type: type, p_metadata: metadata,
  });
  // Best effort: the activity feed must never make a save or publish fail.
  if (error && error.code !== "PGRST202") console.error(`record_edition_activity(${type}) failed:`, error.message);
}

/** After a successful dashboard save: record meaningful player/team/schedule changes (published editions only). */
export async function recordSetupActivity(edition: ManagedEdition, before: TournamentSetup, after: TournamentSetup) {
  try {
    for (const change of setupActivityChanges(before, after)) await record(edition, change.type, change.metadata);
  } catch (error) {
    console.error("recordSetupActivity failed:", error);
  }
}

/** After a successful publish: the first publish of an edition becomes a feed event. */
export async function recordPublishedActivity(edition: ManagedEdition, before: TournamentSetup, after: TournamentSetup) {
  try {
    if (before.edition.publishedAt === null && after.edition.publishedAt !== null) await record(edition, "tournament_published", {});
  } catch (error) {
    console.error("recordPublishedActivity failed:", error);
  }
}
