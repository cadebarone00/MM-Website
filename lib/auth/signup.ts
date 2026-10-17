/**
 * Accounts V2 signup rules (pure, unit-tested). Signing up creates the LOGIN only: no profile, no player claim, and never
 * a delete. Every outcome that involves an existing account answers exactly like a brand-new signup ("check your email"),
 * so the endpoint can't be used to find out which emails have accounts (docs/auth-local-reproduction-2026-10-16.md S4).
 */
export const MIN_PASSWORD_LENGTH = 6;

export type SignupInput = { email: string; password: string };
export type SignupParse = { ok: true; input: SignupInput } | { ok: false; error: string };

/** Email + password only. Name, username or player-code fields from older clients are ignored on purpose. */
export function signupInputFromBody(body: unknown): SignupParse {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof record.email !== "string" || typeof record.password !== "string") return { ok: false, error: "Email and password are required." };
  const email = record.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (record.password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  return { ok: true, input: { email, password: record.password } };
}

type AuthError = { code?: string; status?: number; message: string } | null;
export type SignupReply = { status: number; body: { ok: true } | { ok: false; error: string } };

const CHECK_YOUR_EMAIL: SignupReply = { status: 200, body: { ok: true } };

/** What the endpoint answers for Supabase's signUp result. */
export function signupReply(error: AuthError): SignupReply {
  if (!error) return CHECK_YOUR_EMAIL;
  const code = error.code ?? "";
  const message = error.message ?? "";
  // An account already exists (verified or not), or Supabase is throttling repeat emails to this address: same answer
  // as a new signup. The real owner already has (or will get) the email; nobody else learns anything.
  if (code === "user_already_exists" || code === "email_exists" || /already registered/i.test(message)) return CHECK_YOUR_EMAIL;
  if (code === "over_email_send_rate_limit" || /only request this after/i.test(message)) return CHECK_YOUR_EMAIL;
  if (code === "weak_password") return { status: 400, body: { ok: false, error: message || "Choose a stronger password." } };
  if (code === "email_address_invalid" || code === "validation_failed") return { status: 400, body: { ok: false, error: "Enter a valid email address." } };
  if (code === "signup_disabled") return { status: 403, body: { ok: false, error: "New accounts aren't open yet." } };
  if (error.status === 429) return { status: 429, body: { ok: false, error: "Too many tries. Wait a minute and try again." } };
  return { status: 503, body: { ok: false, error: "Couldn't create your account. Try again." } };
}
