/**
 * Birthday-first sign-up (G4, docs/v2-auth-enforcement-spec-2026-10-30.md). Pure helpers, unit tested.
 *
 * The 13+ answer is enforced by the DATABASE, not by this code: POST /api/auth/age-check stores a pass (birthdate held
 * server-side) only for 13+, keyed by the SHA-256 of a random nonce; the sign-up request binds that pass to its email; and
 * Supabase Auth's Before User Created hook (supabase/signup_gate.sql) refuses any new login without a matching, unused,
 * unexpired pass. The nonce itself only proves "this browser / app passed the birthday step"; it never carries the date.
 * Under 13: nothing is stored anywhere and the reply is the same neutral sentence every time.
 */
import { createHash, randomBytes } from "node:crypto";
import { checkBirthdate } from "@/lib/account/age";

export const AGE_PASS_COOKIE = "maroon_age_pass";
export const AGE_PASS_MINUTES = 30;
export const NOT_ELIGIBLE = "Sorry, you're not eligible to create an account on The Maroon.";

const NONCE = /^[0-9a-f]{64}$/;

export const agePassHash = (nonce: string) => createHash("sha256").update(nonce, "utf8").digest("hex");
export function newAgePass(): { nonce: string; nonceHash: string } {
  const nonce = randomBytes(32).toString("hex");
  return { nonce, nonceHash: agePassHash(nonce) };
}

export type AgeCheckParse =
  | { ok: true; birthdate: string; eligible: boolean; app: boolean }
  | { ok: false; error: string };

/** { birthdate: "YYYY-MM-DD", client?: "app" }. Only checks the date and the 13+ rule; stores nothing. */
export function ageCheckInputFromBody(body: unknown, today?: Parameters<typeof checkBirthdate>[1]): AgeCheckParse {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const check = checkBirthdate(record.birthdate, today);
  if (!check.ok) return { ok: false, error: check.error === "future" ? "That date is in the future." : "Enter your date of birth." };
  return { ok: true, birthdate: record.birthdate as string, eligible: check.eligible, app: record.client === "app" };
}

/** The nonce this sign-up request carries: the app sends it in the body, the website in its HttpOnly cookie (read by
 *  the route through next/headers cookies(), like the session cookies). */
export function agePassFrom(body: unknown, cookieValue: string | undefined): string | null {
  const fromBody = (body && typeof body === "object" ? (body as Record<string, unknown>).agePass : undefined);
  if (typeof fromBody === "string") return NONCE.test(fromBody) ? fromBody : null;
  return cookieValue && NONCE.test(cookieValue) ? cookieValue : null;
}

export const agePassCookieOptions = (secure: boolean) =>
  ({ httpOnly: true, sameSite: "strict" as const, secure, path: "/", maxAge: AGE_PASS_MINUTES * 60 });
