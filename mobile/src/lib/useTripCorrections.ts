import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { correctionsFromJson, type TripCorrections } from "@/lib/platform/tripCorrections";
import { apiRaw } from "./api.ts";

/**
 * Scorecard corrections for today's round in the app (project_specs.md Golf Trips part 2d slice 4, website Step 6):
 * requests and submission history from /api/golf-trips/<trip>/scoring/corrections, refreshed every 15s and on return to
 * the app. `act` asks for a correction or decides one; the server decides every rule and is told which account the
 * phone thinks is signed in, so a phone that switched accounts is refused. null = corrections aren't installed.
 */
export function useTripCorrections(tripId: string, profileId: string, round: number, initial: TripCorrections | null | undefined) {
  const [corrections, setCorrections] = useState<TripCorrections | null>(initial ?? null);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const reply = await apiRaw<{ ok?: boolean; corrections?: unknown }>(`/api/golf-trips/${encodeURIComponent(tripId)}/scoring/corrections?round=${round}`);
    const parsed = reply.status === 200 && reply.body?.ok ? correctionsFromJson(reply.body.corrections) : null;
    if (mounted.current && parsed) setCorrections(parsed);
    return parsed;
  }, [tripId, round]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 15000);
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => { mounted.current = false; clearInterval(timer); listener.remove(); };
  }, [refresh]);
  const act = useCallback(async (body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> => {
    const reply = await apiRaw<{ ok?: boolean; error?: string; status?: string }>(`/api/golf-trips/${encodeURIComponent(tripId)}/scoring/corrections`,
      { method: "POST", body: { ...body, expectedProfileId: profileId } });
    await refresh();
    if (reply.status === 0) return { ok: false, message: "You're offline. Try again when you're back online." };
    if (reply.status === 200 && reply.body?.ok) return { ok: true, message: "" };
    return { ok: false, message: reply.body?.error ?? "Couldn't save that. Try again." };
  }, [tripId, profileId, refresh]);
  return { corrections, refresh, act };
}
