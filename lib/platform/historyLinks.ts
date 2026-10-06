import type { PastTrip } from "./golfTripHistory";
import { buildPlayerRound, playerRoundId, type PlayerRound } from "./playerRounds";

/**
 * History → link a typed past-trip name to an account. The player must Accept before anything reaches their profile;
 * accepted rounds are "Entered by organizer" and never count toward handicap. The request carries a snapshot of the
 * player's rounds, so what they accept is exactly what they were shown.
 */
export interface HistoryLinkRequest {
  id: string;
  historyTripId: string;
  tripName: string;
  arrival: string;
  playerName: string;
  profileId: string;
  status: "pending" | "accepted" | "declined";
  rounds: { roundId: string; datePlayed: string | null; course: { ref: string | null; name: string; place: string }; total: number }[];
}
export type HistoryLinkInput = Omit<HistoryLinkRequest, "id" | "status">;

export function historyLinkInput(trip: PastTrip, playerName: string, profileId: string): HistoryLinkInput {
  return {
    historyTripId: trip.id, tripName: trip.name, arrival: trip.arrival, playerName, profileId,
    rounds: trip.rounds.filter((round) => round.scores[playerName] !== undefined).map((round) => ({
      roundId: round.id, datePlayed: round.date, course: { ref: round.course.ref, name: round.course.name, place: round.course.place }, total: round.scores[playerName],
    })),
  };
}

/** The live request for this past-trip name (pending or accepted); declined ones don't count. */
export function linkStatus(requests: HistoryLinkRequest[], historyTripId: string, playerName: string) {
  return requests.find((r) => r.historyTripId === historyTripId && r.playerName === playerName && r.status !== "declined") ?? null;
}

export function requestHistoryLink(requests: HistoryLinkRequest[], input: HistoryLinkInput): HistoryLinkRequest[] {
  if (!input.rounds.length) throw new Error(`${input.playerName} has no scores to link yet.`);
  const live = linkStatus(requests, input.historyTripId, input.playerName);
  if (live) throw new Error(live.status === "pending" ? `${input.playerName} is waiting on a request already.` : `${input.playerName} is already linked.`);
  return [...requests, { ...input, id: `link:${input.historyTripId}:${input.playerName}:${requests.length + 1}`, status: "pending" }];
}

/** Only a pending request can be answered; Accept adds the snapshot rounds (skipping any already saved). */
export function answerHistoryLink(requests: HistoryLinkRequest[], rounds: PlayerRound[], requestId: string, accept: boolean) {
  const request = requests.find((r) => r.id === requestId);
  if (!request || request.status !== "pending") return { requests, rounds };
  const nextRequests = requests.map((r) => r.id === requestId ? { ...r, status: accept ? "accepted" as const : "declined" as const } : r);
  if (!accept) return { requests: nextRequests, rounds };
  const saved = new Set(rounds.map((r) => r.id));
  const added = request.rounds.map((r) => buildPlayerRound({
    id: playerRoundId("history", request.historyTripId, r.roundId, request.profileId), profileId: request.profileId, source: "history",
    historyTripId: request.historyTripId, datePlayed: r.datePlayed ?? request.arrival, course: r.course, tee: null,
    holesPlayed: 18, format: "Stroke play", holes: [], total: r.total, enteredBy: "organizer",
  })).filter((r) => !saved.has(r.id));
  return { requests: nextRequests, rounds: [...rounds, ...added] };
}
