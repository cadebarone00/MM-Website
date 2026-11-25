import { createClient } from "@supabase/supabase-js";
import { shareUrl } from "./api.ts";
import { NETWORK_ERROR } from "./apiReply.ts";
import { tokensFrom } from "./settingsUi.ts";
import { supabase } from "./supabase.ts";

/**
 * Sign up / Log in / Forgot password calls (project_specs.md "Expo app Step 4"): the website's own /api/auth/* routes,
 * made before anyone is signed in. The routes that sign someone in are asked for the session back (client: "app") and
 * it becomes the phone's login. Never throws: no connection = status 0 with the usual message.
 */
export type Sent = { status: number; json: Record<string, unknown> };
const TIMEOUT_MS = 15000;

export async function authSend(path: string, body: unknown, token?: string): Promise<Sent> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(shareUrl(path), {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { status: response.status, json };
  } catch {
    return { status: 0, json: { ok: false, error: NETWORK_ERROR } };
  } finally {
    clearTimeout(timer);
  }
}

export const errorOf = (sent: Sent, fallback = "Something went wrong. Try again.") =>
  typeof sent.json.error === "string" && sent.json.error ? sent.json.error : fallback;

/** A sign-in reply's session becomes this phone's login (the app then moves on by itself). */
export async function keepLogin(sent: Sent): Promise<boolean> {
  const tokens = tokensFrom(sent.json);
  if (!tokens) return false;
  const { error } = await supabase.auth.setSession(tokens);
  return !error;
}

/**
 * Forgot password, last step: the reset code's login is used ONLY here (a throwaway client, never the phone's login),
 * so nobody is signed in by a reset. Someone who verified but never picked a password gets it through Create a password
 * (which also clears that flag); everyone else through Supabase. Then every device is signed out, like the website.
 * Claude's call: the website's /api/auth/reset-password only reads website cookies, so the phone does the same steps.
 */
export async function setNewPassword(session: { access_token: string; refresh_token: string }, password: string): Promise<string | null> {
  const created = await authSend("/api/auth/create-password", { password }, session.access_token);
  if (created.json.ok !== true && created.json.code !== "already_set") return errorOf(created, "We couldn't save your password. Try again.");
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!, anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const reset = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const set = await reset.auth.setSession(session);
    if (set.error) return "That code has expired. Ask for a new one.";
    if (created.json.ok !== true) {
      const { error } = await reset.auth.updateUser({ password });
      if (error) return error.message || "We couldn't save your password. Try again.";
    }
    await reset.auth.signOut({ scope: "global" }).catch(() => undefined);
    return null;
  } catch {
    return NETWORK_ERROR;
  }
}

/** The reset code's login, held in memory only between "Enter Code To Reset" and "Set a new password". */
let recovery: { access_token: string; refresh_token: string } | null = null;
export const holdRecovery = (tokens: typeof recovery) => { recovery = tokens; };
export const heldRecovery = () => recovery;
