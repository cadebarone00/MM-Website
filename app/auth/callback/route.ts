import { authCallbackPath } from "@/lib/auth/websiteFlow";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { initializeAfterSignIn } from "@/lib/profile/profileInitialization";
import { authReturnPath } from "@/lib/auth/returnTo";
import { loginErrorUrl, OAUTH_FLOW, oauthDestination, oauthErrorFromParams } from "@/lib/auth/oauth";

// Password-reset codes are exchanged here. Invite tokens arrive in a URL
// fragment (invisible to the server); the browser carries that fragment through
// the redirect and the password form exchanges it for session cookies.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  if (searchParams.get("flow") === OAUTH_FLOW) return finishOAuth(searchParams, origin);
  const code = searchParams.get("code");
  // Website verification uses a fixed completion page; invite/recovery retain the password form. Do not allow
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

// Sign in with Google / Apple (POST /api/auth/oauth) comes back here. Cancel / failure goes back to the login screen
// with no session. Success makes sure the profile exists (the same idempotent step as password login, so an account
// never gets a second profile), then opens the same page password login does.
async function finishOAuth(searchParams: URLSearchParams, origin: string) {
  const returnTo = authReturnPath(searchParams.get("returnTo"));
  const providerError = oauthErrorFromParams(searchParams);
  const code = searchParams.get("code");
  if (providerError || !code) return NextResponse.redirect(loginErrorUrl(origin, providerError ?? "failed", returnTo));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(loginErrorUrl(origin, "failed", returnTo));
  await initializeAfterSignIn(data.user.id);
  return NextResponse.redirect(new URL(oauthDestination(returnTo), origin));
}
