/**
 * Pending accounts Phase 3 — the pure rules behind the account onboarding APIs (unit tested, no network):
 * which onboarding step comes next, and how database answers become API replies. Nothing here ever carries a
 * birthdate, an age, or another account's data.
 */
import type { AccountLifecycle } from "@/lib/profile/currentProfile";

/** Yes/no facts from account_onboarding_progress() (supabase/account_activation.sql). */
export type OnboardingProgress = {
  verified: boolean;
  birthday: boolean;
  termsConfigured: boolean;
  termsAccepted: boolean;
  activationEnabled: boolean;
};

/** The approved screen order (project_specs.md §1); photo is optional and never "required next". */
export type OnboardingStep =
  | "welcome" | "verification" | "name_username" | "birthday" | "terms" | "settings" | "play" | "ineligible" | "restricted" | "closed";

export type ResumeReply =
  | { status: 200; body: { ok: true; state: AccountLifecycle["state"]; next: OnboardingStep; activationAvailable: boolean } }
  | { status: 401 | 503; body: { ok: false; code: "signed_out" | "unavailable"; next: OnboardingStep | null } };

/** Where a person should be sent: the first unfinished REQUIRED step, or Play / a blocked screen. */
export function resumeReply(lifecycle: AccountLifecycle, progress: OnboardingProgress | null): ResumeReply {
  switch (lifecycle.state) {
    case "signed-out": return { status: 401, body: { ok: false, code: "signed_out", next: "welcome" } };
    case "unavailable": return { status: 503, body: { ok: false, code: "unavailable", next: null } };
    case "deleted": return ok(lifecycle.state, "closed", false);
    case "ineligible": return ok(lifecycle.state, "ineligible", false);
    case "restricted": return ok(lifecycle.state, "restricted", false);
    case "active": return ok(lifecycle.state, "play", false);
    case "active_needs_birthday": return ok(lifecycle.state, "birthday", false);
    case "pending": {
      if (!progress) return { status: 503, body: { ok: false, code: "unavailable", next: null } };
      const available = progress.activationEnabled && progress.termsConfigured;
      if (!progress.verified) return ok("pending", "verification", available);
      if (lifecycle.details !== "complete") return ok("pending", "name_username", available);
      if (!progress.birthday) return ok("pending", "birthday", available);
      if (progress.termsConfigured && !progress.termsAccepted) return ok("pending", "terms", available);
      return ok("pending", "settings", available);
    }
  }
}
const ok = (state: AccountLifecycle["state"], next: OnboardingStep, activationAvailable: boolean): ResumeReply =>
  ({ status: 200, body: { ok: true, state, next, activationAvailable } });

/** True when the browser's Origin header names one of the hosts this request was addressed to (cross-site guard). */
export function originMatchesHost(origin: string, hosts: (string | null | undefined)[]): boolean {
  let host: string;
  try { host = new URL(origin).host.toLowerCase(); } catch { return false; }
  return hosts.some((h) => !!h && h.split(",")[0].trim().toLowerCase() === host);
}

// === Shared error shape ===================================================================================================
export type ApiError = { status: number; body: { ok: false; code: string; error: string; missing?: string[] } };
export const apiError = (status: number, code: string, error: string, extra: { missing?: string[] } = {}): ApiError =>
  ({ status, body: { ok: false, code, error, ...extra } });

/** The lifecycle states that may not use these APIs at all, with their fixed replies. Null = allowed to continue. */
export function blockedLifecycle(lifecycle: AccountLifecycle, allow: AccountLifecycle["state"][]): ApiError | null {
  if (allow.includes(lifecycle.state)) return null;
  switch (lifecycle.state) {
    case "signed-out": return apiError(401, "signed_out", "Log in first.");
    case "unavailable": return apiError(503, "unavailable", "Accounts aren't switched on yet. Try again later.");
    case "deleted": return apiError(403, "account_closed", "This account is closed.");
    case "ineligible": return apiError(403, "not_eligible", "This account can't use The Maroon.");
    case "restricted": return apiError(403, "restricted", "This account is being reviewed. Contact support.");
    default: return apiError(409, "not_allowed_now", "That isn't available for this account right now.");
  }
}

/** A Supabase RPC error, reduced to what a reply needs (never the raw message, which can include values). */
export type RpcError = { code?: string; message?: string } | null;
const isMissing = (e: RpcError) => !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? ""));

// === Birthday =============================================================================================================
export type BirthdayReply = { status: 200; body: { ok: true; eligible: boolean; next: OnboardingStep } } | ApiError;

export function birthdayReply(error: RpcError, data: unknown): BirthdayReply {
  if (error) {
    if (isMissing(error)) return apiError(503, "unavailable", "Birthdays aren't switched on yet. Try again later.");
    if (/already saved/i.test(error.message ?? "")) return apiError(409, "birthday_already_saved", "Your birthday is already saved. Contact support to correct it.");
    if (/real date/i.test(error.message ?? "")) return apiError(400, "invalid_birthdate", "Enter your real date of birth.");
    if (/closed/i.test(error.message ?? "")) return apiError(403, "account_closed", "This account is closed.");
    return apiError(500, "failed", "We couldn't save that. Try again.");
  }
  const eligible = (data as { eligible?: unknown } | null)?.eligible;
  if (typeof eligible !== "boolean") return apiError(500, "failed", "We couldn't save that. Try again.");
  return { status: 200, body: { ok: true, eligible, next: eligible ? "settings" : "ineligible" } };
}

// === Finish ===============================================================================================================
export type FinishInvitation = { outcome: string; tripId: string | null };
export type FinishReply = { status: 200; body: { ok: true; activated: true; already: boolean; invitations: FinishInvitation[] } } | ApiError;

/** Finish's answer. Success ONLY when the database says activated AND the lifecycle read back afterwards is active. */
export function finishReply(error: RpcError, data: unknown, confirmedState: string | null): FinishReply {
  if (error) {
    if (isMissing(error)) return apiError(503, "unavailable", "Accounts aren't switched on yet. Try again later.");
    if (error.code === "55000" || /not enabled/i.test(error.message ?? "")) return apiError(503, "activation_disabled", "Finishing sign-up isn't open yet. Your progress is saved.");
    if (/closed/i.test(error.message ?? "")) return apiError(403, "account_closed", "This account is closed.");
    return apiError(500, "failed", "We couldn't finish that. Your progress is saved — try again.");
  }
  const r = (data ?? {}) as { activated?: unknown; already?: unknown; missing?: unknown; state?: unknown; invitations?: unknown };
  if (r.activated !== true) {
    if (r.state === "ineligible") return apiError(403, "not_eligible", "This account can't use The Maroon.");
    if (r.state === "review") return apiError(403, "restricted", "This account is being reviewed. Contact support.");
    const missing = Array.isArray(r.missing) ? r.missing.filter((m): m is string => typeof m === "string") : [];
    if (missing.length) return apiError(409, "incomplete", "A few things are still needed before you can finish.", { missing });
    return apiError(500, "failed", "We couldn't finish that. Your progress is saved — try again.");
  }
  if (confirmedState !== "active") return apiError(500, "not_confirmed", "We couldn't confirm your account. Your progress is saved — try again.");
  const invitations = (Array.isArray(r.invitations) ? r.invitations : []).map((i) => {
    const x = (i ?? {}) as { outcome?: unknown; tripId?: unknown };
    return { outcome: typeof x.outcome === "string" ? x.outcome : "skipped", tripId: typeof x.tripId === "string" ? x.tripId : null };
  });
  return { status: 200, body: { ok: true, activated: true, already: r.already === true, invitations } };
}

// === Birthday correction ==================================================================================================
export const CORRECTION_REASON_MAX = 500;
export type CorrectionReply = { status: 200; body: { ok: true; status: "received" } } | ApiError;

export function correctionReasonFromBody(body: unknown): string | null {
  const reason = (body as { reason?: unknown } | null)?.reason;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  return trimmed.length >= 1 && trimmed.length <= CORRECTION_REASON_MAX ? trimmed : null;
}

export function correctionReply(error: RpcError): CorrectionReply {
  if (!error) return { status: 200, body: { ok: true, status: "received" } };
  if (isMissing(error)) return apiError(503, "unavailable", "Corrections aren't switched on yet. Contact support.");
  if (error.code === "54000" || /too many/i.test(error.message ?? "")) return apiError(429, "too_many_requests", "Too many correction requests. Contact support.");
  if (/already have an open/i.test(error.message ?? "")) return apiError(409, "already_open", "You already have a correction request open. We'll be in touch.");
  if (/no birthday/i.test(error.message ?? "")) return apiError(409, "no_birthday", "There's no birthday to correct yet.");
  if (/closed/i.test(error.message ?? "")) return apiError(403, "account_closed", "This account is closed.");
  return apiError(500, "failed", "We couldn't send that. Try again.");
}

// === Terms ================================================================================================================
export type CurrentVersions = { terms: string | null; privacy: string | null };

/** { termsVersion, privacyVersion } must both name the CURRENT versions (the server re-checks against the database). */
export function acceptedVersionsFromBody(body: unknown, current: CurrentVersions): ApiError | { terms: string; privacy: string } {
  if (!current.terms || !current.privacy) return apiError(503, "terms_not_configured", "The Terms aren't available yet.");
  const b = (body ?? {}) as { termsVersion?: unknown; privacyVersion?: unknown };
  if (b.termsVersion !== current.terms || b.privacyVersion !== current.privacy) {
    return apiError(409, "version_mismatch", "The Terms or Privacy Policy changed. Review the latest version and accept again.");
  }
  return { terms: current.terms, privacy: current.privacy };
}
