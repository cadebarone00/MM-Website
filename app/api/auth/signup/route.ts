import { randomBytes } from "node:crypto";
import { websiteVerificationOptions } from "@/lib/auth/websiteFlow";
import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { checkNewPassword } from "@/lib/auth/passwordPolicy";
import { ACCOUNT_EXISTS_REPLY, PASSWORD_PENDING, isExistingAccount, signupInputFromBody, signupReply } from "@/lib/auth/signup";

/**
 * POST /api/auth/signup — { email } (Accounts V2; owner decision 2026-11-20, project_specs.md "Sign up: email already
 * has an account + password AFTER the code").
 * Creates the LOGIN only. No profile, no old-player claim and never a delete (the V1 version deleted real pending
 * accounts: docs/auth-local-reproduction-2026-10-16.md S3 / S9 / S10). The profile is made once the email is verified
 * (lib/profile/profileInitialization.ts).
 * - Supabase needs a password to make an email login, so it gets a long random one nobody ever sees. The person picks
 *   their own after the code (POST /api/auth/create-password); until then the login carries app_metadata
 *   password_pending = true, which only the server can write, and onboarding sends them to Create a password first.
 * - An email that already has a verified login → 409 account_exists ("Log in instead"), and no email is sent.
 * - Started but never verified → a fresh code, and the flag is set again (harmless if it already was).
 * - MAROON_V2_ONBOARDING off (the old /signup form, local only): the password typed on that form is used and no flag is
 *   set, exactly as before.
 * Who may sign up at all is decided by Supabase's Before User Created hook (supabase/signup_gate_birthday_after.sql).
 */

/** Random, and has every kind of character in case Supabase's password rules ask for them. Never stored or shown. */
const throwawayPassword = () => `${randomBytes(32).toString("base64url")}aA1!`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupInputFromBody(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const v2 = onboardingEnabled();
  if (!v2) {
    const typed = checkNewPassword(body?.password);
    if (!typed.ok) return NextResponse.json({ ok: false, error: typed.error }, { status: 400 });
  }
  const password = v2 ? throwawayPassword() : (body.password as string);

  const supabase = await createSupabaseServerClient();
  const verification = websiteVerificationOptions(request.url, body?.next) as { options?: Record<string, unknown> };
  const { data, error } = await supabase.auth.signUp({ email: parsed.input.email, password, options: verification.options ?? {} });
  if (error) {
    const reply = signupReply(error);
    if (reply.status >= 500) console.error("signUp failed:", error.code ?? "", error.status ?? "", error.message);
    return NextResponse.json(reply.body, { status: reply.status });
  }
  if (isExistingAccount(data.user)) return NextResponse.json(ACCOUNT_EXISTS_REPLY.body, { status: ACCOUNT_EXISTS_REPLY.status });

  if (v2 && data.user) {
    // Without the flag the person would never be asked for a password, so a failure here fails the request; trying
    // again re-runs signUp for the same unverified login and sets it then.
    const flagged = await createSupabaseServiceRoleClient().auth.admin.updateUserById(data.user.id, { app_metadata: { [PASSWORD_PENDING]: true } });
    if (flagged.error) {
      console.error("signUp password flag failed:", flagged.error.code ?? "", flagged.error.status ?? "");
      return NextResponse.json({ ok: false, error: "Couldn't create your account. Try again." }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: true });
}
