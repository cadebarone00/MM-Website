/**
 * Settings → Notifications and Golf preferences (project_specs.md "Settings redo", 2026-11-19;
 * supabase/profile_preferences.sql). One set per profile. Shared by the screens, the save route and the server.
 */

import { NOTIFICATION_SWITCHES } from "../notifications/catalog.ts";

/** The Settings switches, straight from the notification master list (lib/notifications/catalog.ts). */
export const NOTIFICATION_TYPES = NOTIFICATION_SWITCHES;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]["id"];
export type NotificationChannel = "push" | "email";
export type NotificationSettings = Record<NotificationType, Record<NotificationChannel, boolean>>;

export const DISTANCE_UNITS = [{ id: "yards", label: "Yards" }, { id: "meters", label: "Meters" }] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number]["id"];
export const TEE_CHOICES = ["Black", "Blue", "White", "Gold", "Red", "Green"] as const;
export type UsualTees = (typeof TEE_CHOICES)[number] | "";
export const SCORE_ENTRIES = [{ id: "simple", label: "Simple", hint: "Strokes only" }, { id: "full", label: "Full", hint: "Strokes, putts, fairways, greens" }] as const;
export type ScoreEntry = (typeof SCORE_ENTRIES)[number]["id"];

export interface Preferences { notifications: NotificationSettings; distance: DistanceUnit; usualTees: UsualTees; scoreEntry: ScoreEntry }

/** Defaults: every phone alert on; emails only for the ones that matter outside the app (catalog `email`: friend requests, trip invites). */
export const DEFAULT_PREFERENCES: Preferences = {
  notifications: Object.fromEntries(NOTIFICATION_TYPES.map(({ id, email }) => [id, { push: true, email }])) as NotificationSettings,
  distance: "yards", usualTees: "", scoreEntry: "simple",
};

const record = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const isNotificationType = (v: string): v is NotificationType => NOTIFICATION_TYPES.some((t) => t.id === v);

/** Saved preferences read back (the database row, or a dev sample): anything missing or odd falls back to the default. */
export function preferencesFromRow(row: unknown): Preferences {
  const r = record(row) ?? {};
  const saved = record(r.notifications) ?? {};
  const notifications = Object.fromEntries(NOTIFICATION_TYPES.map(({ id }) => {
    const one = record(saved[id]) ?? {};
    const fallback = DEFAULT_PREFERENCES.notifications[id];
    return [id, { push: typeof one.push === "boolean" ? one.push : fallback.push, email: typeof one.email === "boolean" ? one.email : fallback.email }];
  })) as NotificationSettings;
  const distance = DISTANCE_UNITS.some((d) => d.id === (r.distance ?? r.distance_unit)) ? (r.distance ?? r.distance_unit) as DistanceUnit : DEFAULT_PREFERENCES.distance;
  const tees = r.usualTees ?? r.usual_tees;
  const usualTees = TEE_CHOICES.includes(tees as (typeof TEE_CHOICES)[number]) ? tees as UsualTees : "";
  const scoreEntry = SCORE_ENTRIES.some((s) => s.id === (r.scoreEntry ?? r.score_entry)) ? (r.scoreEntry ?? r.score_entry) as ScoreEntry : DEFAULT_PREFERENCES.scoreEntry;
  return { notifications, distance, usualTees, scoreEntry };
}

/** One change to save (PUT /api/account/preferences). Only these shapes are accepted; anything else is refused. */
export type PreferenceChange =
  | { notification: NotificationType; channel: NotificationChannel; on: boolean }
  | { distance: DistanceUnit } | { usualTees: UsualTees } | { scoreEntry: ScoreEntry };

export function preferenceChangeFromBody(body: unknown): { ok: true; change: PreferenceChange } | { ok: false; error: string } {
  const r = record(body);
  if (!r) return { ok: false, error: "Nothing to save." };
  if (typeof r.notification === "string") {
    if (!isNotificationType(r.notification) || (r.channel !== "push" && r.channel !== "email") || typeof r.on !== "boolean") return { ok: false, error: "That notification setting isn't one we know." };
    return { ok: true, change: { notification: r.notification, channel: r.channel, on: r.on } };
  }
  if ("distance" in r) return DISTANCE_UNITS.some((d) => d.id === r.distance) ? { ok: true, change: { distance: r.distance as DistanceUnit } } : { ok: false, error: "Choose Yards or Meters." };
  if ("usualTees" in r) return r.usualTees === "" || TEE_CHOICES.includes(r.usualTees as (typeof TEE_CHOICES)[number]) ? { ok: true, change: { usualTees: r.usualTees as UsualTees } } : { ok: false, error: "Choose one of the tee colours." };
  if ("scoreEntry" in r) return SCORE_ENTRIES.some((s) => s.id === r.scoreEntry) ? { ok: true, change: { scoreEntry: r.scoreEntry as ScoreEntry } } : { ok: false, error: "Choose Simple or Full." };
  return { ok: false, error: "Nothing to save." };
}

/** The preferences after one change. */
export function applyPreferenceChange(prefs: Preferences, change: PreferenceChange): Preferences {
  if ("notification" in change) return { ...prefs, notifications: { ...prefs.notifications, [change.notification]: { ...prefs.notifications[change.notification], [change.channel]: change.on } } };
  return { ...prefs, ...change };
}
