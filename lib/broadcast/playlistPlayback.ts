// lib/broadcast/playlistPlayback.ts

/**
 * Fixed-order playlist timing, same philosophy as lib/broadcast/rotation.ts's
 * sceneAt() — every client with the same anchor/tracks/loopMode computes the
 * identical answer, so playback stays in sync across every open tab with no
 * server process ticking on its own (see the spec's "How playback stays in
 * sync" section).
 */
export interface PlaylistTrackTiming {
  id: string;
  url: string;
  durationSeconds: number;
}

export interface PlaylistTick {
  track: PlaylistTrackTiming;
  offsetSeconds: number;
}

/**
 * Which track is playing and how far into it, given a fixed anchor track,
 * when that anchor started (offset 0), and the current playlist (ordered by
 * upload time — callers pass tracks pre-sorted). "one" loops the anchor
 * track forever, ignoring the rest of the list. "all" plays the full list as
 * one continuous cycle, rotated so the anchor track plays first.
 */
export function playlistTickAt(
  tracks: PlaylistTrackTiming[],
  anchorTrackId: string,
  loopMode: "one" | "all",
  anchorMs: number,
  nowMs: number
): PlaylistTick | null {
  const anchorIndex = tracks.findIndex((t) => t.id === anchorTrackId);
  if (anchorIndex === -1) return null;

  const elapsedSeconds = Math.max(0, (nowMs - anchorMs) / 1000);

  if (loopMode === "one") {
    const track = tracks[anchorIndex];
    const duration = Math.max(1, track.durationSeconds);
    return { track, offsetSeconds: elapsedSeconds % duration };
  }

  const rotated = [...tracks.slice(anchorIndex), ...tracks.slice(0, anchorIndex)];
  const totalDuration = rotated.reduce((sum, t) => sum + Math.max(1, t.durationSeconds), 0);
  let cursor = elapsedSeconds % totalDuration;

  for (const track of rotated) {
    const duration = Math.max(1, track.durationSeconds);
    if (cursor < duration) return { track, offsetSeconds: cursor };
    cursor -= duration;
  }

  // Unreachable given the loop above covers the full cycle, but keeps the
  // return type total rather than possibly undefined.
  return { track: rotated[0], offsetSeconds: 0 };
}
