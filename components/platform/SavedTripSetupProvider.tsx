"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { setupDecode, setupEncode, type SetupValues, type TripSetupSnapshot } from "@/lib/platform/savedTripSetup";

type Context = { values: SetupValues; write: (field: string, value: unknown) => void; available: boolean; readOnly: boolean };
const SavedSetupContext = createContext<Context | null>(null);
export const useSavedTripSetup = () => useContext(SavedSetupContext);

export function SavedTripSetupProvider({ tripId, snapshot, editable, children }: { tripId: string; snapshot: TripSetupSnapshot; editable: boolean; children: ReactNode }) {
  const [values, setValues] = useState<SetupValues>(() => JSON.parse(JSON.stringify(snapshot.values), setupDecode));
  const [status, setStatus] = useState("");
  const current = useRef(values), revision = useRef(snapshot.revision);
  const queue = useRef(Promise.resolve());
  const blocked = useRef(false);
  const pending = useRef(0);
  const scheduled = useRef(false);
  const write = useCallback((field: string, value: unknown) => {
    if (!editable || !snapshot.available || blocked.current) { setStatus("Settings were not saved. Reload and try again."); return; }
    const next = { ...current.current, [field]: value };
    current.current = next;
    setValues(next);
    if (scheduled.current) return;
    scheduled.current = true;
    pending.current++;
    setStatus("Saving…");
    const writeId = crypto.randomUUID();
    queueMicrotask(() => {
    scheduled.current = false;
    queue.current = queue.current.then(async () => {
      if (blocked.current) return;
      try {
        const body = JSON.stringify({ values: current.current, revision: revision.current, writeId }, setupEncode);
        const response = await fetch(`/api/golf-trips/${tripId}/setup`, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60000 });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Couldn't save settings.");
        revision.current = result.revision;
        pending.current--;
        if (!pending.current) setStatus("Saved");
      } catch (error) { blocked.current = true; setStatus(error instanceof Error ? error.message : "Couldn't save settings."); }
    });
    });
  }, [editable, snapshot.available, tripId]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (pending.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  return <SavedSetupContext.Provider value={{ values, write, available: snapshot.available, readOnly: !editable || blocked.current }}>
    {editable && status && <div role={blocked.current ? "alert" : "status"} style={{ padding: "8px 16px", background: "#240001", color: "#dcc495" }}>{status}{blocked.current && <button type="button" onClick={() => location.reload()}>Reload settings</button>}</div>}
    {children}
  </SavedSetupContext.Provider>;
}
