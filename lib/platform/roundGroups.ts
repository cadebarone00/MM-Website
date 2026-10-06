import type { RoundSource } from "./playerRounds";
import type { RoundsVisibility } from "./playerRoundsPrivacy";

/**
 * Player & Attest (project_specs.md add-on): the golfers playing one round together, and who keeps whose score.
 * Every player keeps their own score; their attester keeps the same player's strokes, and the two must match.
 */
export interface GroupPlayerInput { profileId: string; side?: "left" | "right" }
export interface RoundGroupPlayer { profileId: string; attesterProfileId: string | null }
export interface RoundGroup {
  id: string;
  source: Exclude<RoundSource, "history">;
  tripId?: string;
  tripRoundId?: string;
  course: { ref: string | null; name: string; place: string };
  datePlayed: string;
  players: RoundGroupPlayer[];
  startedBy: string;
  /** Personal rounds only. */
  visibility?: RoundsVisibility;
}

/**
 * Who attests whom, picked automatically: 2 = each other; 4 = two pairs (1 ↔ 2, 3 ↔ 4); 3 or 5 = a circle (1 attests 2,
 * 2 attests 3, … the last attests 1); solo = nobody. A competitive group (two even sides) pairs opponents, never teammates.
 */
export function assignAttesters(players: GroupPlayerInput[]): RoundGroupPlayer[] {
  const ids = players.map((p) => p.profileId);
  if (new Set(ids).size !== ids.length) throw new Error("A player can only be in a group once.");
  const attester = new Map<string, string | null>(ids.map((id) => [id, null]));
  const pair = (a: string, b: string) => { attester.set(a, b); attester.set(b, a); };
  const left = players.filter((p) => p.side === "left"), right = players.filter((p) => p.side === "right");
  if (left.length > 0 && left.length === right.length && left.length + right.length === players.length) {
    left.forEach((p, i) => pair(p.profileId, right[i].profileId));
  } else {
    // Uneven sides: alternate sides first so attesters are opponents where possible, then anyone without a side.
    const sided: GroupPlayerInput[] = [];
    for (let i = 0; i < Math.max(left.length, right.length); i++) { if (left[i]) sided.push(left[i]); if (right[i]) sided.push(right[i]); }
    const order = [...sided, ...players.filter((p) => !p.side)].map((p) => p.profileId);
    if (order.length === 2) pair(order[0], order[1]);
    else if (order.length === 4) { pair(order[0], order[1]); pair(order[2], order[3]); }
    else if (order.length > 1) order.forEach((id, i) => attester.set(id, order[(i - 1 + order.length) % order.length]));
  }
  return ids.map((profileId) => ({ profileId, attesterProfileId: attester.get(profileId) ?? null }));
}

/** Trips have no groups yet (add-on decision 13): the trip's players in order, in fours; a lone leftover joins the group before it. */
export function groupTripPlayers(profileIds: string[], size = 4): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < profileIds.length; i += size) groups.push(profileIds.slice(i, i + size));
  if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(...(groups.pop() as string[]));
  return groups;
}

/** The organizer (or whoever started a personal round) changes who attests a player, until cards are submitted. */
export function swapAttester(players: RoundGroupPlayer[], profileId: string, attesterProfileId: string): RoundGroupPlayer[] {
  const inGroup = (id: string) => players.some((p) => p.profileId === id);
  if (!inGroup(profileId) || !inGroup(attesterProfileId)) throw new Error("That player isn't in this group.");
  if (profileId === attesterProfileId) throw new Error("A player can't attest themselves.");
  return players.map((p) => p.profileId === profileId ? { ...p, attesterProfileId } : p);
}
