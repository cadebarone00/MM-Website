import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { MomentumEvent } from "@/lib/platform/tripPush";
import type { JoinLink } from "@/lib/platform/golfTripJoinLinks";
import { apiGet, apiRaw } from "./api.ts";
import { inviteLinkState, tripPageState, type InviteLinkState, type TripPageData, type TripPageState } from "./tripPageRules.ts";

export type { InviteLinkState, TripPageState };

/** The trip page: loads now, again on pull-to-refresh and whenever the app comes back to the front. */
export function useTripPage(tripId: string) {
  const [state, setState] = useState<TripPageState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (pulled = false) => {
    if (pulled) setRefreshing(true);
    const next = tripPageState(await apiGet<TripPageData>(`/api/app/golf-trips/${encodeURIComponent(tripId)}`));
    // A failed background reload keeps the trip on screen; only the first load shows the problem.
    setState((current) => current.kind === "live" && next.kind === "error" && !pulled ? current : next);
    setRefreshing(false);
  }, [tripId]);
  useEffect(() => {
    void load();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void load(); });
    return () => sub.remove();
  }, [load]);
  return { state, refreshing, reload: load };
}

/** Momentum highlights for the Big Board, refreshed every 10 seconds and when the app comes back (website: useTripMomentum). */
export function useTripMomentum(tripId: string | null): MomentumEvent[] {
  const [events, setEvents] = useState<MomentumEvent[]>([]);
  useEffect(() => {
    if (!tripId) return;
    let stopped = false, pending = false;
    const refresh = async () => {
      if (pending || AppState.currentState !== "active") return;
      pending = true;
      const { status, body } = await apiRaw<{ events?: MomentumEvent[] }>(`/api/golf-trips/${encodeURIComponent(tripId)}/momentum`);
      pending = false;
      if (stopped) return;
      if (status >= 200 && status < 300 && Array.isArray(body?.events)) setEvents(body.events);
      else if (status === 401 || status === 404) setEvents([]);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void refresh(); });
    return () => { stopped = true; clearInterval(timer); sub.remove(); };
  }, [tripId]);
  return events;
}

export function useInviteLink(tripId: string | null) {
  const [state, setState] = useState<InviteLinkState>({ status: "loading" });
  const latest = useRef(state);
  latest.current = state;
  const fetchLink = useCallback(async (): Promise<InviteLinkState> => {
    if (!tripId) return { status: "loading" };
    const { status, body } = await apiRaw<Partial<JoinLink> & { error?: string }>(`/api/golf-trips/${encodeURIComponent(tripId)}/join-link`);
    const next = inviteLinkState(status, body);
    setState(next);
    return next;
  }, [tripId]);
  useEffect(() => { void fetchLink(); }, [fetchLink]);
  /** A fresh link right before copying (links last 30 minutes); falls back to the one on screen. */
  const fresh = useCallback(async () => {
    const next = await fetchLink();
    return next.status === "ok" ? next.link : latest.current.status === "ok" ? latest.current.link : null;
  }, [fetchLink]);
  return { state, fresh };
}
