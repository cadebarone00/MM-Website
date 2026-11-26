import { useCallback, useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import type { SavedTravelSnapshot } from "@/lib/platform/savedTripTravel";
import { addMyItem, inviteToItem, removeMyItem, respondToInvite, updateMyItem, type TravelItem, type TripTravel } from "@/lib/platform/tripTravel";
import { apiRaw } from "./api.ts";

export type PlanChange =
  | { type: "add"; item: Omit<TravelItem, "createdBy" | "source" | "optOutAllowed"> }
  | { type: "update"; id: string; changes: Pick<TravelItem, "details" | "startsAt" | "endsAt" | "joinPolicy"> }
  | { type: "remove"; id: string }
  | { type: "invite"; id: string; memberIds: string[] }
  | { type: "respond"; id: string; answer: "accept" | "decline" };

/**
 * My plans on a trip in the app (website SavedGolfTripHome savePlans, project_specs.md Golf Trips part 2f): every change goes
 * through the shared tripTravel rules, shows at once, and is saved to /api/golf-trips/<trip>/plans one at a time with the
 * revision it started from. If another device saved in between (409) or the save fails, saving stops and says so (the
 * page reloads to the saved plans), so an older copy never overwrites a newer one. Not installed = read only.
 */
const EMPTY: SavedTravelSnapshot = { travel: { meId: "", members: [], items: [], participants: [] }, revision: 0, available: false };

export function useTripPlans(tripId: string, loaded: SavedTravelSnapshot | null) {
  const snapshot = loaded ?? EMPTY;
  const [travel, setTravel] = useState<TripTravel>(snapshot.travel);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const revision = useRef(snapshot.revision);
  const queue = useRef(Promise.resolve());
  const failed = useRef(false);
  const latest = useRef(snapshot.travel);
  const saving = useRef(0);
  // A fresh load of the trip (pull to refresh, closing a room): take the saved plans, unless a save is still on its way.
  useEffect(() => {
    if (!loaded || saving.current) return;
    latest.current = loaded.travel; revision.current = loaded.revision; failed.current = false;
    setTravel(loaded.travel); setStatus(null);
  }, [loaded]);

  const change = useCallback((next: PlanChange) => {
    if (!snapshot.available) { setStatus({ text: "Saving plans isn't switched on yet.", failed: true }); return; }
    if (failed.current) return;
    const current = latest.current;
    const updated = next.type === "add" ? addMyItem(current, next.item)
      : next.type === "update" ? updateMyItem(current, next.id, next.changes)
      : next.type === "invite" ? inviteToItem(current, next.id, next.memberIds)
      : next.type === "respond" ? respondToInvite(current, next.id, next.answer)
      : removeMyItem(current, next.id);
    latest.current = updated;
    setTravel(updated);
    const writeId = Crypto.randomUUID();
    saving.current++;
    queue.current = queue.current.then(async () => {
      try { await send(); } finally { saving.current--; }
    });
    const send = async () => {
      if (failed.current) return;
      setStatus({ text: "Saving plan…", failed: false });
      const reply = await apiRaw<{ ok?: boolean; revision?: number; error?: string }>(`/api/golf-trips/${encodeURIComponent(tripId)}/plans`,
        { method: "PUT", body: { travel: latest.current, revision: revision.current, writeId } });
      if (reply.status === 200 && reply.body?.ok && Number.isInteger(reply.body.revision)) {
        revision.current = reply.body.revision!;
        setStatus({ text: "Plan saved", failed: false });
        return;
      }
      failed.current = true;
      setStatus({ text: reply.status === 0 ? "You're offline. That plan wasn't saved — pull down to reload." : reply.body?.error ?? "Couldn't save that plan. Pull down to reload.", failed: true });
    };
  }, [tripId, snapshot.available]);

  return { travel, change, status, available: snapshot.available };
}
