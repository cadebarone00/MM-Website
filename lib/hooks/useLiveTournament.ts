"use client";

import { useSeasonCatalog } from "@/components/SeasonCatalogProvider";
import { useEffect, useState } from "react";
import { mergeLiveTournament, type LiveFeedPayload } from "@/lib/data/live";
import { overlayConfirmedRoster } from "@/lib/data/confirmedRosterOverlay";
import type { RosterEntry } from "@/lib/live/types";

export const LIVE_POLL_MS = 10000;
export const DETAIL_POLL_MS = 5000;

export function useLiveTournament(pollMs = LIVE_POLL_MS, endpoint = "/api/live-feed") {
  const catalog = useSeasonCatalog();
  if (catalog.scheduled && endpoint === "/api/live-feed") endpoint = "/api/season-feed";
  if (catalog.section) endpoint += (endpoint.includes("?") ? "&" : "?") + "section=" + catalog.section;
  const [feed, setFeed] = useState<{ year: number; payload: LiveFeedPayload } | null>(null);
  const payload = feed?.year === catalog.nextTournament.year ? feed.payload : null;
  const [rosterFeed, setRosterFeed] = useState<{ year: number; roster: RosterEntry[] } | null>(null);
  const confirmedRoster = rosterFeed?.year === catalog.nextTournament.year ? rosterFeed.roster : [];
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
          setFeed({ year: catalog.nextTournament.year, payload: data });
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
        const res = await fetch("/api/confirmed-roster?section=" + (catalog.section ?? "home"), { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.ok && Array.isArray(data.roster)) setRosterFeed({ year: catalog.nextTournament.year, roster: data.roster });
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
  }, [pollMs, endpoint, catalog.nextTournament.year, catalog.section]);

  const merged = mergeLiveTournament(catalog.scheduled ? { ...payload, roster: payload?.roster ?? { maroon: [], white: [] } } : payload);
  const tournament = overlayConfirmedRoster({ ...merged, ...catalog.nextTournament, roster: merged.roster }, confirmedRoster);

  return { tournament, payload, error, loading };
}
