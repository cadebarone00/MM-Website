"use client";

import { useSyncExternalStore } from "react";

/**
 * Organizer → Competition → Overview, with no competition (Individual and Team both None): whether players score their
 * rounds in the app. On: the Golf tab's Overview lists the day's scores, best first. Off: nothing under the round box.
 * On by default. Preview: kept on this device (like Player Stats) until trip settings are saved to the database.
 */
const KEY = "golfTripInAppScoring";
const EVENT = "golf-trip-in-app-scoring";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true; // storage blocked: the default
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(EVENT, onChange); };
}

export function useInAppScoring(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

export function setInAppScoring(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch { /* storage blocked: the change lasts until the page reloads */ }
  window.dispatchEvent(new Event(EVENT));
}
