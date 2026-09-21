"use client";
import { useEffect, useRef, useState } from "react";
import { ScoringPanel, type ScoringState } from "../ScoringPanel";
import type { HoleSubmission } from "@/lib/live/holeSubmission";

type Pending = { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** One phone in Tiger's Live Scoring Page Editor. It talks to the editor page (its parent) instead of a server. */
export function ScoringPreviewPhone({ state, player, session }: { state: ScoringState; player: string; session: string }) {
  const [submissions, setSubmissions] = useState<HoleSubmission[]>([]);
  const [submittedPlayers, setSubmittedPlayers] = useState<string[]>([]);
  const pending = useRef(new Map<string, Pending>());
  useEffect(() => {
    const requests = pending.current;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.session !== session || event.data?.type !== "scoring-preview-state") return;
      setSubmissions(event.data.submissions);
      setSubmittedPlayers(event.data.submittedPlayers ?? []);
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
  const request = (type: "scoring-preview-submit" | "scoring-preview-submit-round", body: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
    const requestId = player + ":" + crypto.randomUUID();
    const timer = setTimeout(() => { pending.current.delete(requestId); reject(new Error("Preview connection timed out. Reload the editor.")); }, 10000);
    pending.current.set(requestId, { resolve, reject, timer });
    window.parent.postMessage({ type, session, requestId, ...body }, window.location.origin);
  });
  return (
    <ScoringPanel
      playerSlug={player}
      playerFullName={player}
      round={1}
      matchBox={state.matchBox}
      nameBySlug={{}}
      previewState={state}
      previewSubmissions={submissions}
      previewSubmittedPlayers={submittedPlayers}
      onPreviewSubmit={(submission) => request("scoring-preview-submit", { submission })}
      onPreviewSubmitRound={() => request("scoring-preview-submit-round", {})}
    />
  );
}
