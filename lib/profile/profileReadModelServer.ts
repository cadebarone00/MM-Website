import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug, getPlayerSlug } from "@/lib/data/players";
import { getCatalogTournament, getSeasonCatalog } from "@/lib/data/seasonCatalog";
import { getPlayerScorecard } from "@/lib/data";
import { getProfileOverrides, mergeProfile } from "@/lib/data/players/overrides";
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
import { getArchivedHandicapRounds, getScorecardsForTournament, getShotVideoUrls } from "@/lib/data/archivedScorecards";
import { combinedHandicapIndexes } from "@/lib/handicap/archiveIndex";
import { legacyAdapterFor } from "@/lib/platform/legacyTournaments";
import { profileHistoryFromJson } from "@/lib/platform/playerRoundsRows";
import type { ProfileId } from "./profileIdentity";
import { legacyMaroonYears, playerFullName } from "./myProfile";
import { assembleProfileReadModel, type LegacyMaroonProfile, type ProfileReadModel, type ProfileSources, type ProfileSubjectRow } from "./profileReadModel";

/**
 * The profile read model's Supabase side (lib/profile/profileReadModel.ts). Server only — never import this from a
 * client component. The viewer id must come from the session (getCurrentProfile), never from the request; the subject
 * is whose profile is being shown. Every read uses the service-role key and the functions below decide what the viewer
 * gets; a read that fails leaves its section "unavailable" instead of breaking the page.
 */

const SUBJECT_COLUMNS = "id, display_name, username, created_at, player_slug";

async function subject(subjectId: ProfileId): Promise<ProfileSubjectRow | null> {
  const db = createSupabaseServiceRoleClient();
  // rounds_visibility comes with player_rounds.sql; until it's run, read the row without it.
  let { data, error } = await db.from("profiles").select(`${SUBJECT_COLUMNS}, rounds_visibility`).eq("id", subjectId).maybeSingle();
  if (error) ({ data, error } = await db.from("profiles").select(SUBJECT_COLUMNS).eq("id", subjectId).maybeSingle());
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const text = (v: unknown) => typeof v === "string" ? v : "";
  return {
    id: text(row.id), displayName: text(row.display_name), username: text(row.username), createdAt: text(row.created_at) || null,
    legacyMaroonPlayerSlug: text(row.player_slug) || null, roundsVisibility: row.rounds_visibility === "public" ? "public" : "private",
  };
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc(fn, args);
  if (error) {
    console.error(`${fn} failed:`, error.message);
    return null;
  }
  return data;
}

/**
 * LEGACY COMPATIBILITY: pre-platform Maroon data found through the old player slot (bio / photo, archived years with
 * their team, handicap history, latest scorecard). Read-only; only ever called for a profile that has a slug.
 */
async function legacy(playerSlug: string): Promise<LegacyMaroonProfile> {
  const { data: slot } = await createSupabaseServiceRoleClient().from("player_slots").select("full_name").eq("player_slug", playerSlug).maybeSingle();
  const staticProfile = getPlayerProfileBySlug(playerSlug);
  const fullName = playerFullName(slot?.full_name, staticProfile?.fullName);
  const base = staticProfile ?? { id: playerSlug, slug: playerSlug, fullName: fullName ?? playerSlug, avatarSrc: null, bio: "", history: [] };
  const [bio, handicap, latestScorecard] = await Promise.all([
    getProfileOverrides(playerSlug).then((overrides) => mergeProfile(base, overrides)),
    Promise.all([getHandicapSummaryForPlayer(playerSlug), getArchivedHandicapRounds(playerSlug)])
      .then(([summary, archivedRounds]) => ({ summary: { ...summary, ...combinedHandicapIndexes(summary.rounds, archivedRounds) }, archivedRounds }))
      .catch(() => { console.error("Profile round history could not be loaded."); return null; }),
    latestLegacyScorecard(playerSlug).catch(() => { console.error("Profile player page could not be loaded."); return null; }),
  ]);
  return { playerSlug, fullName, avatarSrc: staticProfile?.avatarSrc ?? null, bio, years: legacyMaroonYears(playerSlug), handicap, latestScorecard };
}

/** The newest Maroon edition this player has a scorecard in. */
async function latestLegacyScorecard(playerSlug: string): Promise<LegacyMaroonProfile["latestScorecard"]> {
  const catalog = await getSeasonCatalog("teams");
  const editions = [catalog.nextTournament, ...catalog.pastTournaments].sort((a, b) => b.year - a.year);
  for (const candidate of editions) {
    const edition = await getCatalogTournament(candidate.slug);
    if (!edition) continue;
    const team = edition.roster.maroon.some((name) => getPlayerSlug(name) === playerSlug) ? "maroon"
      : edition.roster.white.some((name) => getPlayerSlug(name) === playerSlug) ? "white" : null;
    if (!team) continue;
    const tournament = { ...edition, scorecards: await getScorecardsForTournament(edition) };
    const scorecard = getPlayerScorecard(tournament, playerSlug);
    if (!scorecard?.rounds.length) continue;
    const shotVideos = Object.fromEntries(await Promise.all(scorecard.rounds.map(async (round) =>
      [round.round, await getShotVideoUrls(edition.slug, playerSlug, round.round)] as const)));
    return { tournament, scorecard, team, shotVideos };
  }
  return null;
}

const SOURCES: ProfileSources = {
  subject,
  history: (viewerId, subjectId) => rpc("get_profile_history", { p_viewer: viewerId, p_subject: subjectId }),
  rounds: async (viewerId, subjectId) => {
    const data = await rpc("list_profile_rounds", { p_viewer: viewerId, p_owner: subjectId });
    return Array.isArray(data) ? profileHistoryFromJson(data) : null;
  },
  legacy,
  isLegacyTournament: (slug) => legacyAdapterFor(slug) !== null,
};

/** The subject's profile as this viewer may see it, or null when the subject has no profile. */
export function loadProfileReadModel(viewerId: ProfileId | null, subjectId: ProfileId): Promise<ProfileReadModel | null> {
  return assembleProfileReadModel(viewerId, subjectId, SOURCES, new Date().toISOString().slice(0, 10));
}
