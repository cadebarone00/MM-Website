import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Exchanges the PKCE `code` query param (from verification / password-reset
// email links) for a real session cookie, then redirects on to `next`. The
// server client defaults to the PKCE flow, so without this step
// `updateUser({ password })` on /reset-password fails with "Auth session
// missing!" — there is otherwise no route anywhere in the app that does
// this exchange.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/reset-password";

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
