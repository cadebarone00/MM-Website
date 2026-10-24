import type { SupabaseClient } from "@supabase/supabase-js";

/** Syntax only; identity is established by Supabase Auth, never decoded JWT claims. */
export function bearerToken(authorization: string): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

/** Request-local clients only. The native client alone owns the real refresh token. */
export async function requestIdentityClient(
  authorization: string | null,
  cookieClient: () => Promise<SupabaseClient>,
  plainClient: (token?: string) => SupabaseClient,
): Promise<SupabaseClient> {
  if (authorization === null) return cookieClient();
  const denied = () => plainClient();
  const token = bearerToken(authorization);
  if (!token) return denied();
  try {
    const client = plainClient(token);
    // setSession verifies a non-expired access token with Auth's /user endpoint.
    // An expired token cannot refresh using this deliberately invalid placeholder.
    const verified = await client.auth.setSession({ access_token: token, refresh_token: "bearer-only" });
    const user = verified.data.user;
    if (verified.error || !user) return denied();
    // Inspect claims only AFTER Auth verification. The existing RPC allows a
    // missing session_id; this boundary requires a session-bound user token.
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (claims.sub !== user.id || claims.role !== "authenticated"
      || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000
      || typeof claims.session_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id)) return denied();
    const revoked = await client.rpc("session_is_revoked");
    // Missing schema, unavailable service, null or unexpected replies all fail closed.
    if (revoked.error || revoked.data !== false) return denied();
    const cookie = await cookieClient();
    const existing = await cookie.auth.getUser();
    if (existing.data.user && existing.data.user.id !== user.id) return denied();
    // A missing/stale cookie is allowed; transport/server failures are not.
    if (existing.error && existing.error.name !== "AuthSessionMissingError" && existing.error.status !== 400 && existing.error.status !== 401 && existing.error.status !== 403) return denied();
    return client;
  } catch {
    return denied();
  }
}
