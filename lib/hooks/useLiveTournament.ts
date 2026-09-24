"use client";

import { useEffect, useState } from "react";
import { mergeLiveTournament, type LiveFeedPayload } from "@/lib/data/live";
import { overlayConfirmedRoster } from "@/lib/data/confirmedRosterOverlay";
import type { RosterEntry } from "@/lib/live/types";

export const LIVE_POLL_MS = 10000;
export const DETAIL_POLL_MS = 5000;

export function useLiveTournament(pollMs = LIVE_POLL_MS, endpoint = "/api/live-feed") {
  const [payload, setPayload] = useState<LiveFeedPayload | null>(null);
  const [confirmedRoster, setConfirmedRoster] = useState<RosterEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
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

    async function loadConfirmedRoster() {
      try {
        const res = await fetch("/api/confirmed-roster", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.ok && Array.isArray(data.roster)) setConfirmedRoster(data.roster);
      } catch {
        // Pre-tournament roster overlay just won't apply this poll - tournament.roster stays whatever it already was.
      }
    }

    load();
    loadConfirmedRoster();
    const id = setInterval(() => {
      load();
      loadConfirmedRoster();
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs, endpoint]);

  const tournament = overlayConfirmedRoster(mergeLiveTournament(payload), confirmedRoster);

  return { tournament, payload, error, loading };
}
