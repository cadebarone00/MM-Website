import { websiteVerificationOptions } from "@/lib/auth/websiteFlow";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signupInputFromBody, signupReply } from "@/lib/auth/signup";

/**
 * Sign up = create the LOGIN only (Accounts V2, project_specs.md "Accounts Step 2"). No profile, no old-player claim,
 * no service-role key and never a delete: the V1 version deleted the account id Supabase returned when its profile
 * insert failed, which removed real pending accounts (docs/auth-local-reproduction-2026-10-16.md S3 / S9). The profile is
 * made later, once the email is verified, by lib/profile/profileInitialization.ts. Existing emails get the same answer
 * as new ones.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupInputFromBody(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ ...parsed.input, ...websiteVerificationOptions(request.url, body?.next) });
  if (error && signupReply(error).status >= 500) console.error("signUp failed:", error.code ?? "", error.message);
  const reply = signupReply(error);
  return NextResponse.json(reply.body, { status: reply.status });
}
