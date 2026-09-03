"use client";

import { useState } from "react";
import type { BroadcastScene, BroadcastState } from "@/lib/broadcast/types";

const SCENE_BUTTONS: { scene: BroadcastScene; label: string }[] = [
  { scene: "individual_leaderboard", label: "Individual Leaderboard" },
  { scene: "match_play", label: "Match Play" },
  { scene: "holding", label: "Holding" },
];

const SCENE_LABELS: Record<BroadcastScene, string> = {
  holding: "Holding",
  individual_leaderboard: "Individual Leaderboard",
  match_play: "Match Play",
};

export function BroadcastControlsPanel({ initialState }: { initialState: BroadcastState }) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setScene(scene: BroadcastScene | null) {
    setBusy(scene ?? "auto");
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not update the broadcast.");
        return;
      }
      setState((current) => ({
        ...current,
        automationMode: scene === null ? "auto" : "producer",
        currentScene: scene ?? current.currentScene,
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <p className="font-sans text-sm text-ink-700">
        Currently showing: <span className="font-semibold text-ink-900">{SCENE_LABELS[state.currentScene]}</span> —{" "}
        {state.automationMode === "auto" ? "Auto rotation" : "Producer Mode (manual)"}
      </p>
      {error && <p className="mt-2 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SCENE_BUTTONS.map((b) => (
          <button
            key={b.scene}
            type="button"
            disabled={busy !== null}
            onClick={() => setScene(b.scene)}
            className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-maroon-800 disabled:opacity-50"
          >
            {busy === b.scene ? "Switching…" : `Show ${b.label}`}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={busy !== null || state.automationMode === "auto"}
        onClick={() => setScene(null)}
        className="mt-3 w-full rounded-lg border-2 border-stone-300 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
      >
        {busy === "auto" ? "Returning…" : "Return to Auto"}
      </button>
    </div>
  );
}
