"use client";
import { useEffect, useState } from "react";
import type { CountdownTarget } from "@/lib/countdown";

export function useCountdownTarget(source: "tournament" | "watch-live", enabled = true) {
  const [target, setTarget] = useState<CountdownTarget | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    async function refresh() {
      try {
        const response = await fetch(`/api/countdown?source=${source}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (alive) setTarget(data.target);
      } catch { /* Keep the last successful target while offline. */ }
    }
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, [source, enabled]);
  return target;
}
