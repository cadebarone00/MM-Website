import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ProfileId } from "./profileIdentity";
import { DEFAULT_PREFERENCES, preferencesFromRow, type NotificationChannel, type NotificationType, type PreferenceChange, type Preferences } from "./preferences";

/**
 * Settings → Notifications and Golf preferences (supabase/profile_preferences.sql), server only. The profile id always
 * comes from the signed-in session. "unavailable" = the SQL hasn't been run yet (Settings then hides those two cards).
 */
export async function getMyPreferences(profileId: ProfileId): Promise<Preferences | null> {
  const { data, error } = await createSupabaseServiceRoleClient().from("profile_preferences")
    .select("notifications, distance_unit, usual_tees, score_entry").eq("profile_id", profileId).maybeSingle();
  if (error) return null;
  return data ? preferencesFromRow(data) : DEFAULT_PREFERENCES;
}

export type PreferenceWrite = { status: "ok"; preferences: Preferences } | { status: "invalid"; error: string } | { status: "unavailable" } | { status: "failed" };
export async function saveMyPreference(profileId: ProfileId, change: PreferenceChange): Promise<PreferenceWrite> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("set_my_preference", { p_profile: profileId, p_change: change });
  if (!error) return { status: "ok", preferences: preferencesFromRow(data) };
  if (error.code === "22023") return { status: "invalid", error: error.message };
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") return { status: "unavailable" };
  console.error("set_my_preference failed:", error.message);
  return { status: "failed" };
}

/** Does this golfer want this alert on this channel? Unknown (SQL not run, read failed) = the default. */
export async function wantsNotification(profileId: ProfileId, type: NotificationType, channel: NotificationChannel): Promise<boolean> {
  const prefs = await getMyPreferences(profileId);
  return (prefs ?? DEFAULT_PREFERENCES).notifications[type][channel];
}
