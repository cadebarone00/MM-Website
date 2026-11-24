import { supabase } from "./supabase.ts";
import { NETWORK_ERROR, parseApiReply, type ApiResult } from "./apiReply.ts";

// The www address: themaroon.site redirects there, and a redirect drops the Authorization header.
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "https://www.themaroon.site").replace(/\/$/, "");
const TIMEOUT_MS = 15000;

/** A link people can open (invites, join links): the live website + a path. */
export function shareUrl(path: string): string {
  return `${apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/** GET one of the server's /api/app/* routes as the signed-in person (Authorization: Bearer). Never throws. */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "You're signed out. Sign in again." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    return parseApiReply<T>(response.status, await response.text());
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  } finally {
    clearTimeout(timer);
  }
}
