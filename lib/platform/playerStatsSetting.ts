"use client";

import { useSyncExternalStore } from "react";

/**
 * Organizer → Player Scoring → Player Stats: whether players record stats (putts, fairways, greens in regulation) on their
 * scorecards. On: the Scoring sheet asks for them and the Golf tab has a Stats section. Off: players only enter their
 * score, nothing extra is recorded, and there is no Stats section. On by default.
 * Preview: kept on this device (like the scorecard view) until trip settings are saved to the database.
 */
const KEY = "golfTripPlayerStats";
const EVENT = "golf-trip-player-stats";

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

export function usePlayerStats(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

export function setPlayerStats(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch { /* storage blocked: the change lasts until the page reloads */ }
  window.dispatchEvent(new Event(EVENT));
}
