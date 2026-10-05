import assert from "node:assert/strict";
import test from "node:test";
import type { GolfCoordinate, GolfCourse, GolfHole, GolfPolygon, GolfSourceMetadata } from "../domain";
import { toPrototypeGpsHole } from "../domain";
import { distanceToHazardYards } from "../distance";
import { deriveCourseGreenTargets, deriveHoleGreenTargets } from "./deriveGreenTargets";
import { approachBearingFromCenterline, greenCenter, greenFrontBack } from "./greenTargets";

// Made-up shapes laid out in meters (east, north) around ORIGIN — deterministic fixtures, not real greens.
const ORIGIN = { lat: 35.2, lng: -79.46 };
const M = (Math.PI / 180) * 6_371_008.8;
const COS = Math.cos((ORIGIN.lat * Math.PI) / 180);
const at = (east: number, north: number): GolfCoordinate => ({ lat: ORIGIN.lat + north / M, lng: ORIGIN.lng + east / (M * COS) });
const local = (p: GolfCoordinate) => ({ east: (p.lng - ORIGIN.lng) * M * COS, north: (p.lat - ORIGIN.lat) * M });
const near = (actual: number, expected: number, tolerance = 0.05, label = "") => assert.ok(Math.abs(actual - expected) <= tolerance, `${label} expected ${expected}, got ${actual}`);
const polygon = (points: [number, number][], source?: GolfSourceMetadata): GolfPolygon => ({ coordinates: points.map(([e, n]) => at(e, n)), ...(source && { source }) });
/** Distance (m) from a point to the nearest edge of an outline. */
const toOutline = (p: GolfCoordinate, outline: GolfCoordinate[]) => {
  const q = local(p), ring = outline.map(local);
  return Math.min(...ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length], dx = b.east - a.east, dy = b.north - a.north;
    const t = Math.max(0, Math.min(1, ((q.east - a.east) * dx + (q.north - a.north) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(q.east - (a.east + t * dx), q.north - (a.north + t * dy));
  }));
};

// A 20 m wide (east-west) × 30 m deep (north-south) green centered on (0, 300).
const RECT = polygon([[-10, 285], [10, 285], [10, 315], [-10, 315]]);
const OSM = (id: string): GolfSourceMetadata => ({ provider: "openstreetmap", providerRecordId: id, importedAt: "2026-10-05T00:00:00Z", attribution: "© OpenStreetMap contributors" });

test("center: area-weighted centroid, not the average of the outline's points", () => {
  const rect = greenCenter(RECT)!;
  assert.equal(rect.method, "polygon_centroid");
  near(local(rect.center).east, 0); near(local(rect.center).north, 300);
  // Same rectangle with many extra points crowded along its east edge: a plain average drifts east, the centroid doesn't.
  const crowded = polygon([[-10, 285], [10, 285], ...Array.from({ length: 20 }, (_, i) => [10, 286 + i] as [number, number]), [10, 315], [-10, 315]]);
  near(local(greenCenter(crowded)!.center).east, 0, 0.05, "centroid east");
  const average = crowded.coordinates.reduce((sum, p) => sum + local(p).east, 0) / crowded.coordinates.length;
  assert.ok(average > 5, "a naive average would have been pulled east");
});

test("center: a crescent green whose centroid falls off the green uses an interior point that is on the green", () => {
  // C-shape opening east: the centroid lands in the empty middle.
  const crescent = polygon([[0, 0], [30, 0], [30, 8], [8, 8], [8, 32], [30, 32], [30, 40], [0, 40]]);
  const result = greenCenter(crescent)!;
  assert.equal(result.method, "polygon_interior_point");
  const { east, north } = local(result.center);
  assert.ok(east > 0 && east < 8 && north > 8 && north < 32, `interior point inside the C's spine, got ${east.toFixed(1)}, ${north.toFixed(1)}`);
  assert.equal(greenCenter(polygon([[0, 0], [1, 1]])), null, "no area → no center");
});

test("straight approach from the south: front is the south edge, back the north edge, both on the outline", () => {
  const center = at(0, 300);
  const { front, back } = greenFrontBack(RECT, center, 0)!;
  near(local(front).north, 285); near(local(front).east, 0);
  near(local(back).north, 315); near(local(back).east, 0);
  assert.ok(toOutline(front, RECT.coordinates) < 0.01 && toOutline(back, RECT.coordinates) < 0.01);
});

test("reversing the approach reverses front and back", () => {
  const center = at(0, 300);
  const north = greenFrontBack(RECT, center, 0)!, south = greenFrontBack(RECT, center, 180)!;
  near(local(south.front).north, local(north.back).north);
  near(local(south.back).north, local(north.front).north);
});

test("diagonal green approached along its long axis: front / back are the far corners of that axis", () => {
  // A 40 × 10 m green rotated 45° (long axis running SW → NE), centered on (0, 0).
  const rotate = (e: number, n: number): [number, number] => [(e + n) * Math.SQRT1_2, (n - e) * Math.SQRT1_2];
  const diagonal = polygon([rotate(-5, -20), rotate(5, -20), rotate(5, 20), rotate(-5, 20)]);
  const { front, back } = greenFrontBack(diagonal, at(0, 0), 45)!;
  near(Math.hypot(local(front).east, local(front).north), 20, 0.05, "front 20 m from center");
  near(Math.hypot(local(back).east, local(back).north), 20, 0.05, "back 20 m from center");
  assert.ok(local(front).east < 0 && local(back).east > 0, "front to the SW, back to the NE");
});

test("irregular (concave) green: the line leaves and re-enters — front is the first green, back the last, all on the outline", () => {
  // U-shaped green opening north. Approached from the south along its west arm (x = -10), the line crosses the
  // bottom edge (y = 0) and leaves at the top of the arm (y = 30).
  const u = polygon([[-15, 0], [15, 0], [15, 30], [5, 30], [5, 6], [-5, 6], [-5, 30], [-15, 30]]);
  const center = at(-10, 15);
  const { front, back } = greenFrontBack(u, center, 0)!;
  near(local(front).north, 0); near(local(back).north, 30);
  assert.ok(toOutline(front, u.coordinates) < 0.01 && toOutline(back, u.coordinates) < 0.01);
  // Approached from the west, the line at y = 15 crosses the west arm, leaves it, then crosses the east arm.
  const across = greenFrontBack(u, center, 90)!;
  near(local(across.front).east, -15); near(local(across.back).east, 15, 0.05, "back is the last green (east arm), not the first exit");
});

test("dogleg: the hole line's final leg sets the direction, not the tee → green bearing", () => {
  // Tee at (0, 0), straight north 300 m, then turns east 120 m into a green centered on (120, 300).
  const green = polygon([[110, 290], [130, 290], [130, 310], [110, 310]]);
  const line = [at(0, 0), at(0, 300), at(120, 300)];
  near(approachBearingFromCenterline(line, green)!, 90, 0.01, "final leg runs due east");
  const teeToGreen = (Math.atan2(120, 300) * 180) / Math.PI;
  assert.ok(Math.abs(teeToGreen - 90) > 60, "the overall tee → green bearing (~22°) would have been very wrong");
  // A tiny last kink (2 m) doesn't take over: the final 30 m still reads as east.
  near(approachBearingFromCenterline([...line, at(120, 302)], green)!, 85.9, 0.1);
});

test("no reliable direction: a line that ends away from the green, or is too short, gives no bearing", () => {
  assert.equal(approachBearingFromCenterline([at(0, 0), at(0, 200)], RECT), null, "ends 85 m short of the green");
  assert.equal(approachBearingFromCenterline([at(0, 298), at(0, 300)], RECT), null, "2 m line");
});

// --- Applying targets to holes -------------------------------------------------------------------------------------

const SCORECARD = { scorecard: true, teeCoordinates: false, greenPoints: false, greenPolygons: false, fairways: false, hazardLocations: false,
  hazardPolygons: false, holeBoundaries: false, centerlines: false, elevation: false, greenSlope: false };
const hole = (overrides: Partial<GolfHole>): GolfHole => ({
  id: "h1", number: 1, par: 4, tees: [], fairways: [], bunkers: [], penaltyAreas: [],
  coverage: { level: "scorecard", features: SCORECARD }, verification: { status: "imported" }, ...overrides,
});
const OSM_GREEN = { ...RECT, source: OSM("way/21") };
const CENTERLINE = { coordinates: [at(0, 0), at(0, 300)], source: OSM("way/11") };
const NOW = "2026-10-05T19:00:00.000Z";

test("derived targets carry their derivation: center from the OSM outline, front / back from outline + hole line", () => {
  const { hole: result, report } = deriveHoleGreenTargets(hole({ green: { polygon: OSM_GREEN }, centerline: CENTERLINE }), NOW);
  near(local(result.green!.front!).north, 285); near(local(result.green!.back!).north, 315);
  assert.deepEqual(result.green!.derivation, {
    center: { derivedBy: "maroon", method: "polygon_centroid", derivedAt: NOW, inputs: [OSM("way/21")] },
    frontBack: { derivedBy: "maroon", method: "approach_axis_intersection", derivedAt: NOW, inputs: [OSM("way/21"), OSM("way/11")], approachBearingDegrees: 0, directionSource: "centerline_final_segment" },
  });
  assert.equal(result.green!.polygon!.source?.provider, "openstreetmap", "the outline itself keeps its OSM source");
  assert.equal(result.verification.status, "imported", "derived ≠ verified");
  assert.deepEqual(report, { number: 1, greenPolygon: true, center: true, frontBack: true, directionSource: "centerline_final_segment" });
});

test("GPS coverage without any mapped tee once real green targets exist — but not 'mapped'", () => {
  const { hole: result } = deriveHoleGreenTargets(hole({ green: { polygon: OSM_GREEN }, centerline: CENTERLINE, fairways: [{ id: "f", polygon: polygon([[-15, 50], [15, 50], [15, 250], [-15, 250]]) }] }), NOW);
  assert.equal(result.coverage.features.teeCoordinates, false);
  assert.equal(result.coverage.level, "gps");
  const withTee = deriveHoleGreenTargets(hole({ green: { polygon: OSM_GREEN }, centerline: CENTERLINE, fairways: result.fairways,
    tees: [{ id: "t", name: "Tee box", location: { kind: "point", coordinate: at(0, -5) } }] }), NOW).hole;
  assert.equal(withTee.coverage.level, "mapped", "mapped still needs a located tee");
});

test("fallback: no hole line on a par 3 uses tee → green; on a par 4 it stays center-only instead of guessing", () => {
  const tee = [{ id: "t", name: "Tee box", location: { kind: "point" as const, coordinate: at(0, 150), source: OSM("node/5") } }];
  const par3 = deriveHoleGreenTargets(hole({ par: 3, green: { polygon: OSM_GREEN }, tees: tee }), NOW);
  assert.equal(par3.hole.green!.derivation!.frontBack!.directionSource, "tee_to_green");
  assert.deepEqual(par3.hole.green!.derivation!.frontBack!.inputs, [OSM("way/21"), OSM("node/5")]);
  near(local(par3.hole.green!.front!).north, 285);

  const par4 = deriveHoleGreenTargets(hole({ par: 4, green: { polygon: OSM_GREEN }, tees: tee }), NOW);
  assert.ok(par4.hole.green!.center, "center still available");
  assert.equal(par4.hole.green!.front, undefined);
  assert.equal(par4.hole.green!.back, undefined);
  assert.equal(par4.hole.green!.derivation!.frontBack, undefined);
  assert.equal(par4.hole.coverage.level, "scorecard", "no front / back → not gps");
  assert.deepEqual(par4.report, { number: 1, greenPolygon: true, center: true, frontBack: false, reason: "no hole line for the direction of play (tee → green isn't trusted on a par 4 / 5)" });
});

test("points a source already gave are kept, and holes without an outline are left alone", () => {
  const given = { polygon: OSM_GREEN, front: at(1, 1), center: at(2, 2), back: at(3, 3) };
  assert.deepEqual(deriveHoleGreenTargets(hole({ green: given, centerline: CENTERLINE }), NOW).hole.green, given);
  const bare = hole({});
  assert.equal(deriveHoleGreenTargets(bare, NOW).hole, bare);
});

test("course: holes at GPS level counted, and the GPS adapter opens a tee-less hole from its hole line", () => {
  const course: GolfCourse = {
    id: "c", externalIds: [], name: "Test", address: {}, holeCount: 2, teeSets: [], sources: [],
    holes: [hole({ green: { polygon: OSM_GREEN }, centerline: CENTERLINE,
      bunkers: [{ id: "b", geometry: { kind: "polygon", polygon: polygon([[20, 280], [30, 280], [30, 290], [20, 290]]) } }] }), hole({ id: "h2", number: 2 })],
    coverage: { level: "scorecard", features: SCORECARD, holesWithGps: 0 }, verification: { status: "imported" },
  };
  const { course: result, holes } = deriveCourseGreenTargets(course, NOW);
  assert.equal(result.coverage.holesWithGps, 1);
  assert.deepEqual(holes.map((h) => [h.number, h.frontBack, h.reason]), [[1, true, undefined], [2, false, "no green outline"]]);
  const gps = toPrototypeGpsHole(result.holes[0])!;
  assert.equal(gps.teeMapped, false, "no tee marker for a hole-line start");
  assert.deepEqual(gps.tee, CENTERLINE.coordinates[0]);
  assert.equal(gps.hazards[0].outline?.length, 4, "bunker keeps its real outline");
  assert.ok(gps.frame && gps.frame.length >= 6, "hole line + green outline frame the hole");
});

test("hazard distance: nearest edge of a mapped outline (0 inside), middle point when there's no outline", () => {
  const bunker = { center: at(25, 285), outline: polygon([[20, 280], [30, 280], [30, 290], [20, 290]]).coordinates };
  assert.equal(distanceToHazardYards(at(25, 285), bunker), 0);
  assert.equal(distanceToHazardYards(at(25, 280 - 0.9144 * 50), bunker), 50, "50 yd south of its south edge");
  assert.equal(distanceToHazardYards(at(25, 280 - 0.9144 * 50), { center: bunker.center }), 55, "no outline → to the middle (5 m further)");
});
