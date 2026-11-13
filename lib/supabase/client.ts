// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";
import { isAppBuild } from "@/lib/app/appEnv";
import { appSupabase } from "@/lib/app/appAuth";

/**
 * The first browser-side Supabase client this codebase has needed — every
 * prior screen ran entirely through server-side cookie sessions
 * (lib/supabase/server.ts) plus fetch calls to our own Route Handlers.
 * Used only for read-only Realtime subscriptions (Postgres Changes) on
 * this scoring screen; every actual write still goes through a Route
 * Handler. Safe to expose NEXT_PUBLIC_SUPABASE_ANON_KEY to the browser —
 * every table this subscribes to (live_hole_scores,
 * live_match_box_submissions) has a public-read RLS policy and no write
 * policy at all, so this key cannot write anything.
 */
export function createSupabaseBrowserClient() {
  // The iPhone / Android app has no website cookies: Realtime runs on the app's own login (lib/app/appAuth.ts).
  if (isAppBuild) return appSupabase();
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
