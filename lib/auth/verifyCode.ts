/**
 * Pending accounts Phase 6 — the pure rules behind POST /api/auth/verify-code (unit tested, no network): checking the
 * 6-digit code from a sign-up or password-reset email. Every failure that could depend on whether the address has an
 * account (wrong code, expired code, no such account, already verified) gets the SAME answer.
 */
import { createHash } from "node:crypto";

export type CodeKind = "signup" | "recovery";
export type VerifyCodeInput = { email: string; code: string; kind: CodeKind; app: boolean };

export const CODE_LENGTH = 6;
export const WRONG_CODE = "That code is wrong or has expired. Check your email, or send a new code.";
export const TOO_MANY_TRIES = "Too many tries. Wait 15 minutes, or send a new code.";

/** { email, code, type: "signup" | "recovery", client?: "app" }. */
export function verifyCodeInputFromBody(body: unknown): { ok: true; input: VerifyCodeInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (b.type !== "signup" && b.type !== "recovery") return { ok: false, error: "Unknown code type." };
  const code = typeof b.code === "string" ? b.code.trim() : "";
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) return { ok: false, error: `Enter the ${CODE_LENGTH}-digit code.` };
  return { ok: true, input: { email, code, kind: b.type, app: b.client === "app" } };
}

/** What the attempts table stores instead of the address. */
export const attemptKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

type AuthError = { code?: string; status?: number; message?: string } | null;
export type VerifyCodeFailure = { status: number; body: { ok: false; code: string; error: string } };

/** Supabase's verifyOtp error → reply. Only throttling and outages are told apart; everything else is "wrong code". */
export function verifyCodeFailure(error: NonNullable<AuthError>): VerifyCodeFailure {
  if (error.status === 429 || error.code === "over_request_rate_limit") return { status: 429, body: { ok: false, code: "too_many_attempts", error: TOO_MANY_TRIES } };
  if (typeof error.status === "number" && error.status >= 500) return { status: 503, body: { ok: false, code: "unavailable", error: "We couldn't check that code. Try again." } };
  return { status: 400, body: { ok: false, code: "invalid_code", error: WRONG_CODE } };
}
