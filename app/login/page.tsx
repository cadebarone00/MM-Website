import { LoginWelcome } from "@/components/auth/LoginWelcome";

export const metadata = { title: "Log In | The Maroon" };

import { authReturnPath } from "@/lib/auth/returnTo";
import { oauthErrorMessage } from "@/lib/auth/oauth";
import { enabledOAuthProviders } from "@/lib/auth/oauthServer";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  // error = a Google / Apple sign-in that didn't finish (app/auth/callback); only our own fixed messages are shown.
  return <LoginWelcome returnTo={authReturnPath(next)} providers={await enabledOAuthProviders()} error={oauthErrorMessage(error)} />;
}
