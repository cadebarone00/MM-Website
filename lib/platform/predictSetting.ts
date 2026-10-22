"use client";

import { useSyncExternalStore } from "react";
import { useSavedTripSetup } from "@/components/platform/SavedTripSetupProvider";
import type { BetId } from "./predictBets";

/**
 * Organizer → Predict: whether the trip's prediction market is shown (Golf → Predict) and which bets are offered.
 * On by default (the organizer can turn it off); every bet the trip allows starts on. Maroon Coins are play-only.
 * Preview: kept on this device (like Player Stats) until trip settings are saved to the database.
 */
export interface PredictSettings { on: boolean; /** Bets switched off by the organizer (everything else the trip allows is on). */ off: BetId[] }
const KEY = "golfTripPredict";
const EVENT = "golf-trip-predict";
const DEFAULT = '{"on":true,"off":[]}';

function snapshot(): string {
  try { return window.localStorage.getItem(KEY) ?? DEFAULT; } catch { return DEFAULT; }
}
function parse(text: string): PredictSettings {
  try {
    const value = JSON.parse(text) as Partial<PredictSettings>;
    return { on: value.on !== false, off: Array.isArray(value.off) ? value.off : [] };
  } catch { return { on: true, off: [] }; }
}
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(EVENT, onChange); };
}

export function usePredictSettings(): PredictSettings {
  const saved = useSavedTripSetup();
  const device = useSyncExternalStore(subscribe, snapshot, () => DEFAULT);
  return parse(saved ? JSON.stringify(saved.values.predictSettings ?? { on: true, off: [] }) : device);
}

export function savePredictSettings(next: PredictSettings) {
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: lasts until reload */ }
  window.dispatchEvent(new Event(EVENT));
}
