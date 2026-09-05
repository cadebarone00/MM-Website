"use client";

import { useState } from "react";
import type { BroadcastConfig, BroadcastScene, BroadcastState } from "@/lib/broadcast/types";
import type { PlaylistTrack } from "@/lib/broadcast/playlist";
import { DISPLAY_YEARS } from "@/lib/broadcast/displayYears";
import { useAutoScene } from "@/lib/broadcast/useAutoScene";
import { BroadcastPreview } from "./BroadcastPreview";

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

/**
 * Two modes, matching how a real broadcast control room works:
 *
 * - **Rehearsing** (not live): every control here — data year, scene — only
 *   changes the local preview iframe (a `/broadcast?preview=1&...` render
 *   that never touches the real, shared broadcast state, see
 *   app/broadcast/page.tsx). Nothing a Tiger clicks here reaches real
 *   viewers until "Go Live."
 * - **On Air** (live): controls act directly on the real /broadcast, same
 *   as before — scene overrides, Pause/Resume, announcements all take
 *   effect immediately, everywhere.
 */
export function BroadcastControlsPanel({
  initialDisplayYear,
  initialState,
  initialTracks,
  config,
}: {
  initialDisplayYear: number;
  initialState: BroadcastState;
  initialTracks: PlaylistTrack[];
  config: BroadcastConfig;
}) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [tracks, setTracks] = useState(initialTracks);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [playlistBusy, setPlaylistBusy] = useState<string | null>(null);
  const [previewYear, setPreviewYear] = useState(initialDisplayYear);
  const [previewScene, setPreviewScene] = useState<BroadcastScene>("individual_leaderboard");

  const isLive = state.tournamentLive;
  const isAuto = state.automationMode === "auto";
  // The real live scene while auto rotation is running — current_scene in
  // the database is stale in that case (auto rotation never writes it
  // back, see the spec's §8/§15), so this is what Pause actually freezes on.
  const liveAutoScene = useAutoScene(state.sceneStartedAt, config, isLive && isAuto);

  // Good enough for this admin panel: whether *something* is set to show,
  // not a live moment-by-moment check against the clock (that precision
  // belongs to the actual /broadcast viewer — components/broadcast/OverlayLayer.tsx).
  // Worst case here is "Clear Now" staying visible a few seconds after an
  // announcement already auto-expired on its own; clicking it then is a no-op.
  const overlayActive = Boolean(state.overlayText);

  const previewSrc = isLive ? "/broadcast" : `/broadcast?preview=1&year=${previewYear}&scene=${previewScene}`;

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

  async function uploadTrack(file: File) {
    setUploadBusy(true);
    setError(null);
    try {
      const extension = "." + (file.name.split(".").pop() ?? "mp3").toLowerCase();
      const signRes = await fetch("/api/portal/tiger/broadcast/playlist/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extension }),
      });
      const signData = await signRes.json();
      if (!signData.ok) {
        setError(signData.error ?? "Could not prepare that upload.");
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signData.url);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (status ${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
        xhr.send(file);
      });

      const durationSeconds = await new Promise<number>((resolve, reject) => {
        const probe = new Audio();
        probe.preload = "metadata";
        probe.onloadedmetadata = () => resolve(probe.duration);
        probe.onerror = () => reject(new Error("Could not read that file's length."));
        probe.src = URL.createObjectURL(file);
      });

      const confirmRes = await fetch("/api/portal/tiger/broadcast/playlist/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: file.name.replace(/\.[^.]+$/, ""), storagePath: signData.storagePath, durationSeconds }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmData.ok) {
        setError(confirmData.error ?? "Uploaded, but could not save it to the playlist.");
        return;
      }
      setTracks((current) => [...current, confirmData.track]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function playTrack(trackId: string) {
    setPlaylistBusy(trackId);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not start that track.");
        return;
      }
      setState((current) => ({ ...current, audioTrackId: trackId, audioStartedAt: new Date().toISOString() }));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function setLoopMode(mode: "one" | "all") {
    setPlaylistBusy(`loop-${mode}`);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/loop-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not change loop mode.");
        return;
      }
      setState((current) => ({ ...current, audioLoopMode: mode }));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function deleteTrack(trackId: string) {
    setPlaylistBusy(`delete-${trackId}`);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not remove that track.");
        return;
      }
      setTracks((current) => current.filter((t) => t.id !== trackId));
      setState((current) => (current.audioTrackId === trackId ? { ...current, audioTrackId: null, audioStartedAt: null } : current));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function setLiveScene(scene: BroadcastScene | null, options?: { paused?: boolean; busyKey?: string }) {
    setBusy(options?.busyKey ?? scene ?? "auto");
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, paused: options?.paused ?? false }),
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
        paused: scene !== null && (options?.paused ?? false),
      }));
    } finally {
      setBusy(null);
    }
  }

  function pause() {
    setLiveScene(liveAutoScene, { paused: true, busyKey: "pause" });
  }

  async function goLive() {
    setBusy("golive");
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ live: true, year: previewYear }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not go live.");
        return;
      }
      setState((current) => ({
        ...current,
        seasonYear: previewYear,
        tournamentLive: true,
        automationMode: "auto",
        sceneStartedAt: new Date().toISOString(),
      }));
    } finally {
      setBusy(null);
    }
  }

  async function endBroadcast() {
    setBusy("end");
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ live: false }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not end the broadcast.");
        return;
      }
      setState((current) => ({ ...current, tournamentLive: false }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="mt-4">
        <BroadcastPreview src={previewSrc} />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border-2 border-stone-300 p-4">
        <span
          className={[
            "rounded-full px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide",
            isLive ? "bg-maroon-700 text-white" : "bg-stone-200 text-ink-700",
          ].join(" ")}
        >
          {isLive ? "On Air" : "Rehearsing"}
        </span>
        {isLive ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={endBroadcast}
            className="rounded-lg border-2 border-stone-300 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            {busy === "end" ? "Ending…" : "End Broadcast"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            onClick={goLive}
            className="rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-maroon-800 disabled:opacity-50"
          >
            {busy === "golive" ? "Going Live…" : `Go Live (${previewYear})`}
          </button>
        )}
      </div>
      {error && <p className="mt-2 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      {!isLive ? (
        <div className="mt-4">
          <p className="font-sans text-xs text-ink-500">
            Nothing below affects the real /broadcast yet — this is a private rehearsal. Hit Go Live when it looks right.
          </p>

          <label className="mt-3 flex flex-col gap-1 font-sans text-xs text-ink-700">
            Data year
            <select
              value={previewYear}
              onChange={(e) => setPreviewYear(Number(e.target.value))}
              className="w-40 rounded-lg border-2 border-stone-300 px-3 py-2 text-sm"
            >
              {DISPLAY_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SCENE_BUTTONS.map((b) => (
              <button
                key={b.scene}
                type="button"
                onClick={() => setPreviewScene(b.scene)}
                className={[
                  "rounded-lg border-2 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide transition",
                  previewScene === b.scene ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 text-ink-700 hover:bg-stone-50",
                ].join(" ")}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="font-sans text-sm text-ink-700">
            Currently showing: <span className="font-semibold text-ink-900">{SCENE_LABELS[isAuto ? liveAutoScene : state.currentScene]}</span> —{" "}
            {isAuto ? "Auto rotation" : state.paused ? "Paused" : "Producer Mode (manual)"}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SCENE_BUTTONS.map((b) => (
              <button
                key={b.scene}
                type="button"
                disabled={busy !== null}
                onClick={() => setLiveScene(b.scene)}
                className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-maroon-800 disabled:opacity-50"
              >
                {busy === b.scene ? "Switching…" : `Show ${b.label}`}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy !== null || !isAuto}
              onClick={pause}
              className="rounded-lg border-2 border-stone-300 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              {busy === "pause" ? "Pausing…" : "Pause Automation"}
            </button>
            <button
              type="button"
              disabled={busy !== null || isAuto}
              onClick={() => setLiveScene(null)}
              className="rounded-lg border-2 border-stone-300 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              {busy === "auto" ? "Resuming…" : "Resume / Return to Auto"}
            </button>
          </div>

          <section className="mt-8 rounded-lg border-2 border-stone-300 p-4">
            <h2 className="font-serif text-lg font-bold text-ink-900">Announcement</h2>
            <p className="mt-1 font-sans text-xs text-ink-500">Shows as a banner over whatever&apos;s on screen for 8 seconds, then disappears on its own.</p>
            {overlayActive && <p className="mt-2 font-sans text-xs font-semibold text-maroon-700">Currently showing: &ldquo;{state.overlayText}&rdquo;</p>}
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

          <section className="mt-8 rounded-lg border-2 border-stone-300 p-4">
            <h2 className="font-serif text-lg font-bold text-ink-900">Broadcast Playlist</h2>
            <p className="mt-1 font-sans text-xs text-ink-500">Plays on /watch-live while the broadcast is live. Stops automatically when you end the broadcast.</p>

            <label className="mt-3 inline-block cursor-pointer rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-maroon-800">
              {uploadBusy ? "Uploading…" : "Upload Song"}
              <input
                type="file"
                accept="audio/*"
                disabled={uploadBusy}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) uploadTrack(file);
                }}
              />
            </label>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={playlistBusy !== null}
                onClick={() => setLoopMode("one")}
                className={[
                  "rounded-lg border-2 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50",
                  state.audioLoopMode === "one" ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 text-ink-700 hover:bg-stone-50",
                ].join(" ")}
              >
                Loop One
              </button>
              <button
                type="button"
                disabled={playlistBusy !== null}
                onClick={() => setLoopMode("all")}
                className={[
                  "rounded-lg border-2 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50",
                  state.audioLoopMode === "all" ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 text-ink-700 hover:bg-stone-50",
                ].join(" ")}
              >
                Loop All
              </button>
            </div>

            {tracks.length === 0 ? (
              <p className="mt-4 font-sans text-sm text-ink-500">No songs uploaded yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {tracks.map((track) => {
                  const isPlaying = state.audioTrackId === track.id;
                  return (
                    <li key={track.id} className="flex items-center justify-between gap-3 rounded-lg border-2 border-stone-200 px-3 py-2">
                      <span className={["truncate font-sans text-sm", isPlaying ? "font-semibold text-maroon-700" : "text-ink-700"].join(" ")}>
                        {isPlaying ? "▶ " : ""}
                        {track.title}
                      </span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={playlistBusy !== null || isPlaying}
                          onClick={() => playTrack(track.id)}
                          className="rounded-lg border-2 border-stone-300 px-3 py-1 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
                        >
                          {playlistBusy === track.id ? "Starting…" : "Play"}
                        </button>
                        <button
                          type="button"
                          disabled={playlistBusy !== null}
                          onClick={() => deleteTrack(track.id)}
                          className="rounded-lg border-2 border-stone-300 px-3 py-1 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
                        >
                          {playlistBusy === `delete-${track.id}` ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
