import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { QueuedOp } from "@/lib/platform/scoringQueue";
import { latestGate, tripScoringFromJson, type HoleEntryInput, type TripRoundScoring } from "@/lib/platform/tripScoring";
import { tripScoringCard } from "./tripScoringCard.ts";
import { tripScoringEngine } from "./tripScoringEngine.ts";
import { tripScoringStorage } from "./tripScoringStorage.ts";
import { tripScoringTransport } from "./tripScoringTransport.ts";
import { submitTripCard } from "./tripScoringSubmit.ts";
import { apiRaw } from "./api.ts";

type Engine = ReturnType<typeof tripScoringEngine>;
/** Account-scoped queue and live data for one trip round. */
export function useTripScoring(tripId: string, profileId: string, initial: TripRoundScoring) {
  const [scoring, setScoring] = useState(initial);
  const [ops, setOps] = useState<QueuedOp[] | null>(null);
  const [connected, setConnected] = useState(false);
  const [problem, setProblem] = useState("");
  const engineRef = useRef<Engine | null>(null);
  const liveRef = useRef(initial);
  const gate = useRef(latestGate());
  const mounted = useRef(false);
  const apply = useCallback((value: TripRoundScoring, n: number) => {
    if (!mounted.current || !gate.current.accept(n)) return;
    liveRef.current = value; setScoring(value);
  }, []);
  const refresh = useCallback(async () => {
    const n = gate.current.begin();
    const reply = await apiRaw<{ ok?: boolean; scoring?: unknown }>(`/api/golf-trips/${encodeURIComponent(tripId)}/scoring?round=${initial.roundNumber}`);
    if (!mounted.current) return null;
    const value = reply.status === 200 && reply.body?.ok ? tripScoringFromJson(reply.body.scoring) : null;
    if (!value || value.roundNumber !== initial.roundNumber) { setConnected(false); return null; }
    apply(value, n); setConnected(true); return value;
  }, [tripId, initial.roundNumber, apply]);
  useEffect(() => {
    mounted.current = true;
    const send = tripScoringTransport(tripId, profileId, apiRaw);
    const engine = tripScoringEngine({ scope: { tripId, profileId, roundNumber: initial.roundNumber }, storage: tripScoringStorage(AsyncStorage), newId: Crypto.randomUUID, now: () => new Date().toISOString(), send,
      onChange: () => { if (mounted.current) setOps([...engine.ops()]); },
    });
    engineRef.current = engine;
    const sync = async () => { try { await engine.sync(); if (mounted.current) await refresh(); } catch { if (mounted.current) setProblem("Couldn't save scores on this phone. Try again."); } };
    void engine.load().then(sync).catch(() => { if (mounted.current) setProblem("Couldn't load scores saved on this phone."); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void sync(); }, 10000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") void sync(); else if (mounted.current) setConnected(false); });
    return () => { mounted.current = false; engineRef.current = null; clearInterval(timer); listener.remove(); };
  }, [tripId, profileId, initial.roundNumber, apply, refresh]);
  const edit = useCallback(async (kind: "own" | "attest", entry: HoleEntryInput, correctionRequestId?: string) => {
    const engine = engineRef.current, current = liveRef.current;
    const view = engine && tripScoringCard(current, profileId, engine.ops());
    const scoredProfileId = kind === "own" ? profileId : view?.seat.attesteeId;
    if (!engine || !view || !scoredProfileId) return;
    const version = current.entries.find(e => e.scoredProfileId === scoredProfileId && e.enteredByProfileId === profileId && e.hole === entry.hole)?.version ?? 0;
    setConnected(false);
    try {
      await engine.edit({ tripId, profileId, roundNumber: current.roundNumber, groupId: view.seat.groupId, scoredProfileId, kind, entry, ...(correctionRequestId ? { correctionRequestId } : {}) }, version);
      await engine.sync(); await refresh();
    } catch { if (mounted.current) setProblem("Couldn't save scores on this phone. Try again."); }
  }, [tripId, profileId, refresh]);
  const resolve = useCallback(async (key: string, choice: "mine" | "saved") => {
    const engine = engineRef.current; if (!engine) return;
    try { await engine.resolve(key, choice); await engine.sync(); await refresh(); }
    catch { if (mounted.current) setProblem("Couldn't save that choice. Try again."); }
  }, [refresh]);
  const submit = useCallback(async (correctionHoles: number[] = []) => {
    const engine = engineRef.current;
    if (!engine || problem) return { ok: false, message: "Scores are still loading or couldn't be saved on this phone." };
    const result = await submitTripCard({ engine, tripId, profileId, refresh, request: apiRaw, correctionHoles });
    if (result.ok) await refresh();
    return result;
  }, [tripId, profileId, problem, refresh]);
  return { scoring, ops, view: ops ? tripScoringCard(scoring, profileId, ops) : null, connected, problem, edit, resolve, refresh, submit };
}
