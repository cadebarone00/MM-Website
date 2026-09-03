"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BroadcastState } from "@/lib/broadcast/types";

/**
 * Keeps automation_mode/current_scene/scene_started_at live, so a host's
 * "Broadcast Controls" click (see app/portal/admin/broadcast-controls)
 * reaches every open /broadcast tab immediately — same Realtime-then-
 * refetch pattern as useLiveBroadcastData.ts. Pass `enabled: false` for a
 * preview render (see app/broadcast/page.tsx's `?preview=1`) — a Tiger
 * rehearsing privately must never subscribe to the real, shared broadcast
 * state, or every open real /broadcast tab would flicker along with it.
 */
export function useLiveBroadcastState(seasonYear: number, initial: BroadcastState, enabled = true) {
  const [state, setState] = useState(initial);

  useEffect(() => {
    if (!enabled) return;

    async function reload() {
      try {
        const res = await fetch("/api/broadcast", { cache: "no-store" });
        if (res.ok) setState((await res.json()).state);
      } catch {
        // Stays on the last-known state until the next successful refresh.
      }
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn("Realtime env vars not set — broadcast controls will only take effect on page load.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`broadcast-state-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_state", filter: `season_year=eq.${seasonYear}` }, reload)
      .subscribe();

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
  }, [seasonYear, enabled]);

  return state;
}
