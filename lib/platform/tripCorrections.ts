/**
 * Scorecard corrections (Player & Attest Step 6, supabase/golf_trip_scoring_corrections.sql). The database decides
 * everything (who may ask, who may decide, who may see, reopening, re-verification, history); this checks requests on
 * the way in, reads the answers, and shapes them for the Card and Trip Settings → Corrections.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["pending", "approved", "denied", "resubmitted"] as const;
export type CorrectionStatus = (typeof STATUSES)[number];

export interface CorrectionRequest {
  id: string; groupId: string; golferProfileId: string; revision: number; holes: number[]; reason: string; status: CorrectionStatus;
  requestedAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null; resubmittedAt: string | null;
  /** May the signed-in golfer approve / deny it (the database's rule: never your own request). */
  canDecide: boolean;
  golferName: string; decidedByName: string | null; roundNumber: number; playDate: string | null;
}
/** One hole of a stored submission snapshot (exactly as the database saved it; never recalculated). */
export interface RevisionHole { hole: number; strokes: number | null; putts: number | null; fairway: string | null; green: string | null; attestStrokes: number | null }
export interface SubmissionRevision {
  groupId: string; golferProfileId: string; revision: number; submittedAt: string; submittedBy: string; cardVersion: number; correctionRequestId: string | null; submittedByName: string;
  /** The reason of the correction this revision answered (null for revision 1). */
  reason: string | null;
  /** The current official submission (the others are superseded). */
  isCurrent: boolean;
  card: RevisionHole[];
}
export interface TripCorrections { isOrganizer: boolean; requests: CorrectionRequest[]; revisions: SubmissionRevision[] }
/** Trip Settings → Corrections: every round (with its own date) and every request I may see, on any day. */
export interface TripCorrectionList {
  isOrganizer: boolean;
  rounds: { roundNumber: number; playDate: string | null; courseName: string | null; played: boolean; mySubmitted: boolean; myReopened: boolean }[];
  requests: CorrectionRequest[];
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string" && v.length > 0;
const optStr = (v: unknown) => v === null || typeof v === "string";
const optInt = (v: unknown) => v === null || v === undefined || Number.isInteger(v);
const holesOk = (v: unknown) => Array.isArray(v) && v.length >= 1 && v.length <= 18 && v.every((h) => Number.isInteger(h) && h >= 1 && h <= 18) && new Set(v).size === v.length;

function requestOk(r: unknown): boolean {
  if (!isObject(r) || !str(r.id) || !str(r.groupId) || !str(r.golferProfileId) || !Number.isInteger(r.revision) || !holesOk(r.holes) || typeof r.reason !== "string") return false;
  if (!STATUSES.includes(r.status as CorrectionStatus) || !str(r.requestedAt) || !optStr(r.decidedBy) || !optStr(r.decidedAt) || !optStr(r.decisionNote) || !optStr(r.resubmittedAt) || typeof r.canDecide !== "boolean") return false;
  return typeof r.golferName === "string" && optStr(r.decidedByName ?? null) && Number.isInteger(r.roundNumber) && optStr(r.playDate ?? null);
}
const holeOk = (h: unknown) => isObject(h) && Number.isInteger(h.hole) && (h.hole as number) >= 1 && (h.hole as number) <= 18
  && optInt(h.strokes) && optInt(h.putts) && optStr(h.fairway ?? null) && optStr(h.green ?? null) && optInt(h.attestStrokes);

export function correctionsFromJson(value: unknown): TripCorrections | null {
  if (!isObject(value) || typeof value.isOrganizer !== "boolean" || !Array.isArray(value.requests) || !Array.isArray(value.revisions)) return null;
  if (!value.requests.every(requestOk)) return null;
  for (const v of value.revisions) {
    if (!isObject(v) || !str(v.groupId) || !str(v.golferProfileId) || !Number.isInteger(v.revision) || !str(v.submittedAt) || !str(v.submittedBy) || typeof v.submittedByName !== "string") return null;
    if (!optStr(v.reason ?? null) || typeof v.isCurrent !== "boolean" || !Array.isArray(v.card) || !v.card.every(holeOk)) return null;
  }
  return value as unknown as TripCorrections;
}

export function tripCorrectionListFromJson(value: unknown): TripCorrectionList | null {
  if (!isObject(value) || typeof value.isOrganizer !== "boolean" || !Array.isArray(value.rounds) || !Array.isArray(value.requests)) return null;
  for (const r of value.rounds) {
    if (!isObject(r) || !Number.isInteger(r.roundNumber) || !optStr(r.playDate) || !optStr(r.courseName) || typeof r.played !== "boolean"
      || typeof r.mySubmitted !== "boolean" || typeof r.myReopened !== "boolean") return null;
  }
  return value.requests.every(requestOk) ? value as unknown as TripCorrectionList : null;
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

/** POST {action: "decide"} body → checked. Denying needs a reason (the database requires it too). */
export function correctionDecisionFromBody(body: unknown):
  { ok: true; requestId: string; approve: boolean; note: string | null; expectedProfileId: string } | { ok: false; error: string } {
  if (!isObject(body) || typeof body.requestId !== "string" || !UUID.test(body.requestId) || typeof body.approve !== "boolean" || typeof body.expectedProfileId !== "string") return { ok: false, error: "Invalid request." };
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (note && note.length > 500) return { ok: false, error: "Keep the note under 500 characters." };
  if (!body.approve && !note) return { ok: false, error: "Say why the request is denied." };
  return { ok: true, requestId: body.requestId, approve: body.approve, note, expectedProfileId: body.expectedProfileId };
}

/** What the Card shows: my latest request, my submission history (with snapshots), and the pending requests I may decide. */
export function correctionView(corrections: TripCorrections, profileId: string) {
  const mine = corrections.requests.filter((r) => r.golferProfileId === profileId);
  return {
    myRequest: mine.at(-1) ?? null,
    revisions: corrections.revisions.filter((r) => r.golferProfileId === profileId),
    pending: corrections.requests.filter((r) => r.status === "pending" && r.canDecide)
      .map((r) => ({ id: r.id, name: r.golferName, holes: r.holes, reason: r.reason })),
  };
}

/**
 * Which holes can change right now because of an approved correction (null = no open correction there):
 *   own     my card is reopened: only these holes of my card;
 *   attest  the golfer I attest is reopened: only these holes of my attest column, made for `attestRequestId`.
 */
export function openCorrectionHoles(corrections: TripCorrections | null, profileId: string, attesteeId: string | null) {
  const approved = (golfer: string | null) => golfer ? corrections?.requests.find((r) => r.golferProfileId === golfer && r.status === "approved") ?? null : null;
  const mine = approved(profileId), theirs = approved(attesteeId);
  return { own: mine?.holes ?? null, attest: theirs?.holes ?? null, attestRequestId: theirs?.id ?? null };
}

/**
 * May this hole be edited on the phone? With an open correction, only its holes (even when my own card is submitted,
 * my attest column re-attests a reopened golfer); otherwise everything until the card is submitted. The database
 * enforces the same rules; this keeps the screen from showing values it would refuse.
 */
export const holeEditable = (open: number[] | null | undefined, submitted: boolean, hole: number) => open ? open.includes(hole) : !submitted;
