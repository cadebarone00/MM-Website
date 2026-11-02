/**
 * Retiring the old sign-up / log-in pages: with MAROON_V2_ONBOARDING=on the legacy pages (/signup, /login, /login/email,
 * /forgot-password, /reset-password) send people to the V2 screens (/start/*) instead. Pure, so it is unit tested; the
 * pages only ask when the flag is on, so with it off they behave exactly as before. Only an allow-listed return page
 * (authReturnPath) and the fixed Google / Apple error codes are carried over, and nothing here points back at a legacy
 * page, so there is no loop.
 */
import { authReturnPath } from "@/lib/auth/returnTo";
import { oauthErrorMessage } from "@/lib/auth/oauth";
import { START } from "./onboardingRoutes";

export type LegacyAuthRoute = "/signup" | "/login" | "/login/email" | "/forgot-password" | "/reset-password";
type Query = Record<string, string | string[] | undefined>;

function withQuery(path: string, values: Record<string, string | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** Where a legacy auth page sends the visitor with V2 on; null = keep showing the legacy page. */
export function legacyAuthRedirect(route: LegacyAuthRoute, query: Query, { signedIn }: { signedIn: boolean }): string | null {
  const next = authReturnPath(query.next);
  switch (route) {
    case "/signup": return START.birthday; // G4: sign-up starts with the birthday
    case "/login":
    case "/login/email":
      return withQuery(START.logIn, { next, error: oauthErrorMessage(query.error) ? query.error as string : null });
    case "/forgot-password": return START.forgot;
    case "/reset-password":
      if (query.error) return START.forgot;
      // A recovery session from /auth/callback is a cookie, so it carries over. Admin invite links instead put their
      // tokens in the URL #fragment, which only the legacy form can read — so with no session, stay here.
      return signedIn ? withQuery(START.resetPassword, { next }) : null;
  }
}
