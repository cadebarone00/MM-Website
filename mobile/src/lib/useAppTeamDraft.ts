import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { TeamDraftResponse } from "@/lib/platform/teamDraftPicks";
import { apiRaw } from "./api.ts";

/**
 * A saved trip's Team Draft in the app (website useTeamDraft, project_specs.md Golf Trips part 2e): loads
 * /api/golf-trips/<trip>/team-draft, refreshes every 10s and when the app comes back while the room is open, and sends
 * start / pick / reset / confirm. The server decides every pick (only the captain on the clock or the organizer).
 */
export function useAppTeamDraft(tripId: string, open: boolean) {
  const [data, setData] = useState<TeamDraftResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const path = `/api/golf-trips/${encodeURIComponent(tripId)}/team-draft`;

  const refresh = useCallback(async () => {
    const ask = ++latest.current;
    const reply = await apiRaw<TeamDraftResponse & { error?: string }>(path);
    if (ask !== latest.current) return;
    if (reply.status === 0) { setMessage("No connection. The draft will update when you're back online."); return; }
    if (reply.status !== 200 || !reply.body) { setMessage(reply.body?.error || "Couldn't load the draft."); return; }
    setData(reply.body);
    setMessage("");
  }, [path]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const poll = setInterval(() => void refresh(), 10_000);
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => { clearInterval(poll); sub.remove(); };
  }, [open, refresh]);

  const send = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true);
    const reply = await apiRaw<TeamDraftResponse & { error?: string }>(path, { method: "POST", body: payload });
    latest.current++; // newer than any reload still on its way
    setBusy(false);
    if (reply.status === 200 && reply.body) { setData(reply.body); setMessage(""); return; }
    setMessage(reply.status === 0 ? "No connection. That pick wasn't saved — try again." : reply.body?.error || "Couldn't save the pick.");
    void refresh();
  }, [path, refresh]);

  return {
    data, message, busy, refresh,
    start: () => send({ action: "start" }),
    reset: () => send({ action: "reset" }),
    confirm: () => send({ action: "confirm" }),
    pick: (profileId: string) => send({ action: "pick", player: profileId, pickNumber: (data?.draft.picks.length ?? 0) + 1 }),
  };
}
