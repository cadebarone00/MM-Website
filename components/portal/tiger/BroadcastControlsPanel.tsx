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
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementBusy, setAnnouncementBusy] = useState(false);

  const overlayActive = Boolean(state.overlayText && state.overlayExpiresAt && new Date(state.overlayExpiresAt).getTime() > Date.now());

  async function postAnnouncement() {
    const text = announcementText.trim();
    if (!text) return;
    setAnnouncementBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, durationSeconds: 8 }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not post the announcement.");
        return;
      }
      setState((current) => ({ ...current, overlayText: text, overlayExpiresAt: new Date(Date.now() + 8000).toISOString() }));
      setAnnouncementText("");
    } finally {
      setAnnouncementBusy(false);
    }
  }

  async function clearAnnouncement() {
    setAnnouncementBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not clear the announcement.");
        return;
      }
      setState((current) => ({ ...current, overlayText: null, overlayExpiresAt: null }));
    } finally {
      setAnnouncementBusy(false);
    }
  }

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

      <section className="mt-8 rounded-lg border-2 border-stone-300 p-4">
        <h2 className="font-serif text-lg font-bold text-ink-900">Announcement</h2>
        <p className="mt-1 font-sans text-xs text-ink-500">Shows as a banner over whatever's on screen for 8 seconds, then disappears on its own.</p>
        {overlayActive && <p className="mt-2 font-sans text-xs font-semibold text-maroon-700">Currently showing: "{state.overlayText}"</p>}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            maxLength={120}
            placeholder="e.g. Round 1 tee times pushed back 15 minutes"
            className="flex-1 rounded-lg border-2 border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={announcementBusy || !announcementText.trim()}
            onClick={postAnnouncement}
            className="rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
          >
            Post
          </button>
          {overlayActive && (
            <button
              type="button"
              disabled={announcementBusy}
              onClick={clearAnnouncement}
              className="rounded-lg border-2 border-stone-300 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 disabled:opacity-50"
            >
              Clear Now
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
