import type { HolePenalties, ShotResult } from "./playerRounds";
import { assignAttesters, groupTripPlayers } from "./roundGroups";
import type { SavedGolfTrip } from "./golfTripCreate";

/**
 * Saved-trip scoring (Player & Attest Step 2, supabase/golf_trip_scoring.sql). Pure: builds the playing groups the
 * server saves, reads what the database returns, and turns the Scoring sheet's changes into hole entries. Every hole
 * entry belongs to the golfer being scored AND the golfer who typed it, so nobody's entry can overwrite anyone else's.
 */

const HOLES = 18;
const SHOTS: ShotResult[] = ["up", "left", "center", "right", "down"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TripScoringPlayer { profileId: string; displayName: string; playOrder: number; side: "left" | "right" | null; attesterProfileId: string | null; submittedAt: string | null }
export interface TripScoringGroup { id: string; groupNumber: number; lockedAt: string | null; players: TripScoringPlayer[] }
export interface HoleScoreEntry {
  scoredProfileId: string; enteredByProfileId: string; hole: number; strokes: number | null; putts: number | null;
  fairway: ShotResult | null; green: ShotResult | null; penaltyFairway: boolean; penaltyGreen: boolean; clientUpdatedAt: string; version: number;
}
export interface TripRoundScoring { roundId: string; roundNumber: number; groups: TripScoringGroup[]; entries: HoleScoreEntry[] }
/** One hole as the sheet sends it. An attester's entry is strokes only. */
export interface HoleEntryInput { hole: number; strokes: number | null; putts?: number | null; fairway?: ShotResult | null; green?: ShotResult | null; penaltyFairway?: boolean; penaltyGreen?: boolean }

/**
 * The trip round's playing groups: accepted members with an account, in member order (organizer first), in fours
 * (a lone leftover joins the group before it), each with attesters from the saved order. A trip round always needs
 * an attester, so fewer than 2 players can't be scored.
 */
export function tripGroupsPayload(members: SavedGolfTrip["members"]) {
  const ids = members.filter((m) => m.profileId && m.invitationStatus === "accepted").map((m) => m.profileId as string);
  if (ids.length < 2) throw new Error("A trip round needs at least 2 players to score.");
  return groupTripPlayers(ids).map((group) => ({ players: assignAttesters(group.map((profileId) => ({ profileId }))).map((p) => ({ ...p, side: null })) }));
}

/** The round being played today: the first trip round dated today (two rounds on one day: the earlier one). */
export const liveTripRound = (rounds: SavedGolfTrip["rounds"], today: string) => rounds.find((r) => r.playDate === today) ?? null;

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const intIn = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const optInt = (value: unknown, min: number, max: number) => value === null || value === undefined || intIn(value, min, max);
const optShot = (value: unknown) => value === null || value === undefined || SHOTS.includes(value as ShotResult);
const str = (value: unknown) => typeof value === "string" && value.length > 0;

function playerFrom(value: unknown): TripScoringPlayer | null {
  if (!isObject(value) || !str(value.profileId) || typeof value.displayName !== "string" || !intIn(value.playOrder, 1, 50)) return null;
  if (!(value.side === null || value.side === "left" || value.side === "right")) return null;
  if (!(value.attesterProfileId === null || str(value.attesterProfileId)) || !(value.submittedAt === null || str(value.submittedAt))) return null;
  return value as unknown as TripScoringPlayer;
}
function entryFrom(value: unknown): HoleScoreEntry | null {
  if (!isObject(value) || !str(value.scoredProfileId) || !str(value.enteredByProfileId) || !intIn(value.hole, 1, HOLES)) return null;
  if (!optInt(value.strokes, 1, 20) || !optInt(value.putts, 0, 10) || !optShot(value.fairway) || !optShot(value.green)) return null;
  if (typeof value.penaltyFairway !== "boolean" || typeof value.penaltyGreen !== "boolean" || !str(value.clientUpdatedAt) || !intIn(value.version, 1, 1_000_000)) return null;
  return value as unknown as HoleScoreEntry;
}

/** get_trip_round_scoring's answer, checked; null for anything unexpected. */
export function tripScoringFromJson(value: unknown): TripRoundScoring | null {
  if (!isObject(value) || !str(value.roundId) || !intIn(value.roundNumber, 1, 62) || !Array.isArray(value.groups) || !Array.isArray(value.entries)) return null;
  const groups: TripScoringGroup[] = [];
  for (const g of value.groups) {
    if (!isObject(g) || !str(g.id) || !intIn(g.groupNumber, 1, 50) || !(g.lockedAt === null || str(g.lockedAt)) || !Array.isArray(g.players)) return null;
    const players = g.players.map(playerFrom);
    if (players.some((p) => p === null)) return null;
    groups.push({ id: g.id as string, groupNumber: g.groupNumber as number, lockedAt: g.lockedAt as string | null, players: players as TripScoringPlayer[] });
  }
  const entries = value.entries.map(entryFrom);
  if (entries.some((e) => e === null)) return null;
  return { roundId: value.roundId as string, roundNumber: value.roundNumber as number, groups, entries: entries as HoleScoreEntry[] };
}

const blank = <T,>(fill: T) => Array.from({ length: HOLES }, () => fill);

/** The signed-in golfer's seat in the round: their group, who they attest, their own card and both attest columns. */
export function myScoringSeat(scoring: TripRoundScoring, profileId: string) {
  const group = scoring.groups.find((g) => g.players.some((p) => p.profileId === profileId));
  if (!group) return null;
  const me = group.players.find((p) => p.profileId === profileId) as TripScoringPlayer;
  const attestee = group.players.find((p) => p.attesterProfileId === profileId) ?? null;
  const entriesBy = (scored: string | null, by: string | null) => scoring.entries.filter((e) => e.scoredProfileId === scored && e.enteredByProfileId === by);
  const own = entriesBy(profileId, profileId), forMe = entriesBy(profileId, me.attesterProfileId), mine = entriesBy(attestee?.profileId ?? null, profileId);
  const card = { holes: blank<number | null>(null), putts: blank<number | null>(null), fairways: blank<ShotResult | null>(null), greens: blank<ShotResult | null>(null), penalties: blank<HolePenalties>({ fairway: false, green: false }).map((p) => ({ ...p })) };
  for (const e of own) {
    card.holes[e.hole - 1] = e.strokes; card.putts[e.hole - 1] = e.putts; card.fairways[e.hole - 1] = e.fairway; card.greens[e.hole - 1] = e.green;
    card.penalties[e.hole - 1] = { fairway: e.penaltyFairway, green: e.penaltyGreen };
  }
  const strokesOf = (list: HoleScoreEntry[]) => { const out = blank<number | null>(null); for (const e of list) out[e.hole - 1] = e.strokes; return out; };
  return {
    groupId: group.id, attesterId: me.attesterProfileId, attesteeId: attestee?.profileId ?? null, attesteeName: attestee?.displayName ?? null,
    submitted: me.submittedAt !== null, card, attestedForMe: strokesOf(forMe), myAttestEntries: strokesOf(mine),
    // What's already saved, so the sheet only sends holes that change.
    sentOwn: own.map((e): HoleEntryInput => ({ hole: e.hole, strokes: e.strokes, putts: e.putts, fairway: e.fairway, green: e.green, penaltyFairway: e.penaltyFairway, penaltyGreen: e.penaltyGreen })),
    sentAttest: mine.map((e): HoleEntryInput => ({ hole: e.hole, strokes: e.strokes })),
  };
}

type SheetColumns = { holes: (number | null)[]; putts?: (number | null)[]; fairways?: (ShotResult | null)[]; greens?: (ShotResult | null)[]; penalties?: HolePenalties[] };

/** The holes whose entry differs from what was last saved (a new hole, a change, or a stat cleared back to empty). */
export function changedEntries(sheet: SheetColumns, own: boolean, previous: HoleEntryInput[]): HoleEntryInput[] {
  const before = new Map(previous.map((e) => [e.hole, JSON.stringify(e)]));
  const out: HoleEntryInput[] = [];
  for (let i = 0; i < HOLES; i++) {
    const hole = i + 1;
    const entry: HoleEntryInput = own
      ? { hole, strokes: sheet.holes[i] ?? null, putts: sheet.putts?.[i] ?? null, fairway: sheet.fairways?.[i] ?? null, green: sheet.greens?.[i] ?? null,
          penaltyFairway: sheet.penalties?.[i]?.fairway ?? false, penaltyGreen: sheet.penalties?.[i]?.green ?? false }
      : { hole, strokes: sheet.holes[i] ?? null };
    const empty = entry.strokes === null && !entry.putts && entry.putts !== 0 && !entry.fairway && !entry.green && !entry.penaltyFairway && !entry.penaltyGreen;
    const text = JSON.stringify(entry);
    if (before.has(hole) ? before.get(hole) !== text : !empty) out.push(entry);
  }
  return out;
}

/** POST /api/golf-trips/<id>/scoring body → checked entries. Who is typing comes from the session, never the body. */
export function holeEntriesFromBody(body: unknown):
  { ok: true; groupId: string; scoredProfileId: string; clientUpdatedAt: string; entries: HoleEntryInput[] } | { ok: false; error: string } {
  if (!isObject(body) || typeof body.groupId !== "string" || !UUID.test(body.groupId) || typeof body.scoredProfileId !== "string" || !UUID.test(body.scoredProfileId))
    return { ok: false, error: "Invalid scoring request." };
  if (typeof body.clientUpdatedAt !== "string" || Number.isNaN(Date.parse(body.clientUpdatedAt))) return { ok: false, error: "Invalid scoring request." };
  if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > HOLES) return { ok: false, error: "Send 1 to 18 holes." };
  const entries: HoleEntryInput[] = [];
  for (const e of body.entries) {
    if (!isObject(e) || !intIn(e.hole, 1, HOLES) || !optInt(e.strokes, 1, 20) || !optInt(e.putts, 0, 10) || !optShot(e.fairway) || !optShot(e.green)) return { ok: false, error: "Check the hole scores." };
    if ((e.penaltyFairway !== undefined && typeof e.penaltyFairway !== "boolean") || (e.penaltyGreen !== undefined && typeof e.penaltyGreen !== "boolean")) return { ok: false, error: "Check the hole scores." };
    if (entries.some((x) => x.hole === e.hole)) return { ok: false, error: "Each hole once." };
    entries.push({ hole: e.hole as number, strokes: (e.strokes ?? null) as number | null, putts: (e.putts ?? null) as number | null, fairway: (e.fairway ?? null) as ShotResult | null,
      green: (e.green ?? null) as ShotResult | null, penaltyFairway: e.penaltyFairway === true, penaltyGreen: e.penaltyGreen === true });
  }
  return { ok: true, groupId: body.groupId, scoredProfileId: body.scoredProfileId, clientUpdatedAt: body.clientUpdatedAt, entries };
}
