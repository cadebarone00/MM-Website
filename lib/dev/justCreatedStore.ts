"use client";

import { useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

/**
 * Dev only — "Just created" trip memory. Everything set up on the Just created trip (Settings choices, your own itinerary
 * items) is saved here as you go, so it survives moving between the trip and Settings and reloading. Stored in this
 * browser's localStorage (shared by the /dev panel and the app frame). "Reset" in the /dev panel clears it, and every
 * page using it starts fresh (the version changes, so keyed components remount).
 */
const KEY = "maroon-dev-just-created-v1";
const VERSION_KEY = `${KEY}:version`;

type Snapshot = Record<string, unknown>;
let cache: Snapshot | null = null;
const listeners = new Set<() => void>();

// Sets don't survive JSON on their own: stored as { $set: [...] }.
const replacer = (_key: string, value: unknown) => value instanceof Set ? { $set: [...value] } : value;
const reviver = (_key: string, value: unknown) =>
  value && typeof value === "object" && Array.isArray((value as { $set?: unknown }).$set) ? new Set((value as { $set: unknown[] }).$set) : value;

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

function snapshot(): Snapshot {
  if (cache) return cache;
  try { cache = JSON.parse(storage()?.getItem(KEY) ?? "{}", reviver) as Snapshot; } catch { cache = {}; }
  return cache ?? {};
}

function notify() { for (const listener of listeners) listener(); }

function subscribe(listener: () => void) {
  listeners.add(listener);
  // The /dev panel and the app frame are separate pages: a reset in one reaches the other through the storage event.
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === VERSION_KEY || event.key === null) { cache = null; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

const version = () => Number(storage()?.getItem(VERSION_KEY) ?? 0) || 0;

/** False on the server and during the first (hydrating) render, true after: saved data only exists in the browser. */
export function useJustCreatedReady(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/** Changes after every reset; use it in `key`s so pages start fresh. 0 on the server. */
export function useJustCreatedVersion(): number {
  return useSyncExternalStore(subscribe, version, () => 0);
}

/** Everything saved for the Just created trip (field → value). Pass the current version (useJustCreatedVersion) so a
 *  memoized caller reads again after a reset. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function readJustCreatedAll(_version?: number): Record<string, unknown> {
  return { ...snapshot() };
}

export function readJustCreated<T>(field: string): T | undefined {
  return snapshot()[field] as T | undefined;
}

export function writeJustCreated(field: string, value: unknown): void {
  const next = { ...snapshot(), [field]: value };
  cache = next;
  try { storage()?.setItem(KEY, JSON.stringify(next, replacer)); } catch { /* storage full or blocked: keep it in memory */ }
}

/** Wipes the Just created trip back to how onboarding left it. */
export function resetJustCreated(): void {
  cache = {};
  try {
    storage()?.removeItem(KEY);
    // Players' Play / Sit out on the Just created trip (lib/platform/roundRsvp, trip key "empty") go too.
    const rsvp = JSON.parse(storage()?.getItem("golfTripRoundRsvp") ?? "{}") as Record<string, unknown>;
    if ("empty" in rsvp) { delete rsvp.empty; storage()?.setItem("golfTripRoundRsvp", JSON.stringify(rsvp)); window.dispatchEvent(new Event("golf-trip-round-rsvp")); }
    storage()?.setItem(VERSION_KEY, String(version() + 1));
  } catch { /* nothing saved to clear */ }
  notify();
}

/**
 * useState that, when `persist` is on (the Just created trip), starts from the saved value and saves every change.
 * Off: exactly useState.
 */
export function usePersistedState<T>(persist: boolean, field: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const saved = persist ? readJustCreated<T>(field) : undefined;
    return saved !== undefined ? saved : typeof initial === "function" ? (initial as () => T)() : initial;
  });
  const set: Dispatch<SetStateAction<T>> = update => setValue(current => {
    const next = typeof update === "function" ? (update as (current: T) => T)(current) : update;
    if (persist) writeJustCreated(field, next);
    return next;
  });
  return [value, set];
}
