import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "./currentProfile";
import { getPlayerProfileBySlug, getPlayerSlug } from "@/lib/data/players";
import { getCatalogTournament, getSeasonCatalog } from "@/lib/data/seasonCatalog";
import { getPlayerScorecard } from "@/lib/data";
import { getProfileOverrides, mergeProfile } from "@/lib/data/players/overrides";
import { getPlayerStatsByYear } from "@/lib/data/stats";
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
import { getArchivedHandicapRounds, getScorecardsForTournament, getShotVideoUrls } from "@/lib/data/archivedScorecards";
import { combinedHandicapIndexes } from "@/lib/handicap/archiveIndex";
import { loadLegacyPastRows, loadLegacyPlayingRows, withoutLegacyRows } from "@/lib/platform/legacyTournaments";
import { getMyPlayerRounds } from "@/lib/platform/playerRoundsServer";
import { summarizePastEditions, type PastTournament } from "@/lib/platform/pastTournaments";
import {
  careerStats, initialsFor, memberSinceLabel, mergeCompleted, playerFullName, profileDisplayName, teamsPlayed, type MyProfile,
} from "./myProfile";

/**
 * A platform list, or empty if its SQL isn't installed yet or fails. Legacy
 * tournaments' rows are dropped here: their adapters supply them live.
 */
async function platformList(fn: "list_my_active_editions" | "list_my_past_editions", profileId: string): Promise<PastTournament[]> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc(fn, { p_profile: profileId });
  if (error) {
    console.error(`${fn} failed:`, error.message);
    return [];
  }
  return summarizePastEditions(withoutLegacyRows(data));
}

/** Legacy tournaments' rows (they open /play), or empty if they can't be read. */
async function legacyList(load: (profileId: string) => Promise<PastTournament[]>, profileId: string): Promise<PastTournament[]> {
  try {
    return await load(profileId);
  } catch (error) {
    console.error("legacy tournament list failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Everything /profile shows for the signed-in person, or null if signed out.
 * The user id comes from the session only (never the request).
 */
export async function loadMyProfile(): Promise<MyProfile | null> {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return null;
  const user = current.account;
  const me = current.status === "ok" ? current.profile : null;
  // Product lookups use the profile id (= profiles.id; equals the account id, see lib/profile/profileIdentity.ts).
  const profileId = me?.profileId ?? user.id;
  // LEGACY COMPATIBILITY: the old Maroon player slot, only for pre-platform Maroon data (bio, scorecards, handicap).
  const playerSlug = me?.legacyMaroonPlayerSlug ?? null;

  let fullName: string | null = null;
  let avatarSrc: string | null = null;
  let bio: string | null = null;
  let playerBio: MyProfile["playerBio"] = null;
  if (playerSlug) {
    const { data: slot } = await createSupabaseServiceRoleClient().from("player_slots").select("full_name").eq("player_slug", playerSlug).single();
    const staticProfile = getPlayerProfileBySlug(playerSlug);
    fullName = playerFullName(slot?.full_name, staticProfile?.fullName);
    avatarSrc = staticProfile?.avatarSrc ?? null;
    const base = staticProfile ?? { id: playerSlug, slug: playerSlug, fullName: fullName ?? playerSlug, avatarSrc: null, bio: "", history: [] };
    playerBio = mergeProfile(base, await getProfileOverrides(playerSlug));
    bio = playerBio.bio?.trim() || null;
  }

  const [platformActive, platformPast, legacyActive, legacyPast, myRounds] = await Promise.all([
    platformList("list_my_active_editions", profileId),
    platformList("list_my_past_editions", profileId),
    legacyList(loadLegacyPlayingRows, profileId),
    legacyList(loadLegacyPastRows, profileId),
    getMyPlayerRounds(profileId),
  ]);
  // Soonest first, undated last (same order as the database list).
  const active = [...legacyActive, ...platformActive].sort((a, b) =>
    (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || a.name.localeCompare(b.name) || a.year - b.year);
  const name = profileDisplayName({ fullName, displayName: me?.displayName, username: me?.username, email: me?.email || user.email });
  const stats = playerSlug ? careerStats(getPlayerStatsByYear(playerSlug)) : null;
  let roundHistory: MyProfile["roundHistory"] = null;
  let playerPage: MyProfile["playerPage"] = null;
  if (playerSlug) {
    try {
      const catalog = await getSeasonCatalog("teams");
      const editions = [catalog.nextTournament, ...catalog.pastTournaments].sort((a, b) => b.year - a.year);
      for (const candidate of editions) {
        const edition = await getCatalogTournament(candidate.slug);
        if (!edition) continue;
        const team = edition.roster.maroon.some(name => getPlayerSlug(name) === playerSlug) ? "maroon"
          : edition.roster.white.some(name => getPlayerSlug(name) === playerSlug) ? "white" : null;
        if (!team) continue;
        const tournament = { ...edition, scorecards: await getScorecardsForTournament(edition) };
        const scorecard = getPlayerScorecard(tournament, playerSlug);
        if (!scorecard?.rounds.length) continue;
        const shotVideos = Object.fromEntries(await Promise.all(scorecard.rounds.map(async round =>
          [round.round, await getShotVideoUrls(edition.slug, playerSlug, round.round)] as const)));
        playerPage = { tournament, scorecard, team, shotVideos };
        break;
      }
    } catch {
      console.error("Profile player page could not be loaded.");
    }
    try {
      const [summary, archivedRounds] = await Promise.all([
        getHandicapSummaryForPlayer(playerSlug), getArchivedHandicapRounds(playerSlug),
      ]);
      roundHistory = { playerSlug, summary: { ...summary, ...combinedHandicapIndexes(summary.rounds, archivedRounds) }, archivedRounds };
    } catch {
      console.error("Profile round history could not be loaded.");
    }
  }

  return {
    playerPage,
    playerBio,
    roundHistory,
    playerRounds: myRounds.status === "ok" ? myRounds.rounds : null,
    name,
    initials: initialsFor(name),
    avatarSrc,
    memberSince: memberSinceLabel(user.created_at),
    canEditBio: Boolean(playerSlug),
    teams: teamsPlayed(playerSlug),
    active,
    completed: mergeCompleted(legacyPast, platformPast),
    stats,
    bio,
  };
}
