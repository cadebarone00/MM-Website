"use client";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

/** Writes on every edit, not on page unload. Keys must include the player and round. */
export function usePersistentState<T>(key: string | null, initial: T | (() => T)) {
  const [value, setValue] = useState(initial);
  const current = useRef(value);
  const initialValue = useRef(value);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let restored = initialValue.current;
    let failed = false;
    try {
      const raw = key && localStorage.getItem(key);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored?.version !== 1 || stored.value == null || Array.isArray(stored.value) !== Array.isArray(restored) || typeof stored.value !== typeof restored) throw new Error("Invalid saved draft");
        restored = stored.value as T;
      }
    } catch { failed = true; }
    current.current = restored;
    setValue(restored);
    setStorageError(failed);
    setReady(true);
  }, [key]);
  const update = useCallback((action: SetStateAction<T>) => {
    const next = typeof action === "function" ? (action as (previous: T) => T)(current.current) : action;
    current.current = next;
    try { if (key) localStorage.setItem(key, JSON.stringify({ version: 1, value: next })); }
    catch { setStorageError(true); }
    setValue(next);
  }, [key]);
  const clear = useCallback(() => { try { if (key) localStorage.removeItem(key); } catch { setStorageError(true); } }, [key]);
  return [value, update, { ready, clear, storageError }] as const;
}
