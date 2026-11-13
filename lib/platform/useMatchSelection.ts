"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MatchSelectionResponse } from "./matchSelection";

const POLL_MS = 10_000;
const REALTIME = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Where a round's selection comes from: the real route, or (simulator / dev trips) a pretend server in the browser. */
export type MatchSelectionTransport = {
  load: (round: string) => Promise<{ ok: boolean; body: unknown }>;
  send: (round: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; body: unknown }>;
  /** Changes made elsewhere (instead of Supabase Realtime). */
  subscribe?: (change: () => void) => () => void;
  /** The saved trip, for Realtime ("a round changed" only — never the picks). */
  realtimeTripId?: string;
};
export function routeMatchSelectionTransport(tripId: string): MatchSelectionTransport {
  const url = `/api/golf-trips/${tripId}/match-selection`;
  return {
    realtimeTripId: tripId,
    load: async round => { const response = await fetch(`${url}?round=${encodeURIComponent(round)}`, { cache: "no-store" }); return { ok: response.ok, body: await response.json() }; },
    send: async (round, payload) => { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, round }) }); return { ok: response.ok, body: await response.json() }; },
  };
}

export type LiveMatchSelection = {
  data: MatchSelectionResponse | null;
  message: string;
  busy: boolean;
  /** Milliseconds to add to this device's clock to match the server's (for the countdown). */
  clockOffset: number;
  act: (payload: Record<string, unknown>) => Promise<boolean>;
};

/**
 * One round's Match Selection, live: loads it, reloads when Realtime / the pretend server says it changed, when a timer
 * runs out (so the server can finish the turn), on returning to the tab and every 10 seconds. `round` null = closed.
 */
export function useMatchSelection(transport: MatchSelectionTransport | null, round: string | null): LiveMatchSelection {
  const [data, setData] = useState<MatchSelectionResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const latest = useRef(0);

  const accept = useCallback((body: MatchSelectionResponse) => { setData(body); setClockOffset(Date.parse(body.now) - Date.now()); }, []);
  const refresh = useCallback(async () => {
    if (!transport || !round) return;
    const ask = ++latest.current;
    try {
      const { ok, body } = await transport.load(round) as { ok: boolean; body: MatchSelectionResponse & { error?: string } };
      if (ask !== latest.current) return;
      if (!ok) { setData(null); setMessage(body.error || "Couldn't load match selection."); return; }
      accept(body); setMessage("");
    } catch { if (ask === latest.current) setMessage("No connection. Match selection will update when you're back online."); }
  }, [transport, round, accept]);

  useEffect(() => {
    if (!transport || !round) return;
    let timer = 0;
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 200); };
    soon();
    const unsubscribe = transport.subscribe?.(soon);
    const supabase = REALTIME && transport.realtimeTripId ? createSupabaseBrowserClient() : null;
    const channel = supabase?.channel(`trip-match-selection-${transport.realtimeTripId}-${round}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "golf_trip_match_selection_versions", filter: `golf_trip_id=eq.${transport.realtimeTripId}` }, soon)
      .subscribe();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const visible = () => { if (document.visibilityState === "visible") soon(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(timer); window.clearInterval(poll); document.removeEventListener("visibilitychange", visible);
      if (channel) void supabase?.removeChannel(channel);
      unsubscribe?.();
    };
  }, [transport, round, refresh]);

  // When the turn / ranking window runs out, ask again so the server finishes it.
  const deadline = data?.deadline ? Date.parse(data.deadline) : null;
  useEffect(() => {
    if (!deadline) return;
    const wait = Math.max(0, deadline - (Date.now() + clockOffset)) + 600;
    if (wait > 2 ** 31 - 1) return;
    const timer = window.setTimeout(() => void refresh(), wait);
    return () => window.clearTimeout(timer);
  }, [deadline, clockOffset, refresh]);

  const act = useCallback(async (payload: Record<string, unknown>) => {
    if (!transport || !round) return false;
    setBusy(true);
    try {
      const { ok, body } = await transport.send(round, payload) as { ok: boolean; body: MatchSelectionResponse & { error?: string } };
      latest.current++;
      if (ok) { accept(body); setMessage(""); return true; }
      setMessage(body.error || "Couldn't save that."); void refresh(); return false;
    } catch { setMessage("No connection. That wasn't saved — try again."); return false; }
    finally { setBusy(false); }
  }, [transport, round, refresh, accept]);

  return { data, message, busy, clockOffset, act };
}
