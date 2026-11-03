import { websiteVerificationOptions } from "@/lib/auth/websiteFlow";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signupInputFromBody, signupReply } from "@/lib/auth/signup";

/**
 * Sign up = create the LOGIN only (Accounts V2, project_specs.md "Accounts Step 2"). No profile, no old-player claim,
 * no service-role key for the account itself and never a delete: the V1 version deleted the account id Supabase returned
 * when its profile insert failed, which removed real pending accounts (docs/auth-local-reproduction-2026-10-16.md S3 / S9 /
 * S10). The profile is made later, once the email is verified, by lib/profile/profileInitialization.ts. Existing emails
 * get the same answer as new ones.
 *
 * The birthday is asked AFTER the account is made (owner decision 2026-11-02): the onboarding Birthday step after Name
 * (13+ only; under 13 the account is closed and cleaned up). Who may sign up at all is decided by Supabase's Before User
 * Created hook (supabase/signup_gate_birthday_after.sql: registration mode, tester allowlist, email only).
 */

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupInputFromBody(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const verification = websiteVerificationOptions(request.url, body?.next) as { options?: Record<string, unknown> };
  const { error } = await supabase.auth.signUp({ ...parsed.input, options: verification.options ?? {} });
  if (error && signupReply(error).status >= 500) console.error("signUp failed:", error.code ?? "", error.status ?? "", error.message);
  const reply = signupReply(error);
  return NextResponse.json(reply.body, { status: reply.status });
}
