"use client";

import { useSyncExternalStore } from "react";

/**
 * Each player's scorecard view, remembered on their own device (General settings):
 * "slide" = the pull-up sheet, "hold" = hold anywhere for 2 s to open it full screen,
 * "button" = a Scoring button above the bottom menu opens it full screen.
 */
export type ScoringView = "slide" | "hold" | "button";
export const SCORING_VIEWS: { value: ScoringView; label: string }[] = [
  { value: "slide", label: "Slide up" },
  { value: "hold", label: "Hold for scoring" },
  { value: "button", label: "Scoring button" },
];

const KEY = "golfTripScoringView";
const EVENT = "golf-trip-scoring-view";
const isView = (value: unknown): value is ScoringView => value === "slide" || value === "hold" || value === "button";

function read(): ScoringView {
  try {
    const value = window.localStorage.getItem(KEY);
    return isView(value) ? value : "slide";
  } catch {
    return "slide"; // storage blocked (private mode etc.): fall back to the default
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(EVENT, onChange); };
}

export function useScoringView(): ScoringView {
  return useSyncExternalStore(subscribe, read, () => "slide");
}

export function setScoringView(value: ScoringView) {
  try { window.localStorage.setItem(KEY, value); } catch { /* not saved; this page still updates below */ }
  window.dispatchEvent(new Event(EVENT));
}
