import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { wantsNotification } from "@/lib/profile/preferencesServer";
import { catalogEntry, fillBlanks, pickWording, type NotificationKind } from "./catalog.ts";
import { batches, expoMessage, EXPO_PUSH_URL, ticketOutcomes, type ExpoMessage, type PushContent } from "./expoPush.ts";

/**
 * Sends phone notifications to the iPhone / Android app (project_specs.md "Expo app Step 6"). Each person: their Settings
 * switch for the type must be on (Settings → Notifications → Push), the wording is one of the 3 approved versions (never
 * the same one twice in a row), then every phone they turned notifications on for gets it through Expo's push service.
 * Phones Expo says are gone are forgotten. Before supabase/push_devices.sql is run nothing is sent ("not_installed").
 * Never throws: callers fire it after the real change has saved and don't wait on it.
 */
const db = () => createSupabaseServiceRoleClient();
const MISSING = new Set(["42P01", "PGRST205"]);
export type PushResult = { status: "ok"; sent: number; failed: number } | { status: "not_installed" } | { status: "failed" };

type Device = { token: string; profile_id: string };

async function devicesFor(profileIds: string[]): Promise<Device[] | "not_installed" | null> {
  if (!profileIds.length) return [];
  const { data, error } = await db().from("push_devices").select("token, profile_id").in("profile_id", profileIds);
  if (error) return MISSING.has(error.code ?? "") ? "not_installed" : null;
  return (data ?? []) as Device[];
}

async function deliver(messages: ExpoMessage[]): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  const forget: string[] = [];
  for (const batch of batches(messages)) {
    const reply = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(10_000),
    }).then((r) => r.json()).catch(() => null);
    for (const t of ticketOutcomes(batch, reply)) {
      if (t.outcome === "sent") sent++;
      else { failed++; if (t.outcome === "forget") forget.push(t.token); }
    }
  }
  if (forget.length) await db().from("push_devices").delete().in("token", forget);
  return { sent, failed };
}

/** One type from the master list to some people. `values` fill the wording's {Blanks} and the link's {Trip ID}. */
/** `link`: open this instead of the type's usual link (e.g. a trip invite opens its invite page). `words`: the title and
 *  body for a type whose wording lives outside the master list (big moments use the approved momentum words). */
export async function sendPush(input: { to: string[]; kind: NotificationKind; values: Record<string, string | number>; groupId?: string | null; link?: string; words?: { title: string; body: string } }): Promise<PushResult> {
  try {
    const entry = catalogEntry(input.kind);
    const people = [...new Set(input.to)];
    // Settings → Notifications → Push for this type (always on when the type has no switch).
    const allowed = entry.switch
      ? (await Promise.all(people.map(async (id) => ((await wantsNotification(id, entry.switch!, "push")) ? id : null)))).filter((id): id is string => !!id)
      : people;
    const devices = await devicesFor(allowed);
    if (devices === "not_installed") return { status: "not_installed" };
    if (devices === null) return { status: "failed" };
    if (!devices.length) return { status: "ok", sent: 0, failed: 0 };

    const owners = [...new Set(devices.map((d) => d.profile_id))];
    const { data: last } = await db().from("notification_wording_last").select("profile_id, version").eq("kind", input.kind).in("profile_id", owners);
    const lastOf = new Map(((last ?? []) as { profile_id: string; version: number }[]).map((r) => [r.profile_id, r.version]));
    const link = input.link ?? fillBlanks(entry.link, input.values);
    const messages: ExpoMessage[] = [];
    const versions: { profile_id: string; kind: string; version: number; updated_at: string }[] = [];
    for (const owner of owners) {
      if (input.words) {
        const content: PushContent = { title: input.words.title, body: input.words.body, link, kind: input.kind, groupId: input.groupId };
        for (const d of devices) if (d.profile_id === owner) messages.push(expoMessage(d.token, content));
        continue;
      }
      const picked = pickWording(input.kind, lastOf.get(owner) ?? null);
      if (!picked) continue; // Highlights-sheet types bring their own wording (not sent from here yet)
      const content: PushContent = { title: fillBlanks(picked.wording.title, input.values), body: fillBlanks(picked.wording.body, input.values), link, kind: input.kind, groupId: input.groupId };
      versions.push({ profile_id: owner, kind: input.kind, version: picked.version, updated_at: new Date().toISOString() });
      for (const d of devices) if (d.profile_id === owner) messages.push(expoMessage(d.token, content));
    }
    if (versions.length) await db().from("notification_wording_last").upsert(versions);
    return { status: "ok", ...(await deliver(messages)) };
  } catch {
    return { status: "failed" };
  }
}

/** Settings → "Send a test notification": to my own phones only, fixed words. */
export async function sendTestPush(profileId: string): Promise<PushResult> {
  try {
    const devices = await devicesFor([profileId]);
    if (devices === "not_installed") return { status: "not_installed" };
    if (devices === null) return { status: "failed" };
    const content: PushContent = { title: "Notifications are on ⛳", body: "This is what The Maroon's notifications look like.", link: "/profile", kind: "test" };
    return { status: "ok", ...(await deliver(devices.map((d) => expoMessage(d.token, content)))) };
  } catch {
    return { status: "failed" };
  }
}

/** Remember this phone for me (it moves to me if someone else used it before). */
export async function savePushDevice(profileId: string, token: string, platform: "ios" | "android"): Promise<"ok" | "not_installed" | "failed"> {
  const { error } = await db().from("push_devices").upsert({ token, profile_id: profileId, platform, last_seen_at: new Date().toISOString() });
  return error ? (MISSING.has(error.code ?? "") ? "not_installed" : "failed") : "ok";
}

/** Forget this phone (signing out, or notifications turned off). Only my own row. */
export async function removePushDevice(profileId: string, token: string): Promise<"ok" | "not_installed" | "failed"> {
  const { error } = await db().from("push_devices").delete().eq("token", token).eq("profile_id", profileId);
  return error ? (MISSING.has(error.code ?? "") ? "not_installed" : "failed") : "ok";
}
