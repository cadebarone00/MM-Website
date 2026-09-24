"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePersistentState } from "@/lib/usePersistentState";
import type { HoleDraft, HoleSubmission } from "./holeSubmission";

export type QueuedHole = HoleDraft & { round: number; hole: number; matchBoxId: string; requestId: string; expectedSubmission: string | null };
export function useHoleQueue(key: string | null, onSaved: (entry: QueuedHole, submissions: HoleSubmission[]) => void) {
  const [queue, setQueue, storage] = usePersistentState<QueuedHole[]>(key, []);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const running = useRef(false);
  const callback = useRef(onSaved);
  useEffect(() => { callback.current = onSaved; }, [onSaved]);
  const send = useCallback(async (entry: QueuedHole) => {
    if (running.current) return false;
    running.current = true; setSending(true);
    try {
      const response = await fetch("/api/portal/scoring/hole", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry), signal: AbortSignal.timeout(12000) });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (response.status >= 400 && response.status < 500) {
          setQueue((current) => current.filter((item) => item.requestId !== entry.requestId));
          setMessage(result.error ?? "Review this hole and submit again.");
        } else setMessage("Saved on this device. Waiting for a connection to submit.");
        return false;
      }
      setQueue((current) => current.filter((item) => item.requestId !== entry.requestId));
      setMessage(null); callback.current(entry, result.submissions);
      return true;
    } catch {
      setMessage("Saved on this device. Waiting for a connection to submit.");
      return false;
    } finally { running.current = false; setSending(false); }
  }, [setQueue]);
  useEffect(() => {
    if (!key || !storage.ready || !queue.length) return;
    const retry = () => { if (navigator.onLine) void send(queue[0]); };
    // Retry after hydration and then on reconnect or while the page remains open.
    const initial = window.setTimeout(retry, 1000);
    const timer = window.setInterval(retry, 15000);
    window.addEventListener("online", retry);
    return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener("online", retry); };
  }, [queue, key, storage.ready, send]);
  const submit = async (entry: QueuedHole) => {
    if (!storage.ready || storage.storageError) { setMessage("Device storage is unavailable. Re-enable storage before submitting."); return false; }
    setQueue((current) => [...current.filter((item) => item.hole !== entry.hole), entry]);
    return send(entry);
  };
  return { submit, pending: queue, sending, message, ready: storage.ready, storageError: storage.storageError,
    cancel: (hole: number) => { if (!running.current) setQueue((current) => current.filter((item) => item.hole !== hole)); } };
}
