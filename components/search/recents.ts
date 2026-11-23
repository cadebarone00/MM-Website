"use client";

import { useEffect, useState } from "react";

/**
 * "Recent" for a search screen: things opened from it, newest first, on this device only (a per-viewer convenience —
 * blocked or cleared storage just means an empty list). `key` names the list in browser storage.
 */
export const RECENT_MAX = 8;

export function readRecents<T extends { id: string }>(key: string, isItem: (value: unknown) => value is T): T[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter(isItem).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

function writeRecents(key: string, list: { id: string }[]) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* storage blocked: recents just don't stick */ }
}

/** The recent list plus remember (move to the top), forget one (id) and Clear all (null). */
export function useRecents<T extends { id: string }>(key: string, isItem: (value: unknown) => value is T) {
  const [recents, setRecents] = useState<T[]>([]);
  // Read after mount (the server render has no browser storage).
  useEffect(() => { queueMicrotask(() => setRecents(readRecents(key, isItem))); }, [key, isItem]);
  // Saved straight away, not inside a state update: picking something often closes the search screen in the same tap,
  // and an update for a screen that's closing never runs.
  function remember(item: T) {
    const next = [item, ...readRecents(key, isItem).filter((r) => r.id !== item.id)].slice(0, RECENT_MAX);
    writeRecents(key, next); setRecents(next);
  }
  function forget(id: string | null) {
    const next = id ? recents.filter((r) => r.id !== id) : [];
    writeRecents(key, next); setRecents(next);
  }
  return { recents, remember, forget };
}
