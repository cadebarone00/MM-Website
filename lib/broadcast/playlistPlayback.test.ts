import { test } from "node:test";
import assert from "node:assert/strict";
import { playlistTickAt, type PlaylistTrackTiming } from "./playlistPlayback.ts";

const tracks: PlaylistTrackTiming[] = [
  { id: "a", url: "https://example.com/a.mp3", durationSeconds: 100 },
  { id: "b", url: "https://example.com/b.mp3", durationSeconds: 50 },
  { id: "c", url: "https://example.com/c.mp3", durationSeconds: 75 },
];

test("returns null when the anchor track isn't in the list", () => {
  assert.equal(playlistTickAt(tracks, "missing", "all", 0, 0), null);
});

test("loop 'one' starts the anchor track at offset 0", () => {
  const tick = playlistTickAt(tracks, "b", "one", 0, 0);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 0);
});

test("loop 'one' wraps the anchor track's own duration, ignoring every other track", () => {
  const tick = playlistTickAt(tracks, "b", "one", 0, 125_000);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 25); // 125s elapsed % 50s duration
});

test("loop 'all' starts on the anchor track at offset 0", () => {
  const tick = playlistTickAt(tracks, "b", "all", 0, 0);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 0);
});

test("loop 'all' advances to the next track in list order once the anchor's duration elapses", () => {
  // anchor "a" (100s), 110s elapsed -> 10s into "b"
  const tick = playlistTickAt(tracks, "a", "all", 0, 110_000);
  assert.equal(tick?.track.id, "b");
  assert.equal(tick?.offsetSeconds, 10);
});

test("loop 'all' rotates so the anchor plays first, then wraps to the start of that rotation", () => {
  // anchor "c" (75s) -> rotated order is [c, a, b], total 225s. 230s elapsed wraps to 5s into "c" again.
  const tick = playlistTickAt(tracks, "c", "all", 0, 230_000);
  assert.equal(tick?.track.id, "c");
  assert.equal(tick?.offsetSeconds, 5);
});

test("every client with the same anchor/tracks/loopMode agrees, regardless of when it starts watching", () => {
  const laterAnchor = 1_000_000;
  const now = laterAnchor + 110_000;
  const a = playlistTickAt(tracks, "a", "all", laterAnchor, now);
  const b = playlistTickAt(tracks, "a", "all", 0, now - laterAnchor);
  assert.equal(a?.track.id, b?.track.id);
  assert.equal(a?.offsetSeconds, b?.offsetSeconds);
});
