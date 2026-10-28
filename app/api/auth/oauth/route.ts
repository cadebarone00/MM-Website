import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authReturnPath } from "@/lib/auth/returnTo";
import { isOAuthProvider, loginErrorUrl, oauthCallbackUrl, type OAuthError } from "@/lib/auth/oauth";
import { enabledOAuthProviders } from "@/lib/auth/oauthServer";

/**
 * POST (form: provider = google | apple, next) = start Sign in with Google / Apple. Supabase makes the PKCE secret
 * (kept in this browser's cookie), and we send the person to Google / Apple. They come back to /auth/callback?flow=oauth.
 * Client secrets and Apple keys live only in the Supabase dashboard; nothing secret is in this request or the page.
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  // Only our own pages may start a sign-in (another site can't push someone into one).
  if (request.headers.get("origin") !== origin) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const provider = form?.get("provider");
  const next = authReturnPath(form?.get("next"));
  const back = (error: OAuthError) => NextResponse.redirect(loginErrorUrl(origin, error, next), 303);

  if (!isOAuthProvider(provider)) return back("failed");
  if (!(await enabledOAuthProviders()).includes(provider)) return back("unavailable");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthCallbackUrl(origin, next),
      skipBrowserRedirect: true,
      // Google: always let the person pick which Google account (shared computers).
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    },
  });
  if (error || !data.url) return back("failed");
  return NextResponse.redirect(data.url, 303);
}
