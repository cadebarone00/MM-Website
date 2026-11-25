import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { applyLeagueChange, type League, type LeagueChange } from "@/lib/platform/leagues";
import { apiJson } from "./api.ts";
import { changeKey } from "./leaguesUi.ts";

/** How often the open league checks for everyone else's scores (website POLL_MS). */
const POLL_MS = 5000;
export type LeagueReply = { ok: boolean; message?: string; id?: string };
export type Act = (change: LeagueChange) => Promise<LeagueReply>;

const MESSAGES = {
  not_member: "You're not in this league. Join it with its code on the Leagues tab.",
  not_installed: "Leagues aren't set up in the database yet.",
};

/** POST one thing to /api/leagues/<id> (a change, "copy", "visibility"). */
export async function postLeague(id: string, body: object): Promise<LeagueReply & Record<string, unknown>> {
  const r = await apiJson<Record<string, unknown>>(`/api/leagues/${encodeURIComponent(id)}`, { method: "POST", body });
  return r.ok ? { ...r.body, ok: true } : { ok: false, message: r.error };
}

/**
 * One league for its screen (website LeagueHome's load / act): loads it, checks again every 5 seconds while the screen
 * is open and the app is in front, and sends changes one after another. A change shows at once; changes still sending
 * are laid on top of every refresh so a refresh never undoes them.
 */
export function useLeague(id: string) {
  const [league, setLeague] = useState<League | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const pending = useRef(new Map<string, LeagueChange>());
  const sending = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(async () => {
    const r = await apiJson<{ league?: League; me?: string }>(`/api/leagues/${encodeURIComponent(id)}`, { messages: MESSAGES });
    if (r.ok && r.body.league && r.body.me) {
      setLeague([...pending.current.values()].reduce(applyLeagueChange, r.body.league));
      setMeId(r.body.me);
      setProblem(null);
      return;
    }
    setProblem(r.ok ? "Couldn't load the league. Trying again…" : r.error);
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { if (AppState.currentState === "active") void load(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]));

  const act: Act = useCallback((change) => {
    setLeague((current) => current && applyLeagueChange(current, change));
    const key = changeKey(change);
    pending.current.set(key, change);
    const result = (sending.current = sending.current.then(() => postLeague(id, change))) as Promise<LeagueReply>;
    return result.then((reply) => {
      if (pending.current.get(key) === change) pending.current.delete(key);
      setProblem(reply.ok ? null : reply.message ?? "A change didn't save. Try again.");
      void load();
      return reply;
    });
  }, [id, load]);

  return { league, meId, problem, setProblem, load, act };
}
