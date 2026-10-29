import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { initializeAfterSignIn } from "@/lib/profile/profileInitialization";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { attemptKey, TOO_MANY_TRIES, verifyCodeFailure, verifyCodeInputFromBody } from "@/lib/auth/verifyCode";

/**
 * POST /api/auth/verify-code — { email, code, type: "signup" | "recovery", client?: "app" } (Pending accounts Phase 6).
 * Checks the 6-digit code from the sign-up or password-reset email and signs that account in:
 * - website: the session goes into this browser's cookies. A "recovery" session is what POST /api/auth/reset-password
 *   accepts (signed in by an emailed code within the hour), so the code is always checked BEFORE a password can change.
 * - app (client: "app"): no cookies; the session comes back in the reply for the phone to keep.
 * Limits: 5 tries per address per kind in 15 minutes (supabase/auth_code_attempts.sql) on top of Supabase's per-IP limit.
 * A wrong code, an expired code and an address with no account all get the same answer. Off unless MAROON_V2_ONBOARDING=on.
 */
const reply = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!onboardingEnabled()) return reply(404, { ok: false, code: "not_found", error: "Not found." });
  const parsed = verifyCodeInputFromBody(await request.json().catch(() => null));
  if (!parsed.ok) return reply(400, { ok: false, code: "invalid_input", error: parsed.error });
  const { email, code, kind, app } = parsed.input;

  const service = createSupabaseServiceRoleClient();
  const key = attemptKey(email);
  const claim = await service.rpc("claim_auth_code_attempt", { p_key: key, p_kind: kind });
  if (claim.error) {
    console.error("verify-code attempt check failed:", claim.error.code ?? "");
    return reply(503, { ok: false, code: "unavailable", error: "We couldn't check that code. Try again." });
  }
  if (claim.data !== true) return reply(429, { ok: false, code: "too_many_attempts", error: TOO_MANY_TRIES });

  const supabase = app
    ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    : await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: kind });
  if (error || !data.session || !data.user) {
    const failure = verifyCodeFailure(error ?? { status: 400 });
    if (failure.status >= 500) console.error("verify-code failed:", error?.code ?? "", error?.status ?? "");
    return reply(failure.status, failure.body);
  }

  await service.rpc("clear_auth_code_attempts", { p_key: key, p_kind: kind });
  // A verified sign-in makes sure the profile exists (idempotent; the same step as log-in and the email link).
  await initializeAfterSignIn(data.user.id);
  const next = kind === "signup" ? "confirmed" : "reset_password";
  if (!app) return reply(200, { ok: true, next });
  const { access_token, refresh_token, expires_at } = data.session;
  return reply(200, { ok: true, next, session: { access_token, refresh_token, expires_at } });
}
