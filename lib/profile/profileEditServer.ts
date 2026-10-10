import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ProfileId } from "./profileIdentity";
import type { ProfileEditInput, ProfileSetupInput } from "./profileEdit";

/**
 * Profile V1 writes (supabase/profile_v1.sql), server only. The ids always come from the signed-in session, never the
 * request. "invalid" carries the database's own message (username taken / reserved, lengths), safe to show.
 */
export type ProfileWrite = { status: "ok"; username: string; created?: boolean } | { status: "invalid"; error: string } | { status: "unavailable" } | { status: "failed" };

function failure(fn: string, error: { code?: string; message: string }): ProfileWrite {
  if (error.code === "22023") return { status: "invalid", error: error.message };
  if (error.code === "PGRST202" || error.code === "42883") return { status: "unavailable" };
  console.error(`${fn} failed:`, error.message);
  return { status: "failed" };
}

/** Finish profile setup for a login that has no profile row: creates the one profile whose id is that login's id. */
export async function createMyProfile(accountId: string, accountEmail: string | null, input: ProfileSetupInput): Promise<ProfileWrite> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("create_my_profile", { p_account: accountId, p_email: accountEmail ?? "", p_input: input });
  if (error) return failure("create_my_profile", error);
  const reply = data as { created?: boolean; username?: string } | null;
  return typeof reply?.username === "string" ? { status: "ok", username: reply.username, created: reply.created === true } : { status: "failed" };
}

export async function updateMyProfile(profileId: ProfileId, input: ProfileEditInput): Promise<ProfileWrite> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("update_my_profile", { p_profile: profileId, p_input: input });
  if (error) return failure("update_my_profile", error);
  const reply = data as { username?: string } | null;
  return typeof reply?.username === "string" ? { status: "ok", username: reply.username } : { status: "failed" };
}

/** The Edit profile form's starting values (own profile only). */
export async function getMyProfileForm(profileId: ProfileId): Promise<{ displayName: string; username: string; bio: string; bioAvailable: boolean } | null> {
  const db = createSupabaseServiceRoleClient();
  const withBio = await db.from("profiles").select("display_name, username, bio").eq("id", profileId).maybeSingle();
  const reply = withBio.error ? await db.from("profiles").select("display_name, username").eq("id", profileId).maybeSingle() : withBio;
  const row = reply.data as Record<string, unknown> | null;
  if (!row) return null;
  const text = (v: unknown) => typeof v === "string" ? v : "";
  return { displayName: text(row.display_name), username: text(row.username), bio: text(row.bio), bioAvailable: !withBio.error };
}
