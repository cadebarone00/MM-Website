"use client";

import { useSyncExternalStore } from "react";
import { devRoundsReducer, parseDevRounds, seedDevRounds, type DevRoundsAction, type DevRoundsState } from "@/lib/dev/devPlayerRounds";

/** DEV ONLY: one shared player-rounds store per browser tab (sessionStorage), read by the trip, dev profile and History. */
const KEY = "maroon-dev-player-rounds-v1";
const SEED = seedDevRounds();
const listeners = new Set<() => void>();
let state: DevRoundsState | null = null;

function current(): DevRoundsState {
  if (state) return state;
  try { state = parseDevRounds(sessionStorage.getItem(KEY)); } catch { state = SEED; }
  return state;
}

/** Throws the reducer's error (e.g. a duplicate link request) so the caller can show it. */
export function dispatchDevRounds(action: DevRoundsAction) {
  state = devRoundsReducer(current(), action);
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: keep it in memory */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useDevPlayerRounds = () => useSyncExternalStore(subscribe, current, () => SEED);
