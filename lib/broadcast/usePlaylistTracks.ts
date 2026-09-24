"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PlaylistTrack } from "@/lib/broadcast/playlist";

/**
 * Keeps the playlist track list fresh with no page refresh — same
 * Realtime-then-refetch pattern as useLiveBroadcastData.ts. A track a host
 * just uploaded needs to show up (and be playable) for anyone already on
 * /watch-live without them reloading.
 */
export function usePlaylistTracks(seasonYear: number, initial: PlaylistTrack[]): PlaylistTrack[] {
  const [tracks, setTracks] = useState(initial);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/broadcast/playlist", { cache: "no-store" });
      if (res.ok) setTracks((await res.json()).tracks);
    } catch {
      // A missed refresh just means the list is briefly stale — never worth breaking the player over.
    }
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`broadcast-playlist-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_playlist_tracks", filter: `season_year=eq.${seasonYear}` }, reload)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [seasonYear, reload]);

  return tracks;
}
