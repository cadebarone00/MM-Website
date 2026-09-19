"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { deleteRoundInProgress, parseRoundInProgress, readRoundInProgressRaw } from "./roundInProgress";

const CHANGED = "mm-handicap-round-changed";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGED, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGED, callback);
  };
}

/**
 * This device's handicap round in progress (null if none), kept live: it
 * updates when the round is deleted here or changed in another tab.
 * `deleteRound` throws the round away entirely.
 */
export function useRoundInProgress(playerSlug: string) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => { try { return JSON.stringify(readRoundInProgressRaw(localStorage, playerSlug)); } catch { return ""; } },
    () => ""
  );
  const round = useMemo(() => (snapshot ? parseRoundInProgress(JSON.parse(snapshot)) : null), [snapshot]);
  const deleteRound = useCallback(() => {
    try { deleteRoundInProgress(localStorage, playerSlug); } catch { /* Nothing more we can do if storage is blocked. */ }
    window.dispatchEvent(new Event(CHANGED));
  }, [playerSlug]);
  return { round, deleteRound };
}
