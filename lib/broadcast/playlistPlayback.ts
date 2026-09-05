// lib/broadcast/playlistPlayback.ts

/**
 * Fixed-order playlist timing, same philosophy as lib/broadcast/rotation.ts's
 * sceneAt() — every client with the same anchor/tracks/loopMode/shuffle
 * computes the identical answer, so playback stays in sync across every open
 * tab with no server process ticking on its own (see the spec's "How
 * playback stays in sync" section).
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

// Tiny deterministic PRNG (mulberry32) seeded from a hash of the anchor —
// no external dependency, and critically: every client computes the exact
// same "random" order from the same inputs, which a real Math.random()
// could never do. A fresh anchor (a new Play click, or Go Live) reshuffles;
// the same anchor always reproduces the same shuffle.
function hashSeed(input: string): number {
  let hash = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Which track is playing and how far into it, given a fixed anchor track,
 * when that anchor started (offset 0), and the current playlist (ordered by
 * upload time — callers pass tracks pre-sorted). "one" loops the anchor
 * track forever, ignoring the rest of the list (and `shuffle`, which has no
 * meaning for a single repeating track). "all" plays the full list as one
 * continuous cycle, always starting with the anchor track — with `shuffle`
 * false, everything after it follows list order (wrapping back to the
 * start); with `shuffle` true, everything after it follows a deterministic
 * shuffle seeded from the anchor, so "which song leads" still matches
 * whatever the host pressed Play on, but the rest of the night's order is
 * randomized identically for every viewer.
 */
export function playlistTickAt(
  tracks: PlaylistTrackTiming[],
  anchorTrackId: string,
  loopMode: "one" | "all",
  shuffle: boolean,
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

  let rotated = [...tracks.slice(anchorIndex), ...tracks.slice(0, anchorIndex)];
  if (shuffle && rotated.length > 1) {
    rotated = [rotated[0], ...seededShuffle(rotated.slice(1), hashSeed(`${anchorTrackId}:${anchorMs}`))];
  }

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
