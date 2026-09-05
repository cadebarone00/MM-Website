"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import { useLiveBroadcastAudio } from "@/lib/broadcast/useLiveBroadcastAudio";
import type { BroadcastState } from "@/lib/broadcast/types";
import type { PlaylistTrack } from "@/lib/broadcast/playlist";

// The real /broadcast page is laid out for a real desktop/TV window (fixed
// rem/px sizing — see components/broadcast/scenes/*). Rendering it at this
// native size and scaling the whole box down uniformly (rather than letting
// it reflow inside a small responsive iframe) is what makes /watch-live
// look like a shrunk photo of the real broadcast instead of a differently
// laid-out mobile version. See the spec's "Proportions fix" section.
const NATIVE_WIDTH = 1920;
const NATIVE_HEIGHT = 1080;

const CONTROLS_HIDE_DELAY_MS = 3000;

export function BroadcastPlayer({ state, tracks }: { state: BroadcastState; tracks: PlaylistTrack[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const { nowPlayingTitle, muted, setMuted, volume, setVolume } = useLiveBroadcastAudio(state, tracks);

  // Tap (touch) or mouse movement/click reveals the control bar; it hides
  // itself after 3s of no further activity. Any interaction with the bar
  // itself (a button click, dragging the volume slider) counts as activity
  // too, so it never disappears mid-interaction.
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setScale(width / NATIVE_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function toggleFullscreen() {
    revealControls();
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen();
  }

  function toggleMuted() {
    revealControls();
    setMuted(!muted);
    if (muted && volume === 0) setVolume(1);
  }

  return (
    <div ref={containerRef} onMouseMove={revealControls} className="relative aspect-video w-full overflow-hidden bg-ink-900">
      <div className="absolute left-0 top-0" style={{ width: NATIVE_WIDTH, height: NATIVE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <iframe className="h-full w-full border-0" src="/broadcast" title="Maroon Masters live broadcast" />
      </div>

      {/* /broadcast has nothing inside it a viewer needs to click — this
          transparent layer exists only to catch taps, since a tap inside
          the iframe (a separate document) would never reach this
          component's own event handlers otherwise. */}
      <button
        type="button"
        aria-label="Show player controls"
        onClick={revealControls}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent"
      />

      <div
        className={[
          "absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 transition-opacity duration-150",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      >
        <button type="button" onClick={toggleMuted} aria-label={muted ? "Unmute" : "Mute"} className="text-white">
          {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            revealControls();
            const next = Number(e.target.value);
            setVolume(next);
            setMuted(next === 0);
          }}
          aria-label="Volume"
          className="w-20 accent-maroon-700 sm:w-28"
        />
        {nowPlayingTitle && <span className="flex-1 truncate font-condensed text-xs uppercase tracking-wide text-white/80">{nowPlayingTitle}</span>}
        <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} className="ml-auto text-white">
          {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>
    </div>
  );
}
