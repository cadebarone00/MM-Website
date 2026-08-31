// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

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
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
