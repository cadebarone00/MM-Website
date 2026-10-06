import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { answerHistoryLink, requestHistoryLink, type HistoryLinkInput, type HistoryLinkRequest } from "@/lib/platform/historyLinks";
import { buildPlayerRound, holesFromCard, playerRoundId, type PlayerRound, type ScoredCard } from "@/lib/platform/playerRounds";
import { DEFAULT_ROUNDS_VISIBILITY, type RoundsVisibility } from "@/lib/platform/playerRoundsPrivacy";

/**
 * DEV ONLY: every mock account's saved rounds, privacy and History link requests — the stand-in for Step 2's tables.
 * Pure reducer here; components/dev/useDevPlayerRounds.ts keeps it in sessionStorage so the trip, the dev profile and
 * Organizer settings → History all share it.
 */
export interface DevRoundsState { rounds: PlayerRound[]; visibility: Record<string, RoundsVisibility>; linkRequests: HistoryLinkRequest[] }
export type DevRoundsAction =
  | { type: "saveRound"; round: PlayerRound }
  | { type: "setVisibility"; profileId: string; visibility: RoundsVisibility }
  | { type: "requestLink"; input: HistoryLinkInput }
  | { type: "answerLink"; requestId: string; accept: boolean };

export const DEV_TRIP_ID = "dev-trip";
/** The preview's courses have no real tee data; this rated tee lets dev trip rounds count. */
export const DEV_TRIP_TEE = { name: "Blue", rating: 71.4, slope: 131 };

export const devTripRoundId = (match: GolfMatchPreview) => `round-${match.round}`;
export function devTripRound(match: GolfMatchPreview, profileId: string, card: ScoredCard): PlayerRound {
  return buildPlayerRound({
    id: playerRoundId("trip", DEV_TRIP_ID, devTripRoundId(match), profileId), profileId, source: "trip", tripId: DEV_TRIP_ID, tripRoundId: devTripRoundId(match),
    datePlayed: match.roundDate, course: { ref: null, name: match.course, place: "" }, tee: DEV_TRIP_TEE,
    holesPlayed: 18, format: match.format, holes: holesFromCard(card, match.par), enteredBy: "player",
  });
}

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
    visibility: {}, linkRequests: [],
  };
}

export const visibilityOf = (state: DevRoundsState, profileId: string) => state.visibility[profileId] ?? DEFAULT_ROUNDS_VISIBILITY;

/** requestLink throws (duplicate / no scores) — the caller shows the message. */
export function devRoundsReducer(state: DevRoundsState, action: DevRoundsAction): DevRoundsState {
  switch (action.type) {
    case "saveRound": return state.rounds.some((r) => r.id === action.round.id) ? state : { ...state, rounds: [...state.rounds, action.round] };
    case "setVisibility": return { ...state, visibility: { ...state.visibility, [action.profileId]: action.visibility } };
    case "requestLink": return { ...state, linkRequests: requestHistoryLink(state.linkRequests, action.input) };
    case "answerLink": {
      const { requests, rounds } = answerHistoryLink(state.linkRequests, state.rounds, action.requestId, action.accept);
      return { ...state, linkRequests: requests, rounds };
    }
  }
}

/** sessionStorage text → state; anything unexpected → a fresh seed (never throws). */
export function parseDevRounds(text: string | null): DevRoundsState {
  try {
    const value = text ? JSON.parse(text) as Partial<DevRoundsState> : null;
    if (value && Array.isArray(value.rounds) && Array.isArray(value.linkRequests) && value.visibility && typeof value.visibility === "object") return value as DevRoundsState;
  } catch { /* fall through */ }
  return seedDevRounds();
}
