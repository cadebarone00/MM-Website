import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface HostSession {
  userId: string;
}

/**
 * Server-side guard for host-only (Tiger) actions. Returns null if there's no
 * session or the account isn't flagged is_host — callers should treat null as
 * "respond 401", never trust a client-supplied "I'm the host" claim.
 */
export async function requireHost(): Promise<HostSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) return null;

  return { userId: user.id };
}
