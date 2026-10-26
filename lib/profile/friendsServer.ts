import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ProfileId } from "./profileIdentity";

/**
 * Friends (owner rule 2026-10-10): anyone you've been on a golf trip with is automatically your friend, Private or not.
 * Worked out from golf_trip_members (both accepted members of the same trip); accepted friend requests
 * (supabase/profile_friends.sql, Profile → Find Golfers) count too.
 * Friends can compare stats with each other even when a profile is Private. Never import this from a client component.
 */
export async function tripFriendIds(profileId: ProfileId): Promise<Set<string>> {
  const db = createSupabaseServiceRoleClient();
  const friends = new Set<string>();
  const mine = await db.from("golf_trip_members").select("golf_trip_id").eq("profile_id", profileId).eq("invitation_status", "accepted");
  const tripIds = (mine.data ?? []).map((row) => row.golf_trip_id as string);
  if (!tripIds.length) return friends;
  const members = await db.from("golf_trip_members").select("profile_id").in("golf_trip_id", tripIds).eq("invitation_status", "accepted").not("profile_id", "is", null);
  for (const row of members.data ?? []) friends.add(row.profile_id as string);
  friends.delete(profileId);
  return friends;
}

/** Friends made by request (supabase/profile_friends.sql; none before it's run). */
async function requestFriendIds(profileId: ProfileId): Promise<string[]> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("my_friend_requests", { p_me: profileId });
  return error ? [] : ((data as { friends?: string[] } | null)?.friends ?? []);
}

/** Everyone I'm friends with: golf trip mates, and accepted friend requests. */
export async function friendIds(profileId: ProfileId): Promise<Set<string>> {
  const [trip, requested] = await Promise.all([tripFriendIds(profileId), requestFriendIds(profileId)]);
  for (const id of requested) trip.add(id);
  trip.delete(profileId);
  return trip;
}

export async function friendCount(profileId: ProfileId): Promise<number> {
  return (await friendIds(profileId)).size;
}

export async function areFriends(a: ProfileId, b: ProfileId): Promise<boolean> {
  return a !== b && (await friendIds(a)).has(b);
}
