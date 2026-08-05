import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing email." }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const origin = new URL(request.url).origin;
  // Errors here aren't surfaced — same message either way, so a request
  // can't be used to check whether an email has an account.
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  return NextResponse.json({ ok: true });
}
