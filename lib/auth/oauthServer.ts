import "server-only";
import { OAUTH_PROVIDERS, type OAuthProvider } from "./oauth";

/**
 * Which of Google / Apple are turned on in this Supabase project (its public /auth/v1/settings). Buttons only show for
 * these, so a project where the owner hasn't enabled a provider looks exactly as before. Any failure = none.
 */
export async function enabledOAuthProviders(): Promise<OAuthProvider[]> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return [];
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY }, cache: "no-store", signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const external = ((await res.json()) as { external?: Record<string, unknown> }).external ?? {};
    return OAUTH_PROVIDERS.filter((provider) => external[provider] === true);
  } catch {
    return [];
  }
}
