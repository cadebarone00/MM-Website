import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import type { SharedRound } from "@/lib/platform/sharedRoundTypes";
import { apiJson } from "./api.ts";

/** How often every phone in a round checks for the others' scores (website POLL_MS). */
export const POLL_MS = 4000;

export type LiveRound =
  | { status: "loading" }
  | { status: "ready"; round: SharedRound; me: string; inviteCode: string | null; problem: string | null }
  | { status: "gone" }
  | { status: "error"; message: string };

/**
 * A round with friends, refreshed every few seconds while the screen is open and the app is in front (website
 * SharedPlayStep's poll). A failed refresh keeps the last good round on screen with a note; a round the server no longer
 * lets you see (deleted, or you were removed) is "gone".
 */
export function useLiveRound(id: string) {
  const [state, setState] = useState<LiveRound>({ status: "loading" });
  const last = useRef<LiveRound>(state);
  last.current = state;

  const load = useCallback(async () => {
    const reply = await apiJson<{ round?: SharedRound; me?: string; inviteCode?: string | null }>(`/api/rounds/shared/${encodeURIComponent(id)}`);
    if (reply.ok && reply.body.round && reply.body.me) {
      setState({ status: "ready", round: reply.body.round, me: reply.body.me, inviteCode: reply.body.inviteCode ?? null, problem: null });
      return;
    }
    if (!reply.ok && reply.code === "not_in_round") { setState({ status: "gone" }); return; }
    const message = !reply.ok && reply.code === null ? "No connection. The round updates again when you're back." : "Can't reach the round right now. Scores already sent are safe.";
    const before = last.current;
    setState(before.status === "ready" ? { ...before, problem: message } : { status: "error", message });
  }, [id]);

  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => { if (!timer) { void load(); timer = setInterval(() => void load(), POLL_MS); } };
    const stopPolling = () => { if (timer) { clearInterval(timer); timer = null; } };
    startPolling();
    const sub = AppState.addEventListener("change", (next) => next === "active" ? startPolling() : stopPolling());
    return () => { stopPolling(); sub.remove(); };
  }, [load]));

  useEffect(() => { setState({ status: "loading" }); }, [id]);
  return { state, reload: load };
}
