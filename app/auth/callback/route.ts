import { authCallbackPath } from "@/lib/auth/websiteFlow";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { initializeAfterSignIn } from "@/lib/profile/profileInitialization";

// Password-reset codes are exchanged here. Invite tokens arrive in a URL
// fragment (invisible to the server); the browser carries that fragment through
// the redirect and the password form exchanges it for session cookies.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Both invite and recovery send users to the password form. Do not allow
  // arbitrary redirect destinations to receive inherited session fragments.
  const destination = new URL(authCallbackPath(searchParams), origin);

  if (searchParams.has("error") || searchParams.has("error_code")) {
    destination.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(destination);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) destination.searchParams.set("error", "invalid_link");
    // Accounts V2: a verified session makes sure the profile exists (idempotent, never blocks the redirect).
    else await initializeAfterSignIn(data.user?.id);
  }

  return NextResponse.redirect(destination);
}
