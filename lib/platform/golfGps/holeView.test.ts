import assert from "node:assert/strict";
import test from "node:test";
import { bearingDegrees, distanceYards, moveAlong, offsetByYards } from "./distance";
import { holeCamera, holeFramePoints } from "./holeView";
import { MOCK_HOLE } from "./mockCourse";
import type { GpsHole } from "./types";

const PHONE = { width: 390, height: 844, top: 250, bottom: 170, side: 16 };

test("bearing: due north is 0, due east is 90, and moveAlong goes where it says", () => {
  const start = { lat: 33.79, lng: -116.42 };
  assert.ok(Math.abs(bearingDegrees(start, offsetByYards(start, 300, 0))) < 0.01);
  assert.ok(Math.abs(bearingDegrees(start, offsetByYards(start, 0, 300)) - 90) < 0.01);
  const moved = moveAlong(start, 135, 200);
  assert.equal(distanceYards(start, moved), 200);
  assert.ok(Math.abs(bearingDegrees(start, moved) - 135) < 0.05);
});

test("hole view faces tee → green, so the green is straight up the screen", () => {
  const camera = holeCamera(MOCK_HOLE, PHONE);
  assert.ok(Math.abs(camera.heading - bearingDegrees(MOCK_HOLE.tee, MOCK_HOLE.green.center)) < 1e-9);
  assert.ok(camera.heading > 95 && camera.heading < 110, `mock hole plays east-ish, got ${camera.heading}`);
});

test("hole view fits the whole hole inside the clear band between the card and the controls", () => {
  const camera = holeCamera(MOCK_HOLE, PHONE);
  const metersPerPixel = (156543.03392 * Math.cos((MOCK_HOLE.tee.lat * Math.PI) / 180)) / 2 ** camera.zoom;
  // Screen y of a point (0 = top), for a map turned to camera.heading and centered on camera.center.
  const screenY = (point: { lat: number; lng: number }) => {
    const yards = distanceYards(camera.center, point);
    const angle = ((bearingDegrees(camera.center, point) - camera.heading) * Math.PI) / 180;
    return PHONE.height / 2 - (yards * 0.9144 * Math.cos(angle)) / metersPerPixel;
  };
  const tee = screenY(MOCK_HOLE.tee), back = screenY(MOCK_HOLE.green.back);
  assert.ok(back < tee, "green above tee");
  assert.ok(back >= PHONE.top - 2, `back of green below the card (y=${back})`);
  assert.ok(tee <= PHONE.height - PHONE.bottom + 2, `tee above the controls (y=${tee})`);
  assert.ok(tee - back > (PHONE.height - PHONE.top - PHONE.bottom) * 0.6, "hole uses most of the band, not a tiny sliver");
});

test("a short hole zooms in closer than a long one, and zoom stays in a sane range", () => {
  const short: GpsHole = { ...MOCK_HOLE, green: { front: moveAlong(MOCK_HOLE.tee, 100, 140), center: moveAlong(MOCK_HOLE.tee, 100, 150), back: moveAlong(MOCK_HOLE.tee, 100, 160) }, hazards: [] };
  const longer = holeCamera(MOCK_HOLE, PHONE), shorter = holeCamera(short, PHONE);
  assert.ok(shorter.zoom > longer.zoom);
  for (const camera of [longer, shorter]) assert.ok(camera.zoom >= 14 && camera.zoom <= 20);
});

test("real holes frame their geometry only: hazards (and the player) never widen or move the hole view", () => {
  const frame = [moveAlong(MOCK_HOLE.tee, 100, 60), moveAlong(MOCK_HOLE.tee, 100, 300)];
  const mapped: GpsHole = { ...MOCK_HOLE, frame };
  assert.deepEqual(holeFramePoints(mapped), [mapped.tee, mapped.green.front, mapped.green.center, mapped.green.back, ...frame]);
  const farBunker = { id: "far", kind: "bunker" as const, label: "Bunker", center: moveAlong(MOCK_HOLE.tee, 10, 900), radiusYards: 5 };
  assert.deepEqual(holeCamera({ ...mapped, hazards: [...mapped.hazards, farBunker] }, PHONE), holeCamera(mapped, PHONE));
  // Prototype holes without mapped geometry keep their old framing (tee, green, hazards).
  assert.ok(holeFramePoints(MOCK_HOLE).includes(MOCK_HOLE.hazards[0].center));
  // holeCamera takes only the hole and the screen — there is no player input to move it.
  assert.equal(holeCamera.length, 2);
});
