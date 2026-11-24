import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HoleInput } from "@/lib/platform/roundGames";
import type { HolePenalties, ShotResult } from "@/lib/platform/playerRounds";
import { guestStrokes, playerStrokes } from "@/lib/platform/sharedRoundCards";
import type { SharedRound } from "@/lib/platform/sharedRoundTypes";
import { finishHoleSends } from "@/lib/platform/roundScoring";
import { picksByHole } from "@/lib/platform/roundBoard";
import { apiJson } from "./api.ts";

/** The scorekeeper's own stats, kept on this phone until Submit & Save (website: the scoring sheet's card). */
export type MyStats = { putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[]; penalties: (HolePenalties | null)[] };
const empty = <T,>() => Array.from({ length: 18 }, () => null as T | null);
export const emptyStats = (): MyStats => ({ putts: empty<number>(), fairways: empty<ShotResult>(), greens: empty<ShotResult>(), penalties: empty<HolePenalties>() });
const statsKey = (roundId: string) => `maroonRoundStats:${roundId}`;

export async function readMyStats(roundId: string): Promise<MyStats> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(statsKey(roundId))) ?? "null") as MyStats | null;
    return saved && Array.isArray(saved.putts) ? { ...emptyStats(), ...saved } : emptyStats();
  } catch { return emptyStats(); }
}
export const saveMyStats = (roundId: string, stats: MyStats | null) =>
  (stats ? AsyncStorage.setItem(statsKey(roundId), JSON.stringify(stats)) : AsyncStorage.removeItem(statsKey(roundId))).catch(() => {});

/**
 * Keeping score in a round with friends (website SharedPlayStep's send / pending): each change shows straight away,
 * is sent to the round, and stays on screen until a refresh has it (or comes back off if the server says no).
 * Keys: "p:<profile>:<hole>", "g:<guest>:<hole>", "pick:<hole>" (hole = index 0–17).
 */
export function useRoundScoring(id: string, round: SharedRound | null, me: string | null) {
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [problem, setProblem] = useState<string | null>(null);

  // A refresh that has a pending change confirms it.
  useEffect(() => {
    if (!round) return;
    setPending((all) => {
      let changed = false;
      const next = { ...all };
      for (const [key, value] of Object.entries(all)) {
        const [kind, who, hole] = key.split(":");
        const server = kind === "p" ? playerStrokes(round, who)[Number(hole)]
          : kind === "g" ? guestStrokes(round, who)[Number(hole)]
          : JSON.stringify(picksByHole(round.picks)[Number(who)]);
        if (server === (kind === "pick" ? JSON.stringify(value) : value)) { delete next[key]; changed = true; }
      }
      return changed ? next : all;
    });
  }, [round]);

  const send = useCallback(async (key: string, value: unknown, body: object) => {
    setPending((all) => ({ ...all, [key]: value }));
    const reply = await apiJson(`/api/rounds/shared/${encodeURIComponent(id)}`, { method: "POST", body });
    if (!reply.ok) {
      setPending((all) => { const next = { ...all }; delete next[key]; return next; });
      setProblem(reply.code === null ? "A change didn't send. Try again when you're back online." : reply.error || "That didn't work. Try again.");
    } else setProblem(null);
  }, [id]);

  const strokesOf = useCallback((profileId: string) => {
    const row = round ? playerStrokes(round, profileId) : empty<number>();
    for (const [key, value] of Object.entries(pending)) { const [kind, who, hole] = key.split(":"); if (kind === "p" && who === profileId) row[Number(hole)] = value as number | null; }
    return row;
  }, [round, pending]);
  const guestRow = useCallback((guestId: string) => {
    const row = round ? guestStrokes(round, guestId) : empty<number>();
    for (const [key, value] of Object.entries(pending)) { const [kind, who, hole] = key.split(":"); if (kind === "g" && who === guestId) row[Number(hole)] = value as number | null; }
    return row;
  }, [round, pending]);
  const inputs = useMemo<HoleInput[]>(() => {
    const base = round ? picksByHole(round.picks) : Array.from({ length: 18 }, () => ({}));
    return base.map((pick, h) => (pending[`pick:${h}`] as HoleInput | undefined) ?? pick);
  }, [round, pending]);

  const isGuest = useCallback((key: string) => (round?.setup.guests ?? []).some((g) => g.id === key), [round]);
  /** Enter a score for anyone in the round (scorekeeper). */
  const setStrokes = useCallback((key: string, hole: number, strokes: number | null) => {
    if (isGuest(key)) void send(`g:${key}:${hole}`, strokes, { action: "guestStrokes", guest: key, hole: hole + 1, strokes });
    else void send(`p:${key}:${hole}`, strokes, { action: "strokes", player: key, hole: hole + 1, strokes });
  }, [isGuest, send]);
  /** A hole's game taps (Wolf partner, Double bet, side-game winners…). */
  const setPick = useCallback((hole: number, pick: HoleInput) => void send(`pick:${hole}`, pick, { action: "pick", hole: hole + 1, pick }), [send]);

  /** Next hole: everyone's score for this hole goes to the round (shared rule: finishHoleSends). */
  const finishHole = useCallback((hole: number, par: number[], others: string[]) => {
    if (!me) return;
    const plan = finishHoleSends({ hole, par, myBox: strokesOf(me)[hole], myInRound: round ? playerStrokes(round, me)[hole] : null,
      others: others.map((key) => ({ key, inRound: isGuest(key) ? guestRow(key)[hole] : strokesOf(key)[hole] })) });
    if (plan.mine != null) setStrokes(me, hole, plan.mine);
    for (const o of plan.others) setStrokes(o.key, hole, o.strokes);
  }, [me, round, strokesOf, guestRow, isGuest, setStrokes]);

  return { strokesOf, guestRow, inputs, setStrokes, setPick, finishHole, problem, setProblem, sendStats: send };
}
