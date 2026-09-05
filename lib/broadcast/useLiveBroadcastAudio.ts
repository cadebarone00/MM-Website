"use client";

import { useEffect, useRef, useState } from "react";
import { playlistTickAt, type PlaylistTrackTiming } from "./playlistPlayback";
import type { BroadcastState } from "./types";
import type { PlaylistTrack } from "./playlist";

/**
 * Drives the actual <audio> playback for the Broadcast Playlist (see
 * docs/superpowers/specs/2026-09-04-watch-live-player-playlist-design.md).
 * No server round-trip keeps this ticking — every client independently
 * derives "which track, how far into it" from `state.audioStartedAt` via
 * playlistTickAt(), the same anchor-timestamp approach
 * lib/broadcast/rotation.ts's sceneAt() already uses for scene rotation.
 * `state`/`tracks` are expected to already be live (the caller owns
 * useLiveBroadcastState/usePlaylistTracks) — this hook only owns the
 * <audio> element and the mute/volume UI state.
 */
export function useLiveBroadcastAudio(state: BroadcastState, tracks: PlaylistTrack[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [nowPlayingId, setNowPlayingId] = useState<string | null>(null);
  const nowPlayingIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Lazy-create once, the first time this effect runs. Must be muted at
    // creation — the very first .play() call below happens before the
    // mute-sync effect runs, and only a muted element is allowed to autoplay.
    if (audioRef.current === null) {
      audioRef.current = new Audio();
      audioRef.current.muted = true;
    }
    const audio = audioRef.current;

    function reset() {
      audio.pause();
      audio.removeAttribute("src");
      nowPlayingIdRef.current = null;
      setNowPlayingId(null);
    }

    if (!state.tournamentLive || !state.audioTrackId || !state.audioStartedAt) {
      reset();
      return;
    }

    const timings: PlaylistTrackTiming[] = [...tracks].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    const anchorMs = new Date(state.audioStartedAt).getTime();
    const loopMode = state.audioLoopMode;
    const audioTrackId = state.audioTrackId;

    function applyTick() {
      const tick = playlistTickAt(timings, audioTrackId, loopMode, anchorMs, Date.now());
      if (!tick) return; // the anchor track isn't in `tracks` yet — a pending usePlaylistTracks refresh will retry this effect
      audio!.loop = loopMode === "one";
      if (audio!.src !== tick.track.url) {
        audio!.src = tick.track.url;
        audio!.currentTime = tick.offsetSeconds;
      }
      audio!.play().catch(() => {
        // Autoplay blocked until the viewer interacts (e.g. the mute button) — expected, not an error.
      });
      nowPlayingIdRef.current = tick.track.id;
      setNowPlayingId(tick.track.id);
    }

    applyTick();

    function onEnded() {
      if (loopMode === "one") return; // native audio.loop already handles this track looping itself
      applyTick(); // re-derive from elapsed time — lands at (approximately) the next track's start
    }
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [state.tournamentLive, state.audioTrackId, state.audioStartedAt, state.audioLoopMode, tracks]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const nowPlayingTitle = tracks.find((t) => t.id === nowPlayingId)?.title ?? null;

  return { nowPlayingTitle, muted, setMuted, volume, setVolume };
}
