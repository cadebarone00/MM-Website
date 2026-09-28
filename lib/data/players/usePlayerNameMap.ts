"use client";

import { useEffect, useState } from "react";

/** Fetches the slug -> display name map (static and DB-only players alike)
 * for client components that only have a slug and no server-rendered name.
 * Returns {} until it loads; callers should fall back to the static
 * getPlayerDisplayName/getPlayerLastName helpers for any slug not yet in it. */
export function usePlayerNameMap(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/players/names", { signal: controller.signal, cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setNames(data.names);
      })
      .catch(() => {
        // Leave the static fallback in place if this fetch fails.
      });
    return () => controller.abort();
  }, []);
  return names;
}
