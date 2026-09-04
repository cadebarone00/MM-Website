"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { pickActiveEvent, type ActiveBroadcastEvent } from "./eventDisplay";
import type { BroadcastEventRow } from "./queue";
import type { BroadcastConfig } from "./types";

/**
 * Which broadcast_events row (if any) should be showing right now, and
 * drives it through its display duration and on to the next one — all
 * client-local, no DB writes (spec's explicit choice: "has this been
 * shown" lives in a ref, never persisted, same no-persistent-controller
 * philosophy as Phase 1's scene rotation). Realtime-then-refetch against
 * the same GET /api/broadcast endpoint every other broadcast hook already
 * uses — see lib/broadcast/useLiveBroadcastState.ts for the identical
 * shape this copies.
 *
 * Pass `enabled: false` for the Broadcast Controls rehearsal preview
 * (`/broadcast?preview=1`) — same convention useLiveBroadcastState.ts
 * already uses; a rehearsal must never show a real, currently-queued
 * takeover it isn't meant to represent.
 */
export function useBroadcastQueue(seasonYear: number, initialEvents: BroadcastEventRow[], config: BroadcastConfig, enabled = true): ActiveBroadcastEvent | null {
  const [events, setEvents] = useState(initialEvents);
  const shownIds = useRef<Set<string>>(new Set());
  const [bump, setBump] = useState(0);
  const [activeEvent, setActiveEvent] = useState<ActiveBroadcastEvent | null>(() => (enabled ? pickActiveEvent(initialEvents, shownIds.current) : null));

  // Realtime subscribe/refetch — identical shape to useLiveBroadcastState.ts.
  useEffect(() => {
    if (!enabled) return;

    async function reload() {
      try {
        const res = await fetch("/api/broadcast", { cache: "no-store" });
        if (res.ok) setEvents((await res.json()).events);
      } catch {
        // Stays on the last-known events until the next successful refresh.
      }
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn("Realtime env vars not set — /broadcast will only pick up new events on page load.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`broadcast-events-${seasonYear}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_events", filter: `season_year=eq.${seasonYear}` }, reload)
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

  // Re-pick whenever the event list changes (a Realtime-triggered refetch)
  // or a display-duration timer fires (bump) — never on its own timer.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: this IS the re-evaluation, same justification as useAutoScene.ts's tick().
    setActiveEvent(enabled ? pickActiveEvent(events, shownIds.current) : null);
  }, [events, bump, enabled]);

  // Display-duration timer for whatever's currently active. Deliberately
  // keyed on activeEvent?.id / activeEvent?.displayMode (stable
  // primitives), NOT on the activeEvent object itself: pickActiveEvent()
  // returns a fresh object literal on every call, so depending on the
  // object would restart this timer on every unrelated events refetch
  // (e.g. a routine SCORE_POSTED arriving via Realtime while a takeover is
  // already showing) instead of letting the display duration run to
  // completion.
  useEffect(() => {
    if (!enabled || !activeEvent) return;
    const durationMs = activeEvent.displayMode === "takeover" ? config.takeoverDurationMs : config.overlayDurationMs;
    const id = setTimeout(() => {
      shownIds.current.add(activeEvent.id);
      setBump((n) => n + 1);
    }, durationMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: activeEvent.id/displayMode are the real deps, not the activeEvent object.
  }, [enabled, activeEvent?.id, activeEvent?.displayMode, config.overlayDurationMs, config.takeoverDurationMs]);

  return activeEvent;
}
