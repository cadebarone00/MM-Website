"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BroadcastStanding } from "@/lib/broadcast/types";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";

/**
 * Keeps the broadcast's leaderboard/match-play data fresh with no page
 * refresh, using the same Realtime pattern already proven in
 * components/portal/ScoringPanel.tsx: subscribe to the tables that can
 * change either one, and on any change re-fetch the full computed result
 * from our own API rather than trying to patch individual rows client-side
 * (simpler, and matches how the rest of this app already does it).
 *
 * Phase 1 scope (see the spec's §22): no broadcast_events queue involved —
 * this is exactly the "leaderboard scene subscribes directly to
 * live_hole_scores" plan from the spec's Phase 1 Definition of Done.
 */
export function useLiveBroadcastData(
  seasonYear: number,
  initial: { standings: BroadcastStanding[]; leaderboardFinal: boolean; matchPlay: BroadcastMatchPlay }
) {
  const [standings, setStandings] = useState(initial.standings);
  const [leaderboardFinal, setLeaderboardFinal] = useState(initial.leaderboardFinal);
  const [matchPlay, setMatchPlay] = useState(initial.matchPlay);

  const reload = useCallback(async () => {
    try {
      const [leaderboardRes, matchPlayRes] = await Promise.all([fetch("/api/broadcast/leaderboard", { cache: "no-store" }), fetch("/api/broadcast/match-play", { cache: "no-store" })]);
      if (leaderboardRes.ok) {
        const data = await leaderboardRes.json();
        setStandings(data.standings);
        setLeaderboardFinal(data.final);
      }
      if (matchPlayRes.ok) setMatchPlay(await matchPlayRes.json());
    } catch {
      // A missed refresh just means the broadcast shows slightly stale data
      // until the next successful one — never worth breaking the screen over.
    }
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn("Realtime env vars not set — /broadcast will only update on page load.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`broadcast-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_hole_scores", filter: `season_year=eq.${seasonYear}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_match_boxes", filter: `season_year=eq.${seasonYear}` }, reload)
      .subscribe();

    // Reconnect insurance, same as ScoringPanel.tsx: a tab that was
    // backgrounded or briefly offline re-syncs instead of trusting the
    // Realtime socket picked back up cleanly.
    function onVisible() {
      if (document.visibilityState === "visible") reload();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reload);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", reload);
    };
  }, [seasonYear, reload]);

  return { standings, leaderboardFinal, matchPlay };
}
