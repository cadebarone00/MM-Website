import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getMyPlayerRounds, getProfileRounds } from "@/lib/platform/playerRoundsServer";
import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";
import { areFriends, tripFriendIds } from "./friendsServer";
import { roundStats, type RoundStats } from "./roundStats";
import type { ProfileId } from "./profileIdentity";

/**
 * Profile → Stats → Compare. Who I can compare with (friends = people I've been on a golf trip with, then anyone else
 * I've played a round with) and another player's stats. A friend's stats always come through, Private or not (owner
 * rule 2026-10-10); anyone else's follow their Privacy setting via list_profile_rounds. The viewer comes from the session.
 */

export interface ComparePerson { username: string; name: string; friend?: boolean }
export type CompareResult = { status: "ok"; person: ComparePerson; stats: RoundStats | null } | { status: "private"; person: ComparePerson } | { status: "not_found" };

/** Friends first (golf trips), then others I've joined a round with (shared rounds), alphabetical within each. */
export async function playedWith(me: ProfileId): Promise<ComparePerson[]> {
  const db = createSupabaseServiceRoleClient();
  const friends = await tripFriendIds(me);
  const others = new Set<string>();
  const mineShared = await db.from("shared_round_players").select("round_id").eq("profile_id", me).eq("status", "joined");
  const sharedIds = (mineShared.data ?? []).map((row) => row.round_id as string);
  if (sharedIds.length) {
    const rows = await db.from("shared_round_players").select("profile_id").in("round_id", sharedIds).eq("status", "joined");
    for (const row of rows.data ?? []) if (!friends.has(row.profile_id as string)) others.add(row.profile_id as string);
  }
  others.delete(me);
  const ids = [...friends, ...others].slice(0, 60);
  if (!ids.length) return [];
  const { data } = await db.from("profiles").select("id, username, display_name").in("id", ids);
  return (data ?? []).map((row) => ({ username: row.username as string, name: (row.display_name as string) || (row.username as string), friend: friends.has(row.id as string) }))
    .sort((a, b) => Number(b.friend) - Number(a.friend) || a.name.localeCompare(b.name));
}

/** Another player's stats by username: a friend's always; anyone else's as their Privacy setting allows. */
export async function compareWith(viewer: ProfileId, username: string): Promise<CompareResult> {
  const name = username.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.]{2,29}$/.test(name)) return { status: "not_found" };
  const db = createSupabaseServiceRoleClient();
  const { data } = await db.from("profiles").select("id, username, display_name, rounds_visibility").ilike("username", name.replace(/[%_]/g, "\\$&")).maybeSingle();
  const row = data as { id: string; username: string; display_name: string | null; rounds_visibility?: string } | null;
  if (!row) return { status: "not_found" };
  const friend = await areFriends(viewer, row.id);
  const person = { username: row.username, name: row.display_name || row.username, friend };
  if (friend) {
    const all = await getMyPlayerRounds(row.id);
    if (all.status !== "ok") return { status: "ok", person, stats: null };
    const shown: ProfileHistoryRound[] = all.rounds.filter((round) => !round.removedFromProfile);
    return { status: "ok", person, stats: roundStats(shown) };
  }
  if (row.rounds_visibility !== "public") return { status: "private", person };
  const history = await getProfileRounds(row.id);
  if (history.status !== "ok") return { status: "private", person };
  return { status: "ok", person, stats: roundStats(history.rounds) };
}
