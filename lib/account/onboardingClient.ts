/**
 * Pending accounts Phase 6 — small browser helpers shared by the real sign-up / onboarding screens.
 * The email typed on Sign up / Forgot password is carried to the next screens in this tab's sessionStorage (never in
 * the URL, never the password). Storage can be unavailable (private mode): every access is guarded.
 */
import { useSyncExternalStore } from "react";
import { isAppBuild } from "@/lib/app/appEnv";
import { appSupabase } from "@/lib/app/appAuth";

const EMAIL_KEY = "maroon.onboarding.email";

export function rememberEmail(email: string) {
  try { sessionStorage.setItem(EMAIL_KEY, email.trim()); } catch { /* storage unavailable: the screen asks again */ }
}
export function rememberedEmail(): string {
  try { return sessionStorage.getItem(EMAIL_KEY) ?? ""; } catch { return ""; }
}

const noSubscription = () => () => undefined;
/** The remembered email: null while rendering on the server, "" when there is none. */
export const useRememberedEmail = (): string | null => useSyncExternalStore(noSubscription, rememberedEmail, () => null);

export type Sent = { status: number; json: Record<string, unknown> };

/** The routes that sign someone in. In the iPhone / Android app they're asked for the session back (client: "app"),
 *  because the app keeps its own login instead of website cookies. */
const SIGN_IN_ROUTES = ["/api/auth/login", "/api/auth/verify-code"];
/** Set in this tab when Finish succeeds in the app, so Profile Created shows once (the website uses a cookie marker). */
export const APP_FINISHED_KEY = "maroon.onboarding.finished";

/** JSON request to our own API. A network failure comes back as status 0 with a plain message, never a throw. */
export async function send(url: string, body?: unknown, method = "POST"): Promise<Sent> {
  try {
    const signIn = isAppBuild && SIGN_IN_ROUTES.includes(url);
    const payload = signIn ? { ...(body as object ?? {}), client: "app" } : body;
    const response = await fetch(url, method === "GET" ? { method, cache: "no-store" }
      : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload ?? {}) });
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (isAppBuild) await keepAppLogin(url, json);
    return { status: response.status, json };
  } catch {
    return { status: 0, json: { ok: false, error: "No connection. Check your internet and try again." } };
  }
}

export const errorOf = (sent: Sent, fallback = "Something went wrong. Try again.") =>
  typeof sent.json.error === "string" && sent.json.error ? sent.json.error : fallback;

/**
 * App only: a sign-in reply's session becomes the phone's login (lib/app/appAuth.ts, the Keychain), and is never handed
 * to the screen; a reply saying the server signed the account out (e.g. the Birthday step) signs the phone out too.
 */
async function keepAppLogin(url: string, json: Record<string, unknown>) {
  const session = json.session as { access_token?: unknown; refresh_token?: unknown } | undefined;
  if (SIGN_IN_ROUTES.includes(url) && session && typeof session.access_token === "string" && typeof session.refresh_token === "string") {
    await appSupabase().auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    delete json.session;
  }
  if (json.signedOut === true) await appSupabase().auth.signOut();
  if (url === "/api/account/finish" && json.ok === true) { try { sessionStorage.setItem(APP_FINISHED_KEY, "1"); } catch { /* shows Play instead */ } }
}
