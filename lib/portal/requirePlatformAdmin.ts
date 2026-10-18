import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { platformAdminCheck, type PlatformAdminCheck } from "./platformAdmin.ts";

/**
 * Server-side guard for platform-wide admin actions (profiles.platform_role = 'admin'), e.g. the Highlights Admin.
 * The user always comes from the session cookie, never from the request. Callers treat "signed-out" as 401 and
 * "forbidden" as 403. The database functions re-check admin status on their own (defense in depth).
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminCheck> {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return platformAdminCheck(null, null);
  const { data } = await createSupabaseServiceRoleClient().from("profiles").select("platform_role").eq("id", user.id).maybeSingle();
  return platformAdminCheck(user.id, (data?.platform_role as string | null | undefined) ?? null);
}
