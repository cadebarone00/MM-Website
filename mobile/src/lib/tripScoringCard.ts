import { cardFromEntries, mergeSent, myScoringSeat, type TripRoundScoring } from "@/lib/platform/tripScoring";
import type { QueuedOp } from "@/lib/platform/scoringQueue";

/** Merge pending or conflicted entries onto the authoritative card. Rejected writes never appear saved. */
export function tripScoringCard(scoring: TripRoundScoring, profileId: string, ops: QueuedOp[]) {
  const seat = myScoringSeat(scoring, profileId);
  if (!seat) return null;
  const mine = ops.filter(op => op.profileId === profileId && op.roundNumber === scoring.roundNumber && op.groupId === seat.groupId && op.status !== "rejected");
  const own = mine.filter(op => op.kind === "own" && op.scoredProfileId === profileId).map(op => op.entry);
  const attest = mine.filter(op => op.kind === "attest" && op.scoredProfileId === seat.attesteeId).map(op => op.entry);
  return { seat, card: cardFromEntries(mergeSent(seat.sentOwn, own), mergeSent(seat.sentAttest, attest)) };
}
