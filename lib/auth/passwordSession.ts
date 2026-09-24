export const PASSWORD_LINK_ERROR = "This password link has expired or could not be verified. Request a new link below and open it in the same browser where you requested it.";

export type PasswordAccount = { username: string | null; email: string | null };

// Fragments are only visible in the browser. Exchange invite tokens for the
// server cookies used by the password API, and remove them from browser history.
export async function preparePasswordSession(
  href: string,
  clearFragment: () => void,
  request: typeof fetch = fetch,
): Promise<PasswordAccount> {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const access_token = fragment.get("access_token");
  const refresh_token = fragment.get("refresh_token");
  if (url.hash) clearFragment();

  if (url.searchParams.has("error") || fragment.has("error") || fragment.has("error_code")) {
    throw new Error(PASSWORD_LINK_ERROR);
  }
  if ((access_token || refresh_token) && !(access_token && refresh_token)) {
    throw new Error(PASSWORD_LINK_ERROR);
  }

  const response = await request("/api/auth/password-session", {
    method: access_token && refresh_token ? "POST" : "GET",
    cache: "no-store",
    ...(access_token && refresh_token ? {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token }),
    } : {}),
  });
  if (!response.ok) throw new Error(PASSWORD_LINK_ERROR);
  const { account } = await response.json();
  return { username: account?.username ?? null, email: account?.email ?? null };
}
