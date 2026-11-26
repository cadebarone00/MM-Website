import { useCallback, useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { apiRaw } from "./api.ts";

/**
 * Trip Settings in the app (project_specs.md Golf Trips part 2g): the trip's saved settings, and `write(field, value)` for
 * the organizer. Each write reads the latest settings from /api/golf-trips/<trip>/setup, changes that one field and saves
 * it back with the revision it read (one write at a time), so a change made on another device is never overwritten — a
 * refusal says so and shows the latest. Values travel in the website's saved format (Sets as { $set: [...] }).
 */
export function useTripSetup(tripId: string, initial: Record<string, unknown>) {
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const queue = useRef(Promise.resolve());
  const path = `/api/golf-trips/${encodeURIComponent(tripId)}/setup`;
  // Opening Settings reads the latest saved settings (in their saved format) straight away.
  useEffect(() => {
    let live = true;
    void apiRaw<{ values?: Record<string, unknown> }>(path).then((r) => { if (live && r.status === 200 && r.body?.values) setValues(r.body.values); });
    return () => { live = false; };
  }, [path]);

  const write = useCallback((field: string, value: unknown) => {
    setValues((v) => ({ ...v, [field]: value }));
    queue.current = queue.current.then(async () => {
      setStatus({ text: "Saving…", failed: false });
      const latest = await apiRaw<{ values?: Record<string, unknown>; revision?: number; error?: string }>(path);
      if (latest.status !== 200 || !latest.body?.values || !Number.isInteger(latest.body.revision)) {
        setStatus({ text: latest.status === 0 ? "You're offline. That setting wasn't saved." : latest.body?.error ?? "Couldn't load the trip's settings.", failed: true }); return;
      }
      const reply = await apiRaw<{ ok?: boolean; error?: string }>(path, { method: "PUT", body: { values: { ...latest.body.values, [field]: value }, revision: latest.body.revision, writeId: Crypto.randomUUID() } });
      if (reply.status === 200 && reply.body?.ok) { setValues({ ...latest.body.values, [field]: value }); setStatus({ text: "Saved", failed: false }); return; }
      setValues(latest.body.values);
      setStatus({ text: reply.status === 409 ? "Settings changed on another device. Showing the latest — try again." : reply.status === 403 ? "Only the organizer can change trip settings." : reply.body?.error ?? "Couldn't save that setting.", failed: true });
    });
  }, [path]);

  return { values, write, status };
}
