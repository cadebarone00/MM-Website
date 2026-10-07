"use client";

import { useSyncExternalStore } from "react";

/**
 * Play / Sit out for each golf round. A player taps Play or Sit out on a round in their Itinerary; the organizer sees it
 * when picking tee-time players (Settings → Golf Schedule → a round): "I'm in!" or "I'm out" (and can't pick them).
 * Preview: kept on this device, per trip (`tripKey`: the dev data choice), by round number and player name, until it's
 * saved to the database.
 */
export type RoundRsvp = "in" | "out";
type Store = Record<string, Record<string, Record<string, RoundRsvp>>>;

const KEY = "golfTripRoundRsvp";
const EVENT = "golf-trip-round-rsvp";
let cache: { raw: string | null; store: Store } = { raw: null, store: {} };

function read(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== cache.raw) cache = { raw, store: raw ? JSON.parse(raw) as Store : {} };
  } catch { /* storage blocked or bad data: nothing saved */ }
  return cache.store;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(EVENT, onChange); };
}

const EMPTY: Store = {};

/** Everyone's Play / Sit out for this trip: round number → player name → "in" | "out". */
export function useRoundRsvps(tripKey: string): Record<string, Record<string, RoundRsvp>> {
  const store = useSyncExternalStore(subscribe, read, () => EMPTY);
  return store[tripKey] ?? {};
}

export function setRoundRsvp(tripKey: string, round: number, player: string, choice: RoundRsvp) {
  const store = read();
  const trip = store[tripKey] ?? {};
  const next: Store = { ...store, [tripKey]: { ...trip, [round]: { ...trip[round], [player]: choice } } };
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: lasts until reload */ }
  cache = { raw: JSON.stringify(next), store: next };
  window.dispatchEvent(new Event(EVENT));
}
