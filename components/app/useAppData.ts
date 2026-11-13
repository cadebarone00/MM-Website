"use client";
import { useEffect, useState } from "react";
import { onAppRefresh } from "./appRefresh";

export type AppData<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; error: string; code: number };

/** Loads one app data route (`{ ok, data }` or `{ ok: false, error }`) from the live server; `reload` asks again.
 *  Pull-to-refresh and coming back to the app (appRefresh.ts) load it again without the loading screen. */
export function useAppData<T>(path: string | null): [AppData<T>, () => void] {
  const [state, setState] = useState<AppData<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const [quiet, setQuiet] = useState(0);
  // A new path or Try again starts over at "loading" (set while rendering, not inside the effect).
  const [asked, setAsked] = useState({ path, tick });
  if (asked.path !== path || asked.tick !== tick) { setAsked({ path, tick }); setState({ status: "loading" }); }
  useEffect(() => (path ? onAppRefresh(() => setQuiet((q) => q + 1)) : undefined), [path]);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    fetch(path, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!alive) return;
        if (response.ok && body?.ok !== false) setState({ status: "ok", data: (body?.data ?? body) as T });
        else setState({ status: "error", error: body?.error ?? "Something went wrong. Try again.", code: response.status });
      })
      .catch(() => alive && setState({ status: "error", error: "We couldn't reach The Maroon. Check your connection and try again.", code: 0 }));
    return () => { alive = false; };
  }, [path, tick, quiet]);
  return [state, () => setTick((t) => t + 1)];
}
