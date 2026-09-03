"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Changing which year /broadcast displays (Broadcast Controls) touches
 * everything on the page at once — state, config, standings, match play,
 * holding venue/date. Rather than plumb a coordinated re-fetch of four
 * different data sources, a full reload gets every open /broadcast tab
 * onto the new year cleanly — the same `window.location.reload()` pattern
 * Master Settings' own save/set-active-year actions already use. This is a
 * deliberate, infrequent admin action, not something viewers do themselves.
 */
export function useReloadOnDisplayYearChange(loadedWithYear: number) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("broadcast-display-year")
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_display_year" }, (payload) => {
        const newYear = (payload.new as { season_year?: number } | null)?.season_year;
        if (newYear !== undefined && newYear !== loadedWithYear) window.location.reload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadedWithYear]);
}
