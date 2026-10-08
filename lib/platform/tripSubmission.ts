import { tripScoringFromJson, type TripRoundScoring } from "./tripScoring";

/**
 * Permanent submission (Player & Attest Step 5). The server decides (supabase/golf_trip_scoring_submission.sql →
 * submit_trip_scorecard); these are the same rules in TypeScript, so the phone can explain a refusal before asking and
 * the rules are tested. A card can be submitted when:
 *   * the signed-in golfer is submitting their OWN card;
 *   * every hole 1–18 has their strokes, putts, fairway and green (trip courses have no pars yet, so every hole asks
 *     for a fairway, exactly as the Scoring sheet does);
 *   * their attester's strokes match theirs on every hole;
 *   * nothing changed since the phone last loaded the card (cardVersion), and nothing is still waiting to sync.
 * Once submitted, the card is locked: the database refuses any change to it, including late offline writes.
 */

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

export type SubmissionCheck =
  | { ok: true; alreadySubmitted?: true }
  | { ok: false; reason: "not-yours" | "no-attester" }
  | { ok: false; reason: "incomplete" | "mismatch"; holes: number[] };

export function submissionCheck(scoring: TripRoundScoring, actorId: string, golferId: string): SubmissionCheck {
  if (actorId !== golferId) return { ok: false, reason: "not-yours" };
  const me = scoring.groups.flatMap((g) => g.players).find((p) => p.profileId === golferId);
  if (!me) return { ok: false, reason: "not-yours" };
  if (me.submittedAt) return { ok: true, alreadySubmitted: true };
  if (!me.attesterProfileId) return { ok: false, reason: "no-attester" };
  const row = (by: string, hole: number) => scoring.entries.find((e) => e.scoredProfileId === golferId && e.enteredByProfileId === by && e.hole === hole);
  const incomplete = HOLES.filter((h) => { const e = row(golferId, h); return !e || e.strokes === null || e.putts === null || e.fairway === null || e.green === null; });
  if (incomplete.length) return { ok: false, reason: "incomplete", holes: incomplete };
  const mismatch = HOLES.filter((h) => row(me.attesterProfileId as string, h)?.strokes !== row(golferId, h)?.strokes);
  if (mismatch.length) return { ok: false, reason: "mismatch", holes: mismatch };
  return { ok: true };
}

/** The card's version: the sum of my own rows' and my attester's rows' versions (any change to either moves it). */
export function cardVersion(scoring: TripRoundScoring, golferId: string): number {
  const attester = scoring.groups.flatMap((g) => g.players).find((p) => p.profileId === golferId)?.attesterProfileId;
  return scoring.entries.filter((e) => e.scoredProfileId === golferId && (e.enteredByProfileId === golferId || e.enteredByProfileId === attester))
    .reduce((sum, e) => sum + e.version, 0);
}

export const submitBodyFrom = (groupId: string, golferProfileId: string, version: number) =>
  ({ groupId, golferProfileId, expectedProfileId: golferProfileId, cardVersion: version });

export type SubmitResult =
  | { status: "submitted" | "already-submitted"; submittedAt: string; scoring: TripRoundScoring | null }
  | { status: "rejected"; reason: "incomplete" | "mismatch" | "stale" | "no-attester"; holes: number[]; scoring: TripRoundScoring | null };

/** submit_trip_scorecard's answer, checked; null for anything unexpected. */
export function submitResultFromJson(value: unknown): SubmitResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const scoring = v.scoring === null || v.scoring === undefined ? null : tripScoringFromJson(v.scoring);
  if ((v.status === "submitted" || v.status === "already-submitted") && typeof v.submittedAt === "string") return { status: v.status, submittedAt: v.submittedAt, scoring };
  if (v.status === "rejected" && ["incomplete", "mismatch", "stale", "no-attester"].includes(String(v.reason)) && Array.isArray(v.holes) && v.holes.every((h) => Number.isInteger(h)))
    return { status: "rejected", reason: v.reason as "incomplete", holes: v.holes as number[], scoring };
  return null;
}

/** A refusal in plain words for the Card. */
export function submitRefusal(result: Extract<SubmitResult, { status: "rejected" }>): string {
  if (result.reason === "incomplete") return `Finish hole ${result.holes.join(", ")} before submitting.`;
  if (result.reason === "mismatch") return `Your attester's score doesn't match yours on hole ${result.holes.join(", ")}.`;
  if (result.reason === "stale") return "Scores changed while you were submitting. Check the card and submit again.";
  return "This card has no attester, so it can't be submitted.";
}
