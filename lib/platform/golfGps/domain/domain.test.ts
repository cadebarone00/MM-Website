import assert from "node:assert/strict";
import test from "node:test";
import { distanceYards, offsetByYards } from "../distance";
import { holeCamera } from "../holeView";
import { PETE_DYE_HOLE_6 } from "../missionHillsPeteDye";
import {
  GOLF_COVERAGE_LEVELS,
  hasCoverage,
  polygonCentroidAndArea,
  toPrototypeGpsCourse,
  toPrototypeGpsHole,
  type GolfCoordinate3D,
  type GolfCourse,
  type GolfCoverageFeatures,
  type GolfHole,
  type GolfPolygon,
} from "./index";

// TEST FIXTURES ONLY. Tee / green points are the OSM-derived Pete Dye hole 6 points already in missionHillsPeteDye.ts;
// the square shapes are made up for checking the math and are not real course geometry.
const NO_FEATURES: GolfCoverageFeatures = {
  scorecard: true, teeCoordinates: false, greenPoints: false, greenPolygons: false, fairways: false, hazardLocations: false,
  hazardPolygons: false, holeBoundaries: false, centerlines: false, elevation: false, greenSlope: false,
};
const square = (center: { lat: number; lng: number }, sideYards: number): GolfPolygon => {
  const h = sideYards / 2;
  return { coordinates: [offsetByYards(center, -h, -h), offsetByYards(center, -h, h), offsetByYards(center, h, h), offsetByYards(center, h, -h)] };
};
/** A 3D point (made-up altitude) to check the adapter drops height for the 2D prototype. */
const BACK_TEE_3D: GolfCoordinate3D = { ...PETE_DYE_HOLE_6.tee, altitude: 80 };
const PHONE = { width: 390, height: 844, top: 250, bottom: 170, side: 16 };

function gpsHole(): GolfHole {
  return {
    id: "hole-6",
    number: 6,
    par: 3,
    tees: [
      { id: "t-fwd", teeSetId: "forward", name: "Forward", location: { kind: "point", coordinate: offsetByYards(PETE_DYE_HOLE_6.tee, -30, 30) }, par: 3 },
      { id: "t-back", teeSetId: "back", name: "Back", location: { kind: "point", coordinate: BACK_TEE_3D }, yardage: 186 },
    ],
    green: { ...PETE_DYE_HOLE_6.green },
    fairways: [],
    bunkers: [{ id: "b1", geometry: { kind: "polygon", polygon: square(PETE_DYE_HOLE_6.hazards[0].center, 20) } }],
    penaltyAreas: [
      { id: "w1", kind: "water", geometry: { kind: "polygon", polygon: square(offsetByYards(PETE_DYE_HOLE_6.tee, -60, 60), 40) } },
      { id: "p1", kind: "penalty_area", geometry: { kind: "polygon", polygon: square(offsetByYards(PETE_DYE_HOLE_6.tee, 40, 40), 30) } },
    ],
    coverage: { level: "gps", features: { ...NO_FEATURES, teeCoordinates: true, greenPoints: true, hazardLocations: true, hazardPolygons: true } },
    verification: { status: "imported" },
    sources: [{ provider: "openstreetmap", attribution: "© OpenStreetMap contributors" }],
  };
}

function course(holes: GolfHole[]): GolfCourse {
  return {
    id: "course-1",
    externalIds: [{ provider: "openstreetmap", id: "relation/4082113" }, { provider: "open_golf", id: "abc-123" }],
    name: "Test Course",
    address: { city: "Rancho Mirage", state: "CA", country: "US" },
    holeCount: 18,
    holes,
    teeSets: [{ id: "back", name: "Back" }, { id: "forward", name: "Forward" }],
    sources: [{ provider: "openstreetmap", attribution: "© OpenStreetMap contributors" }],
    coverage: { level: "gps", features: NO_FEATURES, holesWithGps: holes.length },
    verification: { status: "imported", updatedAt: "2026-10-05T00:00:00Z" },
  };
}

test("coverage levels are ordered scorecard → premium and hasCoverage compares by rung", () => {
  assert.deepEqual(GOLF_COVERAGE_LEVELS, ["scorecard", "gps", "mapped", "verified", "premium"]);
  assert.equal(hasCoverage("mapped", "gps"), true);
  assert.equal(hasCoverage("gps", "gps"), true);
  assert.equal(hasCoverage("scorecard", "gps"), false);
  assert.equal(hasCoverage("premium", "verified"), true);
});

test("polygon centroid and area: a 20-yard square is 400 sq yd centered where it was built", () => {
  const center = { lat: 33.8, lng: -116.43 };
  const shape = polygonCentroidAndArea(square(center, 20));
  assert.ok(shape);
  assert.ok(Math.abs(shape.areaSquareYards - 400) < 1, `area ${shape.areaSquareYards}`);
  assert.equal(distanceYards(center, shape.centroid), 0);
  assert.equal(polygonCentroidAndArea({ coordinates: [center, offsetByYards(center, 5, 5)] }), null, "fewer than 3 points");
});

test("a GPS-level domain hole becomes the same prototype hole the GPS screen already uses", () => {
  const hole = toPrototypeGpsHole(gpsHole(), "back");
  assert.ok(hole);
  assert.deepEqual(hole.tee, PETE_DYE_HOLE_6.tee, "back tee, altitude dropped");
  assert.deepEqual(hole.green, PETE_DYE_HOLE_6.green);
  assert.equal(hole.par, 3);
  assert.equal(distanceYards(hole.tee, hole.green.center), 186);
  // The existing hole-view camera math accepts it unchanged.
  const camera = holeCamera(hole, PHONE);
  assert.ok(camera.zoom >= 14 && camera.zoom <= 20);
});

test("hazards: bunker → circle of equal area, water keeps its outline, non-water penalty areas are left out", () => {
  const hole = toPrototypeGpsHole(gpsHole(), "back");
  assert.ok(hole);
  assert.deepEqual(hole.hazards.map((h) => [h.id, h.kind, h.label]), [["b1", "bunker", "Bunker"], ["w1", "water", "Water"]]);
  assert.equal(hole.hazards[0].radiusYards, Math.round(Math.sqrt(400 / Math.PI)));
  assert.equal(distanceYards(hole.hazards[0].center, PETE_DYE_HOLE_6.hazards[0].center), 0);
  assert.equal(hole.hazards[1].outline?.length, 4);
});

test("hazard geometry: point-only hazards are valid and get no made-up outline; a given polygon center wins", () => {
  const pin = offsetByYards(PETE_DYE_HOLE_6.tee, -50, 50);
  const outline = square(PETE_DYE_HOLE_6.hazards[0].center, 20);
  const statedCenter = offsetByYards(PETE_DYE_HOLE_6.hazards[0].center, 3, 0);
  const hole = toPrototypeGpsHole({
    ...gpsHole(),
    bunkers: [
      { id: "pt", geometry: { kind: "point", point: pin, source: { provider: "open_golf", providerRecordId: "hz-9" } }, label: "Fairway bunker" },
      { id: "both", geometry: { kind: "polygon", polygon: outline, center: statedCenter } },
    ],
    penaltyAreas: [{ id: "lake", kind: "water", geometry: { kind: "point", point: pin } }],
  }, "back");
  assert.ok(hole);
  const [pt, both, lake] = hole.hazards;
  assert.deepEqual([pt.id, pt.kind, pt.label, pt.radiusYards, pt.outline], ["pt", "bunker", "Fairway bunker", 0, undefined]);
  assert.equal(distanceYards(pt.center, pin), 0);
  assert.equal(distanceYards(both.center, statedCenter), 0, "stated center, not the computed middle");
  assert.equal(both.radiusYards, Math.round(Math.sqrt(400 / Math.PI)));
  assert.deepEqual([lake.kind, lake.radiusYards, "outline" in lake], ["water", 0, false], "point-only water has no outline");
});

test("tee choice: requested tee set, else the first tee with a location", () => {
  const forward = toPrototypeGpsHole(gpsHole(), "forward");
  assert.ok(forward);
  assert.equal(distanceYards(forward.tee, PETE_DYE_HOLE_6.tee), distanceYards(offsetByYards(PETE_DYE_HOLE_6.tee, -30, 30), PETE_DYE_HOLE_6.tee));
  const fallback = toPrototypeGpsHole(gpsHole(), "no-such-tees");
  assert.deepEqual(fallback?.tee, forward.tee);
  const polygonTee: GolfHole = { ...gpsHole(), tees: [{ id: "t", teeSetId: "back", name: "Back", location: { kind: "polygon", polygon: square(PETE_DYE_HOLE_6.tee, 10) } }] };
  assert.equal(distanceYards(toPrototypeGpsHole(polygonTee)!.tee, PETE_DYE_HOLE_6.tee), 0, "polygon tee → its middle");
});

test("missing data gives null instead of guessed positions", () => {
  const scorecardOnly: GolfHole = { ...gpsHole(), tees: [{ id: "t", teeSetId: "back", name: "Back", yardage: 186 }], green: undefined, bunkers: [], penaltyAreas: [] };
  assert.equal(toPrototypeGpsHole(scorecardOnly), null);
  assert.equal(toPrototypeGpsHole({ ...gpsHole(), green: { center: PETE_DYE_HOLE_6.green.center } }), null, "no front / back");
  assert.equal(toPrototypeGpsCourse(course([scorecardOnly])), null, "GPS screen needs at least one hole");
});

test("course: only GPS-ready holes, in number order, with de-duplicated source credits", () => {
  const second: GolfHole = { ...gpsHole(), id: "hole-2", number: 2 };
  const scorecardOnly: GolfHole = { ...gpsHole(), id: "hole-9", number: 9, tees: [], green: undefined };
  const result = toPrototypeGpsCourse(course([gpsHole(), scorecardOnly, second]), "back");
  assert.ok(result);
  assert.equal(result.name, "Test Course");
  assert.deepEqual(result.holes.map((h) => h.number), [2, 6]);
  assert.equal(result.note, "© OpenStreetMap contributors");
});
