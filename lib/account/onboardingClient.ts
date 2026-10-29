/**
 * Pending accounts Phase 6 — small browser helpers shared by the real sign-up / onboarding screens.
 * The email typed on Sign up / Forgot password is carried to the next screens in this tab's sessionStorage (never in
 * the URL, never the password). Storage can be unavailable (private mode): every access is guarded.
 */
import { useSyncExternalStore } from "react";

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

/** JSON request to our own API. A network failure comes back as status 0 with a plain message, never a throw. */
export async function send(url: string, body?: unknown, method = "POST"): Promise<Sent> {
  try {
    const response = await fetch(url, method === "GET" ? { method, cache: "no-store" }
      : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { status: response.status, json };
  } catch {
    return { status: 0, json: { ok: false, error: "No connection. Check your internet and try again." } };
  }
}

export const errorOf = (sent: Sent, fallback = "Something went wrong. Try again.") =>
  typeof sent.json.error === "string" && sent.json.error ? sent.json.error : fallback;
