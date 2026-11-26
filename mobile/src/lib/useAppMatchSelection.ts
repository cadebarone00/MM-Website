import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { MatchSelectionResponse } from "@/lib/platform/matchSelection";
import { apiRaw } from "./api.ts";

/**
 * One round's Match Selection in the app (website useMatchSelection, project_specs.md Golf Trips part 2e): loads
 * /api/golf-trips/<trip>/match-selection?round=<key>, refreshes every 10s, when the app comes back and when a turn's timer
 * runs out (so the server finishes the turn), and sends start / place / remove / submit / lock / randomize / reset /
 * confirm. The server decides everything.
 */
export function useAppMatchSelection(tripId: string, round: string | null) {
  const [data, setData] = useState<MatchSelectionResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const latest = useRef(0);
  const path = `/api/golf-trips/${encodeURIComponent(tripId)}/match-selection`;
  const accept = useCallback((body: MatchSelectionResponse) => { setData(body); setClockOffset(Date.parse(body.now) - Date.now()); }, []);

  const refresh = useCallback(async () => {
    if (!round) return;
    const ask = ++latest.current;
    const reply = await apiRaw<MatchSelectionResponse & { error?: string }>(`${path}?round=${encodeURIComponent(round)}`);
    if (ask !== latest.current) return;
    if (reply.status === 0) { setMessage("No connection. Match selection will update when you're back online."); return; }
    if (reply.status !== 200 || !reply.body) { setData(null); setMessage(reply.body?.error || "Couldn't load match selection."); return; }
    accept(reply.body); setMessage("");
  }, [path, round, accept]);

  useEffect(() => {
    if (!round) return;
    setData(null);
    void refresh();
    const poll = setInterval(() => void refresh(), 10_000);
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => { clearInterval(poll); sub.remove(); };
  }, [round, refresh]);

  const deadline = data?.deadline ? Date.parse(data.deadline) : null;
  useEffect(() => {
    if (!deadline) return;
    const wait = Math.max(0, deadline - (Date.now() + clockOffset)) + 600;
    if (wait > 2 ** 31 - 1) return;
    const timer = setTimeout(() => void refresh(), wait);
    return () => clearTimeout(timer);
  }, [deadline, clockOffset, refresh]);

  const act = useCallback(async (payload: Record<string, unknown>) => {
    if (!round) return false;
    setBusy(true);
    const reply = await apiRaw<MatchSelectionResponse & { error?: string }>(path, { method: "POST", body: { ...payload, round } });
    latest.current++;
    setBusy(false);
    if (reply.status === 200 && reply.body) { accept(reply.body); setMessage(""); return true; }
    setMessage(reply.status === 0 ? "No connection. That wasn't saved — try again." : reply.body?.error || "Couldn't save that.");
    void refresh();
    return false;
  }, [path, round, refresh, accept]);

  return { data, message, busy, clockOffset, act };
}
