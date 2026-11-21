"use client";
import { useEffect, useState } from "react";
import { onAppRefresh } from "./appRefresh";
import { loadAppData, savedAppData, type AppData } from "./appDataCache";

export type { AppData };

/** Loads one app data route (`{ ok, data }` or `{ ok: false, error }`) from the live server; `reload` asks again.
 *  A screen loaded before shows its saved data at once and loads again quietly (appDataCache.ts); with no connection
 *  the saved data stays. Pull-to-refresh and coming back to the app (appRefresh.ts) load it again without the loading screen. */
export function useAppData<T>(path: string | null): [AppData<T>, () => void] {
  const shown = (p: string | null): AppData<T> => {
    const data = p ? savedAppData<T>(p) : undefined;
    return data === undefined ? { status: "loading" } : { status: "ok", data };
  };
  const [state, setState] = useState<AppData<T>>(() => shown(path));
  const [tick, setTick] = useState(0);
  const [quiet, setQuiet] = useState(0);
  // A new path or Try again starts over at its saved data, else "loading" (set while rendering, not inside the effect).
  const [asked, setAsked] = useState({ path, tick });
  if (asked.path !== path || asked.tick !== tick) { setAsked({ path, tick }); setState(shown(path)); }
  useEffect(() => (path ? onAppRefresh(() => setQuiet((q) => q + 1)) : undefined), [path]);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void loadAppData<T>(path).then((next) => {
      if (!alive) return;
      // No connection: keep what's on screen. The server answering with an error (e.g. a deleted trip) still shows it.
      setState((now) => (next.status === "error" && next.code === 0 && now.status === "ok" ? now : next));
    });
    return () => { alive = false; };
  }, [path, tick, quiet]);
  return [state, () => setTick((t) => t + 1)];
}
