"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeamDraftResponse } from "./teamDraftPicks";

/** Backup refresh while the room is open (also how it stays current where Realtime isn't configured). */
const POLL_MS = 10_000;
const REALTIME = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Where the draft comes from: the real route by default; the simulator's Mock draft passes a pretend server. */
export type TeamDraftTransport = {
  load: () => Promise<{ ok: boolean; body: unknown }>;
  send: (payload: Record<string, unknown>) => Promise<{ ok: boolean; body: unknown }>;
  /** Tells the room about changes (instead of Supabase Realtime). */
  subscribe?: (change: () => void) => () => void;
};
const routeTransport = (tripId: string): TeamDraftTransport => ({
  load: async () => { const response = await fetch(`/api/golf-trips/${tripId}/team-draft`, { cache: "no-store" }); return { ok: response.ok, body: await response.json() }; },
  send: async payload => { const response = await fetch(`/api/golf-trips/${tripId}/team-draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); return { ok: response.ok, body: await response.json() }; },
});

export type LiveTeamDraft = {
  data: TeamDraftResponse | null;
  /** Why it couldn't load or save (shown in the room), or "". */
  message: string;
  busy: boolean;
  start: () => Promise<void>;
  pick: (profileId: string) => Promise<void>;
};

/**
 * A saved trip's Team Draft, live (project_specs.md "Team Draft: picks are saved and final"). Loads it through
 * /api/golf-trips/[tripId]/team-draft, reloads when Supabase Realtime says a pick landed (or the draft started / finished),
 * on returning to the tab, and every 10 seconds as a backup. `tripId` null = not a saved trip (nothing loads).
 */
export function useTeamDraft(tripId: string | null, open: boolean, transport?: TeamDraftTransport): LiveTeamDraft {
  const [data, setData] = useState<TeamDraftResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    if (!tripId) return;
    const ask = ++latest.current;
    try {
      const { ok, body } = await (transport ?? routeTransport(tripId)).load() as { ok: boolean; body: { error?: string } };
      if (ask !== latest.current) return; // a newer answer is on its way
      if (!ok) { setMessage(body.error || "Couldn't load the draft."); return; }
      setData(body as TeamDraftResponse);
      setMessage("");
    } catch { if (ask === latest.current) setMessage("No connection. The draft will update when you're back online."); }
  }, [tripId, transport]);

  useEffect(() => {
    if (!tripId || !open) return;
    let timer = 0;
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 200); };
    soon();
    const unsubscribe = transport?.subscribe?.(soon);
    const supabase = REALTIME && !transport ? createSupabaseBrowserClient() : null;
    const channel = supabase?.channel(`trip-team-draft-${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "golf_trip_team_draft_picks", filter: `golf_trip_id=eq.${tripId}` }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "golf_trip_team_draft", filter: `golf_trip_id=eq.${tripId}` }, soon)
      .subscribe();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const visible = () => { if (document.visibilityState === "visible") soon(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", soon);
    return () => {
      window.clearTimeout(timer); window.clearInterval(poll);
      document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", soon);
      if (channel) void supabase?.removeChannel(channel);
      unsubscribe?.();
    };
  }, [tripId, open, refresh, transport]);

  const send = useCallback(async (payload: Record<string, unknown>) => {
    if (!tripId) return;
    setBusy(true);
    try {
      const { ok, body } = await (transport ?? routeTransport(tripId)).send(payload) as { ok: boolean; body: TeamDraftResponse & { error?: string } };
      latest.current++; // this answer is newer than any reload still in flight
      if (ok) { setData(body); setMessage(""); }
      else { setMessage(body.error || "Couldn't save the pick."); void refresh(); }
    } catch { setMessage("No connection. That pick wasn't saved — try again."); }
    finally { setBusy(false); }
  }, [tripId, refresh, transport]);

  return {
    data, message, busy,
    start: () => send({ action: "start" }),
    pick: (profileId: string) => send({ action: "pick", player: profileId, pickNumber: (data?.draft.picks.length ?? 0) + 1 }),
  };
}
