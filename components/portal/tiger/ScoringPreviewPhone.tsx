"use client";
import { useEffect, useRef, useState } from "react";
import { ScoringPanel, type ScoringState } from "../ScoringPanel";
import type { HoleSubmission } from "@/lib/live/holeSubmission";

export function ScoringPreviewPhone({ state, player, session }: { state: ScoringState; player: string; session: string }) {
  const [submissions, setSubmissions] = useState<HoleSubmission[]>([]);
  const pending = useRef(new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  useEffect(() => {
    const requests = pending.current;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.session !== session || event.data?.type !== "scoring-preview-state") return;
      setSubmissions(event.data.submissions);
      const waiting = requests.get(event.data.requestId);
      if (waiting) {
        clearTimeout(waiting.timer); requests.delete(event.data.requestId);
        if (event.data.error) waiting.reject(new Error(event.data.error)); else waiting.resolve();
      }
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "scoring-preview-ready", session }, window.location.origin);
    return () => { window.removeEventListener("message", receive); requests.forEach((request) => { clearTimeout(request.timer); request.reject(new Error("Preview closed.")); }); requests.clear(); };
  }, [session]);
  const submit = (submission: HoleSubmission) => new Promise<void>((resolve, reject) => {
    const requestId = player + ":" + crypto.randomUUID();
    const timer = setTimeout(() => { pending.current.delete(requestId); reject(new Error("Preview connection timed out. Reload the editor.")); }, 10000);
    pending.current.set(requestId, { resolve, reject, timer });
    window.parent.postMessage({ type: "scoring-preview-submit", session, submission, requestId }, window.location.origin);
  });
  return <ScoringPanel playerSlug={player} playerFullName={player} round={1} matchBox={state.matchBox} nameBySlug={{}} previewState={state} previewSubmissions={submissions} onPreviewSubmit={submit} />;
}
