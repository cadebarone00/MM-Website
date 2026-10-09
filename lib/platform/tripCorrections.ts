/**
 * Scorecard corrections (Player & Attest Step 6, supabase/golf_trip_scoring_corrections.sql). The database decides
 * everything (who may ask, who may decide, reopening, re-verification, history); this checks requests on the way in,
 * reads the answers, and shapes them for the Card.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["pending", "approved", "denied", "resubmitted"] as const;
export type CorrectionStatus = (typeof STATUSES)[number];

export interface CorrectionRequest {
  id: string; groupId: string; golferProfileId: string; revision: number; holes: number[]; reason: string; status: CorrectionStatus;
  requestedAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null; resubmittedAt: string | null;
  /** May the signed-in golfer approve / deny it (the database's rule: never your own request). */
  canDecide: boolean;
}
export interface SubmissionRevision { groupId: string; golferProfileId: string; revision: number; submittedAt: string; submittedBy: string; cardVersion: number; correctionRequestId: string | null; submittedByName: string }
export interface TripCorrections { isOrganizer: boolean; requests: CorrectionRequest[]; revisions: SubmissionRevision[] }

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string" && v.length > 0;
const optStr = (v: unknown) => v === null || typeof v === "string";
const holesOk = (v: unknown) => Array.isArray(v) && v.length >= 1 && v.length <= 18 && v.every((h) => Number.isInteger(h) && h >= 1 && h <= 18) && new Set(v).size === v.length;

export function correctionsFromJson(value: unknown): TripCorrections | null {
  if (!isObject(value) || typeof value.isOrganizer !== "boolean" || !Array.isArray(value.requests) || !Array.isArray(value.revisions)) return null;
  for (const r of value.requests) {
    if (!isObject(r) || !str(r.id) || !str(r.groupId) || !str(r.golferProfileId) || !Number.isInteger(r.revision) || !holesOk(r.holes) || typeof r.reason !== "string") return null;
    if (!STATUSES.includes(r.status as CorrectionStatus) || !str(r.requestedAt) || !optStr(r.decidedBy) || !optStr(r.decidedAt) || !optStr(r.decisionNote) || !optStr(r.resubmittedAt) || typeof r.canDecide !== "boolean") return null;
  }
  for (const v of value.revisions) {
    if (!isObject(v) || !str(v.groupId) || !str(v.golferProfileId) || !Number.isInteger(v.revision) || !str(v.submittedAt) || !str(v.submittedBy) || typeof v.submittedByName !== "string") return null;
  }
  return value as unknown as TripCorrections;
}

/** POST {action: "request"} body → checked. Holes are sorted; the reason is trimmed. */
export function correctionRequestFromBody(body: unknown):
  { ok: true; groupId: string; golferProfileId: string; expectedProfileId: string; holes: number[]; reason: string } | { ok: false; error: string } {
  if (!isObject(body) || typeof body.groupId !== "string" || !UUID.test(body.groupId) || typeof body.golferProfileId !== "string" || !UUID.test(body.golferProfileId)
      || typeof body.expectedProfileId !== "string") return { ok: false, error: "Invalid request." };
  if (!holesOk(body.holes)) return { ok: false, error: "Pick the holes to correct (each once, 1–18)." };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) return { ok: false, error: "Say why the card needs correcting (3–500 characters)." };
  return { ok: true, groupId: body.groupId, golferProfileId: body.golferProfileId, expectedProfileId: body.expectedProfileId, holes: [...(body.holes as number[])].sort((a, b) => a - b), reason };
}

/** POST {action: "decide"} body → checked. */
export function correctionDecisionFromBody(body: unknown):
  { ok: true; requestId: string; approve: boolean; note: string | null; expectedProfileId: string } | { ok: false; error: string } {
  if (!isObject(body) || typeof body.requestId !== "string" || !UUID.test(body.requestId) || typeof body.approve !== "boolean" || typeof body.expectedProfileId !== "string") return { ok: false, error: "Invalid request." };
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (note && note.length > 500) return { ok: false, error: "Keep the note under 500 characters." };
  return { ok: true, requestId: body.requestId, approve: body.approve, note, expectedProfileId: body.expectedProfileId };
}

/** What the Card shows: my latest request, my submission history, and the pending requests I may decide. */
export function correctionView(corrections: TripCorrections, profileId: string, nameOf: (profileId: string) => string) {
  const mine = corrections.requests.filter((r) => r.golferProfileId === profileId);
  return {
    myRequest: mine.at(-1) ?? null,
    revisions: corrections.revisions.filter((r) => r.golferProfileId === profileId),
    pending: corrections.requests.filter((r) => r.status === "pending" && r.canDecide)
      .map((r) => ({ id: r.id, name: nameOf(r.golferProfileId), holes: r.holes, reason: r.reason })),
  };
}
