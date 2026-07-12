"use client";

import { useEffect, useState } from "react";
import { mergeLiveTournament, type LiveFeedPayload } from "@/lib/data/live";

export const LIVE_POLL_MS = 10000;
export const DETAIL_POLL_MS = 5000;

export function useLiveTournament(pollMs = LIVE_POLL_MS) {
  const [payload, setPayload] = useState<LiveFeedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/live-feed", { cache: "no-store" });
        if (!res.ok) throw new Error("feed unavailable");
        const data = await res.json();
        if (!cancelled) {
          setPayload(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Couldn't reach the live feed - showing the last update that worked.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  const tournament = mergeLiveTournament(payload);

  return { tournament, payload, error, loading };
}
