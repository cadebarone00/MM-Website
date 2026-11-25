import { opResultsFromJson } from "@/lib/platform/tripScoring";
import type { SendBatch, SendResult } from "@/lib/platform/scoringSync";

type Reply = { status: number; body: unknown };
type Request = (path: string, init: { method: "POST"; body: unknown }) => Promise<Reply>;

/** Send the shared queue's idempotent operations with the account that created them. */
export function tripScoringTransport(tripId: string, profileId: string, request: Request): SendBatch {
  return async batch => {
    if (batch.ops.some(op => op.profileId !== profileId || op.tripId !== tripId || op.groupId !== batch.groupId || op.scoredProfileId !== batch.scoredProfileId)) return { ok: false, reason: "wrong-account" };
    let reply: Reply;
    try {
      reply = await request(`/api/golf-trips/${encodeURIComponent(tripId)}/scoring`, { method: "POST", body: {
        groupId: batch.groupId, scoredProfileId: batch.scoredProfileId, expectedProfileId: profileId,
        ops: batch.ops.map(op => ({ opId: op.opId, baseVersion: op.baseVersion, supersedes: op.supersedes, clientUpdatedAt: op.clientUpdatedAt, entry: op.entry, ...(op.correctionRequestId ? { correctionRequestId: op.correctionRequestId } : {}) })),
      } });
    } catch { return { ok: false, reason: "offline" }; }
    if (reply.status === 0) return { ok: false, reason: "offline" };
    if (reply.status === 401) return { ok: false, reason: "signed-out" };
    const body = reply.body && typeof reply.body === "object" ? reply.body as { ok?: unknown; reason?: unknown } : null;
    if (reply.status === 409 && body?.reason === "wrong-account") return { ok: false, reason: "wrong-account" };
    if (reply.status === 403 && body?.reason === "locked") return { ok: false, reason: "locked" };
    if (reply.status < 200 || reply.status >= 300 || body?.ok !== true) return { ok: false, reason: "error" };
    const parsed = opResultsFromJson(reply.body);
    if (!parsed || parsed.results.length !== batch.ops.length || new Set(parsed.results.map(result => result.opId)).size !== batch.ops.length || parsed.results.some(result => !batch.ops.some(op => op.opId === result.opId))) return { ok: false, reason: "error" };
    return { ok: true, results: parsed.results, scoring: parsed.scoring } satisfies SendResult;
  };
}
