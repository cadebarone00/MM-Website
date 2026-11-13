"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

/**
 * The app's own login (project_specs.md "The Maroon as a real iPhone app"): a Supabase session kept on the phone —
 * in the iPhone Keychain / Android Keystore on a real phone, in the browser's storage only for `npm run dev:app` —
 * and refreshed by Supabase. The website's cookie login is never used in the app.
 */
const storage = {
  getItem: (key: string) => Capacitor.isNativePlatform() ? SecureStorage.getItem(key) : Promise.resolve(localStorage.getItem(key)),
  setItem: (key: string, value: string) => Capacitor.isNativePlatform() ? SecureStorage.setItem(key, value) : Promise.resolve(localStorage.setItem(key, value)),
  removeItem: (key: string) => Capacitor.isNativePlatform() ? SecureStorage.removeItem(key) : Promise.resolve(localStorage.removeItem(key)),
};

let client: SupabaseClient | null = null;
export function appSupabase(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { storage, storageKey: "maroon-app-session", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/** The current access token (refreshed when needed), or null when signed out. */
export async function appAccessToken(): Promise<string | null> {
  const { data } = await appSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
