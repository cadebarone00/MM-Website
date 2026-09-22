"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BroadcastStanding } from "@/lib/broadcast/types";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { detectLiveScoreEvent, type LiveScoreEvent } from "@/lib/broadcast/liveScoreEvent";

/**
 * How long a real birdie/eagle/bogey stays "active" before the
 * leaderboard scene goes back to plain rendering — matches the mock
 * rehearsal's own choreography (celebration + score change + row move,
 * see IndividualLeaderboardScene.tsx's MockLeaderboardScene timings).
 */
const LIVE_EVENT_DURATION_MS = 6_000;

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
  const [liveScoreEvent, setLiveScoreEvent] = useState<LiveScoreEvent | null>(null);
  const standingsRef = useRef(initial.standings);
  const clearEventTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      const [leaderboardRes, matchPlayRes] = await Promise.all([fetch("/api/broadcast/leaderboard", { cache: "no-store" }), fetch("/api/broadcast/match-play", { cache: "no-store" })]);
      if (leaderboardRes.ok) {
        const data = await leaderboardRes.json();
        // Diff against the previous snapshot BEFORE overwriting standingsRef
        // — this is what turns a real score update into the same
        // birdie/eagle/bogey celebration the mock rehearsal already shows
        // (see lib/broadcast/liveScoreEvent.ts). A missed detection here
        // just means the board updates silently, same as before this
        // existed — never worth blocking the refresh over.
        const event = detectLiveScoreEvent(standingsRef.current, data.standings);
        if (event) {
          if (clearEventTimer.current) clearTimeout(clearEventTimer.current);
          setLiveScoreEvent(event);
          clearEventTimer.current = setTimeout(() => setLiveScoreEvent(null), LIVE_EVENT_DURATION_MS);
        }
        standingsRef.current = data.standings;
        setStandings(data.standings);
        setLeaderboardFinal(data.final);
      }
      if (matchPlayRes.ok) setMatchPlay(await matchPlayRes.json());
    } catch {
      // A missed refresh just means the broadcast shows slightly stale data
      // until the next successful one — never worth breaking the screen over.
    }
  }, []);

  useEffect(() => () => {
    if (clearEventTimer.current) clearTimeout(clearEventTimer.current);
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

  return { standings, leaderboardFinal, matchPlay, liveScoreEvent };
}
