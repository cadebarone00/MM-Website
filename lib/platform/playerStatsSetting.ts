"use client";

import { useSyncExternalStore } from "react";

/**
 * Organizer → Player Scoring → Player Stats: whether players record stats (putts, fairways, greens in regulation).
 * On = required: everyone's Scoring sheet asks for them. Off = optional: each player chooses in their own settings
 * (General → Scorecard View → My stats). On by default.
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

const OPT_IN_KEY = "golfTripMyStats";

function readOptIn(): boolean {
  try {
    return window.localStorage.getItem(OPT_IN_KEY) === "on";
  } catch {
    return false;
  }
}

/** My own choice (when stats are optional): record my stats on my scorecard. Off by default. */
export function useMyStatsOptIn(): boolean {
  return useSyncExternalStore(subscribe, readOptIn, () => false);
}

export function setMyStatsOptIn(on: boolean) {
  try {
    window.localStorage.setItem(OPT_IN_KEY, on ? "on" : "off");
  } catch { /* storage blocked: the change lasts until the page reloads */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Whether my Scoring sheet asks for stats: required by the organizer, or I opted in. */
export function useRecordMyStats(): boolean {
  const required = usePlayerStats();
  const mine = useMyStatsOptIn();
  return required || mine;
}
