/**
 * Accounts V2 signup rules (pure, unit-tested). Signing up creates the LOGIN only: no profile, no player claim, and never
 * a delete.
 * Owner decision 2026-11-20 (project_specs.md "Sign up: email already has an account + password AFTER the code"):
 * - Sign up takes the email only. The server gives the login a long random password nobody sees; the person chooses
 *   their real one after the code (POST /api/auth/create-password).
 * - An email that already has a VERIFIED account is told so on Sign up ("already an account... Log in"). This replaces
 *   the old same-answer-for-everyone rule, on purpose. An email that was started but never verified just gets a new code.
 */
import { passwordErrorMessage } from "./passwordErrors";

export type SignupInput = { email: string };
export type SignupParse = { ok: true; input: SignupInput } | { ok: false; error: string };

/** Email only. Password, name, username or player-code fields from older clients are ignored on purpose. */
export function signupInputFromBody(body: unknown): SignupParse {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof record.email !== "string") return { ok: false, error: "Enter your email." };
  const email = record.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  return { ok: true, input: { email } };
}

/** The flag (on the login's server-only app_metadata) saying the person hasn't chosen their password yet. */
export const PASSWORD_PENDING = "password_pending";
export const passwordPending = (user: { app_metadata?: Record<string, unknown> | null } | null | undefined) =>
  user?.app_metadata?.[PASSWORD_PENDING] === true;

/** Supabase's signUp answer for an email that already has a verified login: a stand-in user with no identities. */
export const isExistingAccount = (user: { identities?: unknown[] | null } | null | undefined) =>
  !!user && Array.isArray(user.identities) && user.identities.length === 0;

export const ACCOUNT_EXISTS = "There's already an account with this email.";

type AuthError = { code?: string; status?: number; message: string } | null;
export type SignupReply = { status: number; body: { ok: true } | { ok: false; error: string; code?: "account_exists" } };

const CHECK_YOUR_EMAIL: SignupReply = { status: 200, body: { ok: true } };
export const ACCOUNT_EXISTS_REPLY: SignupReply = { status: 409, body: { ok: false, code: "account_exists", error: ACCOUNT_EXISTS } };

/** The fixed refusals of the Before User Created hook (supabase/signup_gate.sql); only these exact texts are shown. */
export const GATE_REFUSALS = ["Registration is closed.", "New accounts can only be created with email.",
  "Registration is invite-only right now.", "Start with your birthday."] as const;

/** What the endpoint answers for Supabase's signUp result. */
export function signupReply(error: AuthError): SignupReply {
  if (!error) return CHECK_YOUR_EMAIL;
  const code = error.code ?? "";
  const message = error.message ?? "";
  // Supabase reports an existing login this way only when email confirmation is off; with it on (ours), the stand-in
  // user of isExistingAccount is how it shows. Both mean "Log in instead".
  if (code === "user_already_exists" || code === "email_exists" || /already registered/i.test(message)) return ACCOUNT_EXISTS_REPLY;
  // A code was emailed under a minute ago: go to the code screen, that code still works.
  if (code === "over_email_send_rate_limit" || /only request this after/i.test(message)) return CHECK_YOUR_EMAIL;
  // Only the old /signup form (V2 off) sends a typed password; the V2 throwaway one always passes.
  if (code === "weak_password" || /longer than 72/i.test(message)) return { status: 400, body: { ok: false, error: passwordErrorMessage(error) } };
  if (code === "email_address_invalid" || code === "validation_failed") return { status: 400, body: { ok: false, error: "Enter a valid email address." } };
  if (code === "signup_disabled") return { status: 403, body: { ok: false, error: "New accounts aren't open yet." } };
  const refusal = GATE_REFUSALS.find((text) => message.includes(text));
  if (refusal) return { status: 403, body: { ok: false, error: refusal } };
  if (error.status === 429) return { status: 429, body: { ok: false, error: "Too many tries. Wait a minute and try again." } };
  return { status: 503, body: { ok: false, error: "Couldn't create your account. Try again." } };
}
