import { websiteVerificationOptions } from "@/lib/auth/websiteFlow";
import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { signupInputFromBody, signupReply } from "@/lib/auth/signup";
import { onboardingEnabled } from "@/lib/account/onboardingFlag";
import { cookies } from "next/headers";
import { AGE_PASS_COOKIE, agePassFrom, agePassHash } from "@/lib/auth/agePass";

/**
 * Sign up = create the LOGIN only (Accounts V2, project_specs.md "Accounts Step 2"). No profile, no old-player claim,
 * no service-role key for the account itself and never a delete: the V1 version deleted the account id Supabase returned
 * when its profile insert failed, which removed real pending accounts (docs/auth-local-reproduction-2026-10-16.md S3 / S9 /
 * S10). The profile is made later, once the email is verified, by lib/profile/profileInitialization.ts. Existing emails
 * get the same answer as new ones.
 *
 * G4 birthday-first (MAROON_V2_ONBOARDING=on): the request must carry the age pass from POST /api/auth/age-check (website
 * cookie / app body `agePass`). It is bound to this email in the database, then sent to Supabase with the sign-up; the
 * Before User Created hook (supabase/signup_gate.sql) refuses the login without it. That hook, not this check, is what
 * stops a direct call to Supabase's own sign-up endpoint. With V2 off, sign-up behaves exactly as before.
 */
const AGE_CHECK_REQUIRED = { ok: false, code: "age_check_required", error: "Start with your birthday." };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupInputFromBody(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  let metadata: { data?: { age_pass: string } } = {};
  const jar = await cookies();
  if (onboardingEnabled()) {
    const nonce = agePassFrom(body, jar.get(AGE_PASS_COOKIE)?.value);
    if (!nonce) return NextResponse.json(AGE_CHECK_REQUIRED, { status: 400 });
    const { data: bound, error } = await createSupabaseServiceRoleClient().rpc("bind_age_pass", { p_nonce_hash: agePassHash(nonce), p_email: parsed.input.email });
    if (error) {
      console.error("bind_age_pass failed:", error.code ?? "");
      return NextResponse.json({ ok: false, error: "Couldn't create your account. Try again." }, { status: 503 });
    }
    if (bound !== true) return NextResponse.json(AGE_CHECK_REQUIRED, { status: 400 });
    metadata = { data: { age_pass: nonce } };
  }

  const supabase = await createSupabaseServerClient();
  const verification = websiteVerificationOptions(request.url, body?.next) as { options?: Record<string, unknown> };
  const { error } = await supabase.auth.signUp({ ...parsed.input, options: { ...(verification.options ?? {}), ...metadata } });
  if (error && signupReply(error).status >= 500) console.error("signUp failed:", error.code ?? "", error.message);
  const reply = signupReply(error);
  if (metadata.data && reply.status === 200) jar.delete(AGE_PASS_COOKIE); // the pass is used (or bound) now
  return NextResponse.json(reply.body, { status: reply.status });
}
