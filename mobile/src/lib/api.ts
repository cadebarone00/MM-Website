import { supabase } from "./supabase.ts";
import { NETWORK_ERROR, parseApiReply, type ApiResult } from "./apiReply.ts";
import { absoluteUrl, parseJsonReply, type JsonResult } from "./jsonReply.ts";

// The www address: themaroon.site redirects there, and a redirect drops the Authorization header.
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "https://www.themaroon.site").replace(/\/$/, "");
const TIMEOUT_MS = 15000;
const SIGNED_OUT = "You're signed out. Sign in again.";

/** A link people can open (invites, join links): the live website + a path. */
export const shareUrl = (path: string) => absoluteUrl(apiUrl, path);

/** An image or file the server gives as a website path ("/schedule/x.webp"), as a full link. */
export const assetUrl = (path: string) => absoluteUrl(apiUrl, path);

/** The signed-in person's login token, refreshed by Supabase when needed. */
async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function send(path: string, init: { method?: "GET" | "POST"; body?: unknown }, auth: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${auth}`, Accept: "application/json", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    return { status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** GET one of the server's /api/app/* routes ({ ok, data }) as the signed-in person. Never throws. */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const auth = await token();
  if (!auth) return { ok: false, error: SIGNED_OUT };
  try {
    const { status, text } = await send(path, {}, auth);
    return parseApiReply<T>(status, text);
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

/**
 * Call one of the website's own routes ({ ok: true, ...fields } / { ok: false, code, message }), e.g. /api/rounds/*,
 * /api/courses/*, as the signed-in person. `messages` turns a reply code into what the screen should say. Never throws;
 * an aborted call (a newer search replaced it) comes back as `{ ok: false, code: "aborted" }`.
 */
export async function apiJson<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal; messages?: Partial<Record<string, string>> } = {}): Promise<JsonResult<T>> {
  const auth = await token();
  if (!auth) return { ok: false, error: SIGNED_OUT, code: "signed_out" };
  try {
    const { status, text } = await send(path, init, auth, init.signal);
    return parseJsonReply<T>(status, text, init.messages);
  } catch {
    if (init.signal?.aborted) return { ok: false, error: "", code: "aborted" };
    return { ok: false, error: NETWORK_ERROR, code: null };
  }
}
