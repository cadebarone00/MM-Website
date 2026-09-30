import { cache } from "react";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseMyAccess, parseRequestsForReview, type AccessRequestForReview, type MyAccess } from "./accessRequests.ts";

/** The session's user, or null. The id always comes from the session, never the request. */
export const currentUser = cache(async () => {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
});

export type MyAccessResult = { signedIn: false } | { signedIn: true; ok: true; access: MyAccess; name: string; email: string } | { signedIn: true; ok: false };

/** The signed-in user's own creator access and latest request. */
export const loadMyAccess = cache(async (): Promise<MyAccessResult> => {
  const user = await currentUser();
  if (!user) return { signedIn: false };
  const service = createSupabaseServiceRoleClient();
  const [{ data, error }, { data: profile }] = await Promise.all([
    service.rpc("get_my_tournament_access", { p_profile: user.id }),
    service.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle(),
  ]);
  if (error) {
    if (error.code !== "PGRST202") console.error("get_my_tournament_access failed:", error.message);
    return { signedIn: true, ok: false };
  }
  return { signedIn: true, ok: true, access: parseMyAccess(data), name: profile?.display_name ?? "", email: profile?.email ?? user.email ?? "" };
});

export type ReviewListResult = { signedIn: false } | { signedIn: true; admin: false } | { signedIn: true; admin: true; requests: AccessRequestForReview[] };

/** Platform admins only (checked again inside the database function). */
export async function loadRequestsForReview(): Promise<ReviewListResult> {
  const user = await currentUser();
  if (!user) return { signedIn: false };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_tournament_access_requests", { p_admin: user.id });
  if (error) {
    if (error.code !== "42501") console.error("list_tournament_access_requests failed:", error.message);
    return { signedIn: true, admin: false };
  }
  return { signedIn: true, admin: true, requests: parseRequestsForReview(data) };
}
