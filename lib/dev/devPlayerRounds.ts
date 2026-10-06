import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { answerHistoryLink, requestHistoryLink, type HistoryLinkInput, type HistoryLinkRequest } from "@/lib/platform/historyLinks";
import { buildPlayerRound, holesFromCard, playerRoundId, type PlayerRound, type ScoredCard } from "@/lib/platform/playerRounds";
import { DEFAULT_ROUNDS_VISIBILITY, type RoundsVisibility } from "@/lib/platform/playerRoundsPrivacy";
import { scoredCardFrom, type LiveCard } from "@/lib/platform/liveCards";
import { overrideHole, pushThrough, type OverrideInput, type PushChoice } from "@/lib/platform/scoreEdits";
import type { TripRoundState } from "@/lib/platform/tripRoundState";
import type { DevGroup } from "./devTripScores";

/**
 * DEV ONLY: every mock account's saved rounds, privacy and History link requests — the stand-in for Step 2's tables.
 * Pure reducer here; components/dev/useDevPlayerRounds.ts keeps it in sessionStorage so the trip, the dev profile and
 * Organizer settings → History all share it.
 */
/** What a trip round's saved card needs (so Organizer settings can save a pushed-through card without the match). */
export interface DevRoundMeta { tripRoundId: string; course: string; datePlayed: string; format: string; par: number[] }
export interface DevLiveCard extends LiveCard { meta: DevRoundMeta }
export interface DevRoundsState {
  rounds: PlayerRound[]; visibility: Record<string, RoundsVisibility>; linkRequests: HistoryLinkRequest[];
  /** Player & Attest add-on: in-progress cards, the preview's groups, Start / End round, the organizer's push-through setting, attester swaps ("groupId|profileId" → attester). */
  liveCards: DevLiveCard[]; groups: DevGroup[]; tripRounds: Record<string, TripRoundState>; allowPushThrough: boolean; attesters: Record<string, string>;
}
export type DevRoundsAction =
  | { type: "saveRound"; round: PlayerRound }
  | { type: "setVisibility"; profileId: string; visibility: RoundsVisibility }
  | { type: "requestLink"; input: HistoryLinkInput }
  | { type: "answerLink"; requestId: string; accept: boolean }
  | { type: "saveLiveCard"; card: DevLiveCard }
  | { type: "saveGroup"; group: DevGroup }
  | { type: "setTripRound"; tripRoundId: string; state: "open" | "closed"; at: string }
  | { type: "setAllowPushThrough"; on: boolean }
  | { type: "swapAttester"; groupId: string; profileId: string; attesterProfileId: string }
  | { type: "overrideHole"; roundId: string; input: OverrideInput }
  | { type: "pushThrough"; groupId: string; profileId: string; choices: Record<number, PushChoice>; byProfileId: string; at: string; reason: string }
  | { type: "removeFromProfile"; roundId: string; profileId: string };

export const DEV_TRIP_ID = "dev-trip";
/** The preview's courses have no real tee data; this rated tee lets dev trip rounds count. */
export const DEV_TRIP_TEE = { name: "Blue", rating: 71.4, slope: 131 };

export const devTripRoundId = (match: GolfMatchPreview) => `round-${match.round}`;
export const devRoundMeta = (match: GolfMatchPreview): DevRoundMeta => ({ tripRoundId: devTripRoundId(match), course: match.course, datePlayed: match.roundDate, format: match.format, par: match.par });
export function devTripRoundFrom(meta: DevRoundMeta, profileId: string, card: ScoredCard, extra: Pick<PlayerRound, "groupId" | "edits"> = {}): PlayerRound {
  return buildPlayerRound({
    id: playerRoundId("trip", DEV_TRIP_ID, meta.tripRoundId, profileId), profileId, source: "trip", tripId: DEV_TRIP_ID, tripRoundId: meta.tripRoundId,
    datePlayed: meta.datePlayed, course: { ref: null, name: meta.course, place: "" }, tee: DEV_TRIP_TEE,
    holesPlayed: 18, format: meta.format, holes: holesFromCard(card, meta.par), enteredBy: "player", ...extra,
  });
}
export const devTripRound = (match: GolfMatchPreview, profileId: string, card: ScoredCard, extra: Pick<PlayerRound, "groupId" | "edits"> = {}) =>
  devTripRoundFrom(devRoundMeta(match), profileId, card, extra);

/** A logged-myself round with an 18-hole card that adds up to `total` (so it counts). */
function seedRound(profileId: string, n: number, datePlayed: string, total: number): PlayerRound {
  const strokes = Array.from({ length: 18 }, (_, i) => Math.floor(total / 18) + (i < total % 18 ? 1 : 0));
  return buildPlayerRound({
    id: playerRoundId("personal", profileId, String(n)), profileId, source: "personal", datePlayed,
    course: { ref: null, name: "Cedar Crest GC", place: "Dallas, TX" }, tee: { name: "White", rating: 70.1, slope: 124 },
    holesPlayed: 18, format: "Stroke play", enteredBy: "player",
    holes: strokes.map((s, i) => ({ number: i + 1, par: 4, strokes: s, putts: 2, fairway: null, green: null })),
  });
}

export function seedDevRounds(): DevRoundsState {
  return {
    rounds: [
      seedRound("dev-cade", 1, "2027-03-02", 84), seedRound("dev-cade", 2, "2027-03-16", 81),
      seedRound("dev-jake", 1, "2027-02-20", 92), seedRound("dev-jake", 2, "2027-03-06", 88), seedRound("dev-jake", 3, "2027-03-27", 90),
    ],
    visibility: {}, linkRequests: [], liveCards: [], groups: [], tripRounds: {}, allowPushThrough: false, attesters: {},
  };
}

export const visibilityOf = (state: DevRoundsState, profileId: string) => state.visibility[profileId] ?? DEFAULT_ROUNDS_VISIBILITY;

/** requestLink throws (duplicate / no scores) — the caller shows the message. */
export function devRoundsReducer(state: DevRoundsState, action: DevRoundsAction): DevRoundsState {
  switch (action.type) {
    case "saveRound": {
      if (state.rounds.some((r) => r.id === action.round.id)) return state;
      const liveCards = state.liveCards.filter((c) => !(c.profileId === action.round.profileId && c.groupId === action.round.groupId));
      return { ...state, rounds: [...state.rounds, action.round], liveCards };
    }
    case "setVisibility": return { ...state, visibility: { ...state.visibility, [action.profileId]: action.visibility } };
    case "requestLink": return { ...state, linkRequests: requestHistoryLink(state.linkRequests, action.input) };
    case "answerLink": {
      const { requests, rounds } = answerHistoryLink(state.linkRequests, state.rounds, action.requestId, action.accept);
      return { ...state, linkRequests: requests, rounds };
    }
    case "saveLiveCard": {
      const same = (c: DevLiveCard) => c.groupId === action.card.groupId && c.profileId === action.card.profileId;
      const existing = state.liveCards.find(same);
      if (existing && JSON.stringify(existing) === JSON.stringify(action.card)) return state; // the sheet reports every change
      return { ...state, liveCards: [...state.liveCards.filter((c) => !same(c)), action.card] };
    }
    case "saveGroup": {
      const existing = state.groups.find((g) => g.id === action.group.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(action.group)) return state;
      return { ...state, groups: [...state.groups.filter((g) => g.id !== action.group.id), action.group] };
    }
    case "setTripRound": {
      const before = state.tripRounds[action.tripRoundId];
      const entry: TripRoundState = action.state === "open" ? { ...before, state: "open", openedAt: action.at } : { ...before, state: "closed", closedAt: action.at };
      return { ...state, tripRounds: { ...state.tripRounds, [action.tripRoundId]: entry } };
    }
    case "setAllowPushThrough": return { ...state, allowPushThrough: action.on };
    case "swapAttester": return { ...state, attesters: { ...state.attesters, [`${action.groupId}|${action.profileId}`]: action.attesterProfileId } };
    case "overrideHole": return { ...state, rounds: state.rounds.map((r) => r.id === action.roundId ? overrideHole(r, action.input) : r) };
    case "pushThrough": {
      if (!state.allowPushThrough) throw new Error("Allow push-through is off in Organizer settings.");
      const card = state.liveCards.find((c) => c.groupId === action.groupId && c.profileId === action.profileId);
      if (!card) throw new Error("No card to push through.");
      const { strokes, edits } = pushThrough(card, action.choices, action.byProfileId, action.at, action.reason);
      const round = devTripRoundFrom(card.meta, card.profileId, scoredCardFrom(card, strokes), { groupId: card.groupId, edits });
      return devRoundsReducer(state, { type: "saveRound", round });
    }
    case "removeFromProfile": {
      const round = state.rounds.find((r) => r.id === action.roundId);
      if (!round) return state;
      if (round.profileId !== action.profileId) throw new Error("Only the player can remove a round from their profile.");
      return { ...state, rounds: state.rounds.map((r) => r.id === action.roundId ? { ...r, removedFromProfile: true } : r) };
    }
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isRound = (value: unknown) => isObject(value) && typeof value.id === "string" && typeof value.profileId === "string"
  && typeof value.datePlayed === "string" && Array.isArray(value.holes) && typeof value.total === "number" && typeof value.countsForHandicap === "boolean"
  && isObject(value.course) && typeof value.course.name === "string";
const isLinkRequest = (value: unknown) => isObject(value) && typeof value.id === "string" && typeof value.profileId === "string"
  && ["pending", "accepted", "declined"].includes(String(value.status)) && Array.isArray(value.rounds);

/** sessionStorage text → state; anything unexpected (bad JSON, an older shape, one malformed entry) → a fresh seed (never throws). */
export function parseDevRounds(text: string | null): DevRoundsState {
  try {
    const value: unknown = text ? JSON.parse(text) : null;
    if (isObject(value) && Array.isArray(value.rounds) && value.rounds.every(isRound) && Array.isArray(value.linkRequests) && value.linkRequests.every(isLinkRequest)
      && isObject(value.visibility) && Object.values(value.visibility).every((v) => v === "public" || v === "private")) {
      // Tabs saved before the Player & Attest add-on keep their rounds; the new parts start empty.
      return { ...(value as unknown as DevRoundsState),
        liveCards: Array.isArray(value.liveCards) ? value.liveCards as DevLiveCard[] : [],
        groups: Array.isArray(value.groups) ? value.groups as DevGroup[] : [],
        tripRounds: isObject(value.tripRounds) ? value.tripRounds as Record<string, TripRoundState> : {},
        allowPushThrough: value.allowPushThrough === true,
        attesters: isObject(value.attesters) ? value.attesters as Record<string, string> : {} };
    }
  } catch { /* fall through */ }
  return seedDevRounds();
}
