import type { AlertLevel, Trigger } from "../metadata.ts";

/**
 * Delivery rules, modeled as pure functions — nothing here sends, schedules or stores anything (no jobs, no push).
 * Idempotency: every alert has a key; the same key is only ever delivered once.
 * Corrections: re-detecting a round gives the current set of keys; keys that disappeared are withdrawn (alerts already
 * delivered can't be recalled, but they leave the inbox / feed), new keys are added.
 * Reminders: keyed by rule + item + the item's start, so editing the time cancels the old reminder and schedules a new one.
 * Time zones: itinerary times are trip-local wall times ("YYYY-MM-DDTHH:mm" in the trip's IANA zone).
 */

/** Minutes the zone is ahead of UTC at that instant (e.g. -420 for Pacific daylight time). */
export function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** A trip-local wall time → the real instant (ISO, UTC). Handles daylight-saving changes. */
export function localToUtc(local: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error(`Not a trip-local time: ${local}`);
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let utc = wall - zoneOffsetMinutes(wall, timeZone) * 60000;
  utc = wall - zoneOffsetMinutes(utc, timeZone) * 60000; // second pass settles DST boundaries
  return new Date(utc).toISOString();
}

/** When a scheduled reminder goes out (UTC ISO), or null for event-driven alerts (sent when the edit / message happens). */
export function reminderSendAt(trigger: Trigger, startsAtLocal: string, timeZone: string): string | null {
  if (trigger.type === "event") return null;
  if (trigger.type === "before") return new Date(Date.parse(localToUtc(startsAtLocal, timeZone)) - trigger.minutes * 60000).toISOString();
  const day = new Date(`${startsAtLocal.slice(0, 10)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return localToUtc(`${day.toISOString().slice(0, 10)}T${trigger.localTime}`, timeZone);
}

export const reminderKey = (ruleId: string, itemId: string, startsAtLocal: string) => `${ruleId}:${itemId}:${startsAtLocal}`;

export interface ReminderItem { id: string; startsAt: string; cancelled?: boolean }
/** After an itinerary edit: which reminder keys to cancel and which to schedule. A cancelled item schedules nothing. */
export function rescheduleReminders(ruleIds: string[], before: ReminderItem | null, after: ReminderItem | null): { cancel: string[]; schedule: string[] } {
  const keys = (item: ReminderItem | null) => (item && !item.cancelled ? ruleIds.map((rule) => reminderKey(rule, item.id, item.startsAt)) : []);
  const old = keys(before), next = keys(after);
  return { cancel: old.filter((key) => !next.includes(key)), schedule: next.filter((key) => !old.includes(key)) };
}

/** Score corrections: the keys a fresh detection pass produces vs what was recorded. */
export function reconcile(recorded: string[], detected: string[]): { withdraw: string[]; add: string[]; keep: string[] } {
  return {
    withdraw: recorded.filter((key) => !detected.includes(key)),
    add: detected.filter((key) => !recorded.includes(key)),
    keep: recorded.filter((key) => detected.includes(key)),
  };
}

/** The same alert (key) for the same person is delivered once. */
export const isDuplicate = (key: string, recipient: string, delivered: Set<string>) => delivered.has(`${key}:${recipient}`);

export interface QueuedGolfAlert { key: string; level: AlertLevel; at: string }

/**
 * Volume control for golf highlights, per recipient (travel alerts are never capped). Configurable:
 *   maxPerWindow / windowMinutes — at most this many golf alerts in any window of this length (0 = no limit);
 *   exceptional — how Big Plays are treated: "always-send" = never muted and they don't use up the limit;
 *                 "prioritize" = counted, but kept ahead of smaller moments.
 * Within the limit the biggest moments win, then the earliest. Muted alerts stay in the trip's history.
 */
export interface VolumePolicy { maxPerWindow: number; windowMinutes: number; exceptional: "always-send" | "prioritize" }
export const DEFAULT_VOLUME_POLICY: VolumePolicy = { maxPerWindow: 3, windowMinutes: 15, exceptional: "always-send" };

export function applyVolumeCap(alerts: QueuedGolfAlert[], policy: VolumePolicy = DEFAULT_VOLUME_POLICY): { send: string[]; muted: string[] } {
  const priority: Record<AlertLevel, number> = { "big-plays": 0, balanced: 1, all: 2 };
  const exempt = (a: QueuedGolfAlert) => policy.exceptional === "always-send" && a.level === "big-plays";
  const ordered = [...alerts].sort((a, b) => priority[a.level] - priority[b.level] || a.at.localeCompare(b.at));
  const sent: QueuedGolfAlert[] = [];
  const muted: string[] = [];
  for (const alert of ordered) {
    if (exempt(alert) || policy.maxPerWindow <= 0) { sent.push(alert); continue; }
    const t = Date.parse(alert.at);
    const nearby = sent.filter((s) => !exempt(s) && Math.abs(Date.parse(s.at) - t) < policy.windowMinutes * 60000).length;
    if (nearby < policy.maxPerWindow) sent.push(alert); else muted.push(alert.key);
  }
  return { send: sent.sort((a, b) => a.at.localeCompare(b.at)).map((a) => a.key), muted };
}
