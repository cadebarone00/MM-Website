import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ProfileId } from "./profileIdentity";
import { GENDERS, profileLinksFromRows, type Gender, type ProfileEditInput, type ProfileLink } from "./profileEdit";

/**
 * Profile V1 edits (supabase/profile_v1.sql), server only. Creating a profile is Accounts V2's job (profileInitialization.ts). The ids always come from the signed-in session, never the
 * request. "invalid" carries the database's own message (username taken / reserved, lengths), safe to show.
 */
export type ProfileWrite = { status: "ok"; username: string; created?: boolean } | { status: "invalid"; error: string } | { status: "unavailable" } | { status: "failed" };

function failure(fn: string, error: { code?: string; message: string }): ProfileWrite {
  if (error.code === "22023") return { status: "invalid", error: error.message };
  if (error.code === "PGRST202" || error.code === "42883") return { status: "unavailable" };
  console.error(`${fn} failed:`, error.message);
  return { status: "failed" };
}

export async function updateMyProfile(profileId: ProfileId, input: ProfileEditInput): Promise<ProfileWrite> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("update_my_profile", { p_profile: profileId, p_input: input });
  if (error) return failure("update_my_profile", error);
  const reply = data as { username?: string } | null;
  return typeof reply?.username === "string" ? { status: "ok", username: reply.username } : { status: "failed" };
}

/** The Edit profile form's starting values (own profile only). gender / links are only "available" once
 *  supabase/profile_edit_v2.sql has run; until then the screen hides those rows. Gender is private: only read here. */
export interface MyProfileForm { displayName: string; username: string; bio: string; bioAvailable: boolean; gender: Gender | ""; genderAvailable: boolean; links: ProfileLink[]; linksAvailable: boolean }
export async function getMyProfileForm(profileId: ProfileId): Promise<MyProfileForm | null> {
  const db = createSupabaseServiceRoleClient();
  let row: Record<string, unknown> | null = null;
  let bioAvailable = false;
  let genderAvailable = false;
  for (const [columns, bio, gender] of [["display_name, username, bio, gender", true, true], ["display_name, username, bio", true, false], ["display_name, username", false, false]] as const) {
    const reply = await db.from("profiles").select(columns).eq("id", profileId).maybeSingle();
    if (!reply.error) { row = reply.data as Record<string, unknown> | null; bioAvailable = bio; genderAvailable = gender; break; }
  }
  if (!row) return null;
  const text = (v: unknown) => typeof v === "string" ? v : "";
  const gender = GENDERS.find((g) => g.value === row.gender)?.value ?? "";
  const links = await getProfileLinks(profileId);
  return { displayName: text(row.display_name), username: text(row.username), bio: text(row.bio), bioAvailable, gender, genderAvailable, links: links ?? [], linksAvailable: links !== null };
}

/** A profile's saved links, in order; null when they can't be read (profile_edit_v2.sql not run yet). Callers decide who may see them. */
export async function getProfileLinks(profileId: ProfileId): Promise<ProfileLink[] | null> {
  const { data, error } = await createSupabaseServiceRoleClient().from("profile_links").select("title, url, position").eq("profile_id", profileId).order("position");
  if (error) return null;
  return profileLinksFromRows(data);
}

export type LinksWrite = { status: "ok"; links: ProfileLink[] } | { status: "invalid"; error: string } | { status: "unavailable" } | { status: "failed" };
/** Replaces my links (already checked by profileLinksFromBody; the database checks again). */
export async function setMyProfileLinks(profileId: ProfileId, links: ProfileLink[]): Promise<LinksWrite> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("set_my_profile_links", { p_profile: profileId, p_links: links });
  if (error) {
    const result = failure("set_my_profile_links", error);
    return result.status === "ok" ? { status: "failed" } : result;
  }
  return { status: "ok", links: profileLinksFromRows(data) };
}
