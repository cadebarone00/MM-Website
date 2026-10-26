import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { profilePhotoUrl } from "./profilePhoto";
import { tripFriendIds } from "./friendsServer";

/**
 * Find Golfers and friend requests (supabase/profile_friends.sql). The signed-in profile id always comes from the
 * session — callers pass it, never a value from the request body. Never import this from a client component.
 * "not_installed" = profile_friends.sql hasn't been run yet.
 */

export type Relation = "friends" | "requested" | "incoming" | "none";
export interface GolferResult { id: string; name: string; username: string | null; photoUrl: string | null; relation: Relation }
export interface FriendRequest { id: string; profileId: string; name: string; username: string | null; photoUrl: string | null }
export type FriendsResult<T> = { ok: true; value: T } | { ok: false; code: "not_installed" | "refused" | "failed"; message: string };

const db = () => createSupabaseServiceRoleClient();
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<FriendsResult<T>> {
  const { data, error } = await db().rpc(name, args);
  if (!error) return { ok: true, value: data as T };
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") return { ok: false, code: "not_installed", message: "Finding golfers isn't set up yet (supabase/profile_friends.sql)." };
  if (error.code === "22023" || error.code === "42501") return { ok: false, code: "refused", message: error.message };
  console.error(`${name} failed:`, error.message);
  return { ok: false, code: "failed", message: "Something went wrong. Try again." };
}

/** Golfers matching the words, with where I stand with each (golf trip mates count as friends). */
export async function searchGolfers(me: string, query: string): Promise<FriendsResult<GolferResult[]>> {
  const found = await rpc<{ id: string; name: string; username: string | null; avatarPath: string | null; relation: Relation }[]>("search_golfers", { p_viewer: me, p_query: query.slice(0, 60) });
  if (!found.ok) return found;
  const tripMates = found.value.length ? await tripFriendIds(me) : new Set<string>();
  return { ok: true, value: found.value.map((g) => ({ id: g.id, name: g.name, username: g.username, photoUrl: profilePhotoUrl(g.avatarPath),
    relation: tripMates.has(g.id) ? "friends" : g.relation })) };
}

export const sendFriendRequest = (me: string, to: string) => rpc<Relation>("send_friend_request", { p_from: me, p_to: to });
export const respondFriendRequest = (me: string, request: string, accept: boolean) => rpc<null>("respond_friend_request", { p_me: me, p_request: request, p_accept: accept });

/** Requests waiting on me, and the friends I've made by request (ids). */
export async function myFriendRequests(me: string): Promise<FriendsResult<{ incoming: FriendRequest[]; friends: string[] }>> {
  const result = await rpc<{ incoming: { id: string; profileId: string; name: string; username: string | null; avatarPath: string | null }[]; friends: string[] }>("my_friend_requests", { p_me: me });
  if (!result.ok) return result;
  return { ok: true, value: { friends: result.value.friends ?? [], incoming: (result.value.incoming ?? []).map((r) => ({ id: r.id, profileId: r.profileId, name: r.name, username: r.username, photoUrl: profilePhotoUrl(r.avatarPath) })) } };
}
