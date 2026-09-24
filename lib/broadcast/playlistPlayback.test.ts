import { test } from "node:test";
import assert from "node:assert/strict";
import { playlistTickAt, type PlaylistTrackTiming } from "./playlistPlayback.ts";

const tracks: PlaylistTrackTiming[] = [
  { id: "a", url: "https://example.com/a.mp3", durationSeconds: 100 },
  { id: "b", url: "https://example.com/b.mp3", durationSeconds: 50 },
  { id: "c", url: "https://example.com/c.mp3", durationSeconds: 75 },
];

test("returns null when the anchor track isn't in the list", () => {
  assert.equal(playlistTickAt(tracks, "missing", "all", false, 0, 0), null);
});

test("loop 'one' starts the anchor track at offset 0", () => {
  const tick = playlistTickAt(tracks, "b", "one", false, 0, 0);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 0);
});

test("loop 'one' wraps the anchor track's own duration, ignoring every other track", () => {
  const tick = playlistTickAt(tracks, "b", "one", false, 0, 125_000);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 25); // 125s elapsed % 50s duration
});

test("loop 'one' ignores shuffle entirely", () => {
  const tick = playlistTickAt(tracks, "b", "one", true, 0, 125_000);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 25);
});

test("loop 'all' starts on the anchor track at offset 0", () => {
  const tick = playlistTickAt(tracks, "b", "all", false, 0, 0);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 0);
});

test("loop 'all' advances to the next track in list order once the anchor's duration elapses", () => {
  // anchor "a" (100s), 110s elapsed -> 10s into "b"
  const tick = playlistTickAt(tracks, "a", "all", false, 0, 110_000);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 10);
});

test("loop 'all' rotates so the anchor plays first, then wraps to the start of that rotation", () => {
  // anchor "c" (75s) -> rotated order is [c, a, b], total 225s. 230s elapsed wraps to 5s into "c" again.
  const tick = playlistTickAt(tracks, "c", "all", false, 0, 230_000);
  assert.equal(tick?.track.id, "c");
  assert.equal(tick?.offsetSeconds, 5);
});

test("every client with the same anchor/tracks/loopMode agrees, regardless of when it starts watching", () => {
  const laterAnchor = 1_000_000;
  const now = laterAnchor + 110_000;
  const a = playlistTickAt(tracks, "a", "all", false, laterAnchor, now);
  const b = playlistTickAt(tracks, "a", "all", false, 0, now - laterAnchor);
  assert.equal(a?.track.id, b?.track.id);
  assert.equal(a?.offsetSeconds, b?.offsetSeconds);
});

test("shuffle 'all' still starts on the anchor track at offset 0 — the pressed song always leads", () => {
  const tick = playlistTickAt(tracks, "b", "all", true, 0, 0);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 0);
});

test("shuffle 'all' is deterministic — two independent clients with the same anchor agree at every point in the cycle", () => {
  const anchorMs = 42_000;
  for (const elapsedMs of [0, 30_000, 90_000, 140_000, 200_000, 230_000]) {
    const a = playlistTickAt(tracks, "a", "all", true, anchorMs, anchorMs + elapsedMs);
    const b = playlistTickAt(tracks, "a", "all", true, anchorMs, anchorMs + elapsedMs);
    assert.equal(a?.track.id, b?.track.id);
    assert.equal(a?.offsetSeconds, b?.offsetSeconds);
  }
});

test("shuffle 'all' visits every track exactly once per cycle (a permutation, not a subset)", () => {
  const anchorMs = 7_000;
  const seen = new Set<string>();
  let elapsed = 0;
  const totalDuration = tracks.reduce((sum, t) => sum + t.durationSeconds, 0);
  // Sample once near the start of each track-length step across one full
  // cycle — with 3 tracks whose durations sum to 225s, stepping by 1s
  // through the whole cycle guarantees landing inside every track at least
  // once, however shuffle reordered them.
  while (elapsed < totalDuration) {
    const tick = playlistTickAt(tracks, "a", "all", true, anchorMs, anchorMs + elapsed * 1000);
    if (tick) seen.add(tick.track.id);
    elapsed += 1;
  }
  assert.deepEqual([...seen].sort(), ["a", "b", "c"]);
});

test("a different anchor timestamp reshuffles the order (not the same permutation every time)", () => {
  // Same anchor track, two different anchor instants (e.g. two separate
  // Play clicks) — the shuffled order of the non-anchor tracks should
  // differ at least at one sampled point, otherwise "shuffle" would be a
  // no-op relative to the anchor timestamp.
  const anchorTrackId = "a";
  const sampleAt = (anchorMs: number) => playlistTickAt(tracks, anchorTrackId, "all", true, anchorMs, anchorMs + 105_000)?.track.id;
  const results = new Set([sampleAt(0), sampleAt(1_000), sampleAt(2_000), sampleAt(3_000), sampleAt(4_000)]);
  assert.ok(results.size > 1, "expected different anchor timestamps to produce at least one different shuffle order");
});
