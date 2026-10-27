import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { profilePhotoUrl } from "./profilePhoto";
import { emailConfigured, escapeHtml, sendEmail } from "@/lib/email/sendEmail";
import { friendIds, tripFriendIds } from "./friendsServer";

/**
 * Find Golfers and friend requests (supabase/profile_friends.sql). The signed-in profile id always comes from the
 * session — callers pass it, never a value from the request body. Never import this from a client component.
 * "not_installed" = profile_friends.sql hasn't been run yet.
 */

export type Relation = "friends" | "requested" | "incoming" | "none";
/** `tripMate`: friends from a golf trip together (automatic, so they can't be removed). */
export interface GolferResult { id: string; name: string; username: string | null; photoUrl: string | null; relation: Relation; tripMate: boolean }
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
    relation: tripMates.has(g.id) ? "friends" : g.relation, tripMate: tripMates.has(g.id) && g.relation !== "friends" })) };
}

/** I ask `to` to be friends; a new request emails them (when email is set up). `origin`: the site the email links to. */
export async function sendFriendRequest(me: string, to: string, origin: string): Promise<FriendsResult<Relation>> {
  const result = await rpc<Relation>("send_friend_request", { p_from: me, p_to: to });
  if (result.ok && result.value === "requested" && emailConfigured()) void emailFriendRequest(me, to, origin).catch(() => {});
  return result;
}

async function emailFriendRequest(me: string, to: string, origin: string) {
  const [{ data: from }, { data: account }] = await Promise.all([
    db().from("profiles").select("display_name").eq("id", me).maybeSingle(),
    db().auth.admin.getUserById(to),
  ]);
  const email = account?.user?.email, name = (from?.display_name as string | null) ?? "A golfer";
  if (!email) return;
  const url = `${origin}/profile/search`;
  await sendEmail({ to: email, subject: `${name} wants to be friends on The Maroon`,
    text: `${name} sent you a friend request on The Maroon.\n\nAccept or decline it here: ${url}\n`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#240001;color:#fbf8f1;border-radius:16px">
<p style="margin:0;color:#c9a86e;font-size:12px;letter-spacing:.12em;text-transform:uppercase">Friend request</p>
<h1 style="margin:8px 0 16px;font-family:Georgia,serif;font-size:26px">${escapeHtml(name)} wants to be friends</h1>
<p>Friends on The Maroon can compare stats and see each other's rounds.</p>
<p style="text-align:center;margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#e8c98a;color:#3b0d18;font-weight:700;text-decoration:none">See the request</a></p>
</div>` });
}

/** The friend button switched off: stop being friends (request friends only; golf trip mates stay), or take back my request. */
export const removeFriend = (me: string, other: string) => rpc<boolean>("remove_friend", { p_me: me, p_other: other });
/** How many requests are waiting on me (0 before profile_friends.sql is run). */
export async function friendRequestCount(me: string): Promise<number> {
  const result = await rpc<number>("friend_request_count", { p_me: me });
  return result.ok ? result.value ?? 0 : 0;
}
export const respondFriendRequest = (me: string, request: string, accept: boolean) => rpc<null>("respond_friend_request", { p_me: me, p_request: request, p_accept: accept });

/** Requests waiting on me, and the friends I've made by request (ids). */
export async function myFriendRequests(me: string): Promise<FriendsResult<{ incoming: FriendRequest[]; friends: string[] }>> {
  const result = await rpc<{ incoming: { id: string; profileId: string; name: string; username: string | null; avatarPath: string | null }[]; friends: string[] }>("my_friend_requests", { p_me: me });
  if (!result.ok) return result;
  return { ok: true, value: { friends: result.value.friends ?? [], incoming: (result.value.incoming ?? []).map((r) => ({ id: r.id, profileId: r.profileId, name: r.name, username: r.username, photoUrl: profilePhotoUrl(r.avatarPath) })) } };
}

export interface FriendListItem { id: string; name: string; username: string | null; photoUrl: string | null; tripMate: boolean }

/** Everyone I'm friends with (golf trip mates and accepted requests), A–Z. */
export async function listFriends(me: string): Promise<FriendListItem[]> {
  const [all, trip] = await Promise.all([friendIds(me), tripFriendIds(me)]);
  const mine = await myFriendRequests(me);
  const requested = new Set(mine.ok ? mine.value.friends : []);
  const ids = [...all];
  if (!ids.length) return [];
  // The photo column comes with profile_photos.sql; read without it when it's missing.
  let rows = await db().from("profiles").select("id, display_name, username, avatar_path").in("id", ids);
  if (rows.error) rows = await db().from("profiles").select("id, display_name, username").in("id", ids) as typeof rows;
  return ((rows.data ?? []) as { id: string; display_name: string | null; username: string | null; avatar_path?: string | null }[])
    .filter((r) => r.display_name)
    .map((r) => ({ id: r.id, name: r.display_name!, username: r.username, photoUrl: profilePhotoUrl(r.avatar_path ?? null), tripMate: trip.has(r.id) && !requested.has(r.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Where I stand with `other`, for the friend button on their profile. */
export async function friendshipWith(me: string, other: string): Promise<{ relation: Relation; tripMate: boolean }> {
  const [all, trip] = await Promise.all([friendIds(me), tripFriendIds(me)]);
  const pending = await db().from("profile_friend_requests").select("from_profile, to_profile, status")
    .or(`and(from_profile.eq.${me},to_profile.eq.${other}),and(from_profile.eq.${other},to_profile.eq.${me})`);
  const rows = pending.error ? [] : (pending.data ?? []) as { from_profile: string; to_profile: string; status: string }[];
  const byRequest = rows.some((r) => r.status === "accepted");
  if (all.has(other)) return { relation: "friends", tripMate: trip.has(other) && !byRequest };
  if (rows.some((r) => r.status === "pending" && r.from_profile === me)) return { relation: "requested", tripMate: false };
  if (rows.some((r) => r.status === "pending" && r.from_profile === other)) return { relation: "incoming", tripMate: false };
  return { relation: "none", tripMate: false };
}
