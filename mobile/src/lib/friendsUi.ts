/**
 * Friends (server: lib/profile/friendRequestsServer.ts, written out here because that file is server code).
 * friends = friends · requested = I asked · incoming = they asked me · none.
 */
export type Relation = "friends" | "requested" | "incoming" | "none";
export interface GolferResult { id: string; name: string; username: string | null; photoUrl: string | null; relation: Relation; tripMate: boolean; isPrivate: boolean; mutuals?: number }
export interface FriendRequest { id: string; profileId: string; name: string; username: string | null; photoUrl: string | null }
export interface FriendListItem { id: string; name: string; username: string | null; photoUrl: string | null; tripMate: boolean }
export type FriendOfItem = GolferResult & { you?: boolean };

/** The friend button's words (website FriendToggle). */
export function friendLabel(relation: Relation, tripMate: boolean): string {
  if (relation === "friends") return tripMate ? "Friends · Trip" : "Friends";
  return relation === "requested" ? "Requested" : relation === "incoming" ? "Accept" : "Add friend";
}

/** "1 friend", "3 friends" */
export const friendsCountLabel = (n: number) => `${n} friend${n === 1 ? "" : "s"}`;

/** Friends tab filter: name or @username, any case. */
export function matchesFriend(friend: { name: string; username: string | null }, words: string): boolean {
  const needle = words.trim().toLowerCase().replace(/^@/, "");
  return !needle || friend.name.toLowerCase().includes(needle) || (friend.username ?? "").toLowerCase().includes(needle);
}
