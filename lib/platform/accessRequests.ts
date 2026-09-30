/**
 * Beta creator-access requests (supabase/platform_access_requests.sql). A
 * request is only a record of interest; creating tournaments is still decided
 * by tournament_creator_access, which only a platform admin's approval sets.
 * Pure helpers here so the rules are testable.
 */
export type RequestStatus = "pending" | "approved" | "denied";

export interface AccessRequestInput {
  requesterName: string;
  groupName: string;
  seasonYear: number;
  expectedPlayers: number;
  destination: string | null;
  note: string | null;
}

/** What the requester sees about their own latest request (no ids, no reviewer). */
export interface MyAccessRequest extends AccessRequestInput {
  status: RequestStatus;
  decisionNote: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
}

export interface MyAccess {
  canCreate: boolean;
  request: MyAccessRequest | null;
}

/** One request as a platform admin reviews it. `reference` is a short number, not the row id. */
export interface AccessRequestForReview extends MyAccessRequest {
  reference: number;
  email: string;
  reviewedBy: string | null;
}

export const REQUEST_ACCESS_PATH = "/tournaments/request-access";
export const TOURNAMENT_ACCESS_ADMIN_PATH = "/admin/tournament-access";

export interface FieldError { field: keyof AccessRequestInput; message: string }

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Years a request may name: last year through five years out. */
export function requestYears(now = new Date()): number[] {
  const year = now.getFullYear();
  return Array.from({ length: 7 }, (_, index) => year - 1 + index);
}

export function validateAccessRequest(body: unknown, now = new Date()): { ok: true; data: AccessRequestInput } | { ok: false; errors: FieldError[] } {
  const raw = (body !== null && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: FieldError[] = [];
  const requesterName = text(raw.requesterName);
  const groupName = text(raw.groupName);
  const destination = text(raw.destination);
  const note = text(raw.note);
  const seasonYear = Number(raw.seasonYear);
  const expectedPlayers = Number(raw.expectedPlayers);
  if (requesterName.length < 1 || requesterName.length > 80) errors.push({ field: "requesterName", message: "Enter your name (up to 80 characters)." });
  if (groupName.length < 1 || groupName.length > 80) errors.push({ field: "groupName", message: "Enter your tournament or group name (up to 80 characters)." });
  if (!Number.isInteger(seasonYear) || !requestYears(now).includes(seasonYear)) errors.push({ field: "seasonYear", message: "Choose the year of your tournament." });
  if (!Number.isInteger(expectedPlayers) || expectedPlayers < 2 || expectedPlayers > 500) errors.push({ field: "expectedPlayers", message: "Enter an approximate player count between 2 and 500." });
  if (destination.length > 120) errors.push({ field: "destination", message: "Keep the location under 120 characters." });
  if (note.length > 1000) errors.push({ field: "note", message: "Keep the note under 1,000 characters." });
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { requesterName, groupName, seasonYear, expectedPlayers, destination: destination || null, note: note || null } };
}

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const status = (value: unknown): RequestStatus | null => (value === "pending" || value === "approved" || value === "denied" ? value : null);

function parseRequest(raw: unknown): MyAccessRequest | null {
  const r = (raw !== null && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  const s = r && status(r.status);
  if (!r || !s) return null;
  return {
    status: s, requesterName: String(r.requesterName ?? ""), groupName: String(r.groupName ?? ""), seasonYear: Number(r.seasonYear),
    expectedPlayers: Number(r.expectedPlayers), destination: str(r.destination), note: str(r.note), decisionNote: str(r.decisionNote),
    createdAt: str(r.createdAt), reviewedAt: str(r.reviewedAt),
  };
}

/** get_my_tournament_access's jsonb → MyAccess. */
export function parseMyAccess(raw: unknown): MyAccess {
  const root = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { canCreate: root.canCreate === true, request: parseRequest(root.request) };
}

/** list_tournament_access_requests's jsonb → review rows. */
export function parseRequestsForReview(raw: unknown): AccessRequestForReview[] {
  return (Array.isArray(raw) ? raw : []).flatMap((row) => {
    const request = parseRequest(row);
    const r = row as Record<string, unknown>;
    return request && Number.isInteger(Number(r.reference))
      ? [{ ...request, reference: Number(r.reference), email: String(r.email ?? ""), reviewedBy: str(r.reviewedBy) }] : [];
  });
}

/** Maps a request-access database error to what the person sees. */
export function accessRequestFailure(error: { code?: string; message?: string; hint?: string }): { status: number; error: string } {
  if (error.code === "P0001" && error.hint === "already_approved") return { status: 409, error: "You can already create tournaments." };
  if (error.code === "P0001" && error.hint === "denied") return { status: 409, error: "Your earlier request wasn't approved. Contact us to talk about it." };
  if (error.code === "P0001" && error.hint === "already_reviewed") return { status: 409, error: "This request was already reviewed." };
  if (error.code === "P0002") return { status: 404, error: "Request not found." };
  if (error.code === "22023") return { status: 400, error: "Choose approve or deny." };
  if (error.code === "42501") return { status: 404, error: "Not found." };
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "PGRST205") {
    return { status: 503, error: "Access requests aren't switched on yet." };
  }
  return { status: 500, error: "Something went wrong. Try again." };
}
