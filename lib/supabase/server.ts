import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-bound client for use inside Route Handlers and Server Components.
 * Acts as whichever user's session cookie is present (or as an anonymous
 * request if there isn't one) — every read/write goes through RLS.
 *
 * Server Components can't write cookies, so `setAll` there is a no-op
 * wrapped in try/catch; `middleware.ts` is what actually persists a
 * refreshed token in that case.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — middleware.ts handles refresh instead.
        }
      },
    },
  });
}

/**
 * Service-role client: no cookies, bypasses RLS entirely. Only ever used
 * for player_slots (which has no RLS policies at all) and the one
 * unauthenticated email-by-username lookup login needs. Never exposed to
 * the browser.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  return createServiceClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
