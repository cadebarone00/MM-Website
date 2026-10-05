import {
  measureCourseCoverage, measureHoleCoverage,
  type GolfBunker, type GolfCoordinate, type GolfCourse, type GolfFairway, type GolfHazardGeometry, type GolfHole, type GolfPenaltyArea,
  type GolfPenaltyAreaKind, type GolfPolygon, type GolfPolyline, type GolfSourceMetadata, type GolfTee,
} from "../../domain";
import type { GolfGeometryCounts, GolfMappedFeatureKind, UnassignedGolfFeature } from "../GolfGeometryProvider";
import { OSM_ATTRIBUTION } from "./client";
import {
  alongLine, densify, elementRings, insideRings, lineLength, pointToPath, pointToRings, projector, ringCentroid, toCoordinate,
  type Ring, type XY,
} from "./geometry";
import type { EvaluatedCandidate } from "./matching";
import type { OsmElement } from "./types";

/**
 * Matched OSM features → Maroon holes. Every shape is copied from OSM as-is (no smoothing, no made-up outlines) and
 * carries its OSM element id. A feature is attached to a hole only when the evidence is clear; everything else is
 * returned as unassigned with the reason.
 *
 * How features find their hole (golf=hole lines, drawn tee → green, numbered by `ref`, are the anchor):
 * - green: the hole line ends on it (inside, or within 15 m). Two holes ending on one green → unassigned (double green).
 * - tee: within 20 m of the hole line (extended 100 m back past its start, for back tees) and in the first ~45% of it.
 * - fairway: the hole line runs through it (≥ ~15 m inside). Crossed by two holes about equally → unassigned.
 * - bunker / water / penalty area: nearest hole line within 40 m (bunkers) / 60 m (penalty areas), and clearly nearer
 *   than the next hole (by 20 m / 30 m). Otherwise unassigned.
 * Holes without a usable number, numbers drawn twice, or numbers not on the scorecard → unassigned.
 */

const GREEN_END_METERS = 15;
const TEE_LINE_METERS = 20;
const TEE_BACK_EXTENSION_METERS = 100;
const TEE_MAX_SHARE_OF_HOLE = 0.45;
const FAIRWAY_MIN_INSIDE_SAMPLES = 3;
const HAZARD_RULES = { bunker: { near: 40, margin: 20 }, penalty_area: { near: 60, margin: 30 } } as const;
/**
 * Features this close outside the course outline still count: OSM outlines are often drawn tighter than the course (at
 * Tobacco Road many real tees / bunkers sit 30–100 m outside). Features inside another course's outline never count, and
 * every feature still has to sit clearly next to one of this course's hole lines to be attached.
 */
const BOUNDARY_TOLERANCE_METERS = 100;

type AreaKind = "green" | "fairway" | "bunker" | "penalty_area" | "tee";

interface Feature {
  id: string;
  element: OsmElement;
  kind: GolfMappedFeatureKind;
  source: GolfSourceMetadata;
  /** For areas: the outline (one per outer ring). For points: none. */
  ring?: Ring;
  point?: GolfCoordinate;
  line?: GolfCoordinate[];
  /** Representative point for "is it on this course" checks. */
  anchor: GolfCoordinate;
}

interface HoleLine {
  number: number;
  feature: Feature;
  coordinates: GolfCoordinate[];
  xy: XY[];
  samples: XY[];
  length: number;
}

const kindOf = (tags: Record<string, string>): GolfMappedFeatureKind | null => {
  switch (tags.golf) {
    case "hole": return "hole";
    case "tee": return "tee";
    case "green": return "green";
    case "fairway": return "fairway";
    case "bunker": return "bunker";
    case "water_hazard": case "lateral_water_hazard": case "penalty_area": return "penalty_area";
  }
  return tags.natural === "water" ? "penalty_area" : null;
};

/** Water hazards, any natural=water, and penalty areas tagged as water are "water"; other penalty areas aren't. */
const penaltyKind = (tags: Record<string, string>): GolfPenaltyAreaKind =>
  tags.golf === "water_hazard" || tags.golf === "lateral_water_hazard" || tags.natural === "water" || tags.water ? "water" : "penalty_area";

const polygonOf = (ring: Ring, source: GolfSourceMetadata): GolfPolygon =>
  ({ coordinates: ring.outer, ...(ring.inner.length && { innerRings: ring.inner }), source });

/** The one number in a course name ("Pinehurst No. 2" → 2), or null when it has none or several. */
function singleNumber(name: string | undefined): number | null {
  const numbers = name?.match(/\d+/g) ?? [];
  return numbers.length === 1 ? Number(numbers[0]) : null;
}

/**
 * A golf=hole `ref` → hole number, or the reason it can't be used. Two forms are read:
 * - "7": hole 7
 * - "7 - #2": hole 7 of course No. 2 (how Pinehurst's courses are mapped) — only when the matched OSM course's name
 *   carries that same single number, so another course's holes inside the outline are never taken.
 */
export function parseHoleRef(ref: string, courseNumber: number | null): number | string {
  const value = ref.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const withCourse = value.match(/^(\d+)\s*-\s*#(\d+)$/);
  if (withCourse) {
    return courseNumber !== null && Number(withCourse[2]) === courseNumber
      ? Number(withCourse[1])
      : `hole line "${value}" belongs to course #${withCourse[2]}, not this course`;
  }
  return `hole line has no plain hole number (ref "${value}")`;
}

export interface OsmEnrichmentInput {
  course: GolfCourse;
  location: GolfCoordinate;
  chosen: EvaluatedCandidate;
  matchConfidence: number;
  others: EvaluatedCandidate[];
  elements: OsmElement[];
  importedAt: string;
}

export interface OsmEnrichmentOutput {
  course: GolfCourse;
  courseBoundary: GolfPolygon[];
  unassigned: UnassignedGolfFeature[];
  counts: GolfGeometryCounts;
  notes: string[];
}

export function enrichWithOsm({ course, location, chosen, matchConfidence, others, elements, importedAt }: OsmEnrichmentInput): OsmEnrichmentOutput {
  const notes: string[] = [];
  const project = projector(location);
  const source = (element: OsmElement, confidence?: number, part?: number): GolfSourceMetadata => ({
    provider: "openstreetmap",
    providerRecordId: `${element.type}/${element.id}${part ? `#${part}` : ""}`,
    importedAt,
    attribution: OSM_ATTRIBUTION,
    ...(confidence !== undefined && { confidence }),
  });
  const unassigned: UnassignedGolfFeature[] = [];
  const leaveUnassigned = (feature: Feature, reason: string) => unassigned.push({
    id: feature.id,
    kind: feature.kind,
    geometry: feature.line ? { kind: "line", line: { coordinates: feature.line, source: feature.source } }
      : feature.ring ? { kind: "polygon", polygon: polygonOf(feature.ring, feature.source) }
      : { kind: "point", point: feature.point! },
    source: feature.source,
    reason,
  });

  // 1. Turn OSM elements into features (one per outer ring), skipping ones whose geometry can't be used.
  const seen = new Set<string>();
  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const features: Feature[] = [];
  for (const element of elements) {
    const key = `${element.type}/${element.id}`;
    const kind = kindOf(element.tags);
    if (!kind || seen.has(key)) continue;
    seen.add(key);
    if (kind === "hole") {
      const line = element.type === "way" && element.geometry && element.geometry.length >= 2 ? element.geometry.map(toCoordinate) : null;
      if (!line) { skip("hole lines without usable geometry"); continue; }
      features.push({ id: key, element, kind, source: source(element), line, anchor: line[Math.floor(line.length / 2)] });
      continue;
    }
    if (element.point) {
      if (kind === "green" || kind === "fairway") { skip(`${kind}s mapped as a single point`); continue; }
      features.push({ id: key, element, kind, source: source(element), point: toCoordinate(element.point), anchor: toCoordinate(element.point) });
      continue;
    }
    const rings = elementRings(element);
    if (!rings) { skip(`${kind === "penalty_area" ? "water / penalty area" : kind} outlines that are incomplete or clipped`); continue; }
    rings.forEach((ring, index) => {
      const part = rings.length > 1 ? index + 1 : undefined;
      features.push({ id: part ? `${key}#${part}` : key, element, kind, source: source(element, undefined, part), ring, anchor: ringCentroid(ring.outer) });
    });
  }
  for (const [why, count] of Object.entries(skipped)) notes.push(`Skipped ${count} OSM ${why}.`);

  // 2. Keep only features on the matched course (inside its outline, or just outside it and not inside another course).
  const onCourse = (point: GolfCoordinate) => {
    const distance = pointToRings(point, chosen.rings, project);
    if (distance === 0) return true;
    return distance <= BOUNDARY_TOLERANCE_METERS && !others.some((other) => insideRings(point, other.rings));
  };
  const mine = features.filter((feature) => onCourse(feature.anchor));
  if (features.length > mine.length) notes.push(`${features.length - mine.length} OSM features in the area belong to other courses or sit outside this course's outline, so they were left out.`);

  // 3. Hole lines: the anchors. Usable only with a hole number that's drawn once and is on the scorecard.
  const holesByNumber = new Map(course.holes.map((hole) => [hole.number, hole]));
  const lines: HoleLine[] = [];
  const holeFeatures = mine.filter((feature) => feature.kind === "hole");
  const courseNumber = singleNumber(chosen.candidate.name);
  const parsed = holeFeatures.map((feature) => parseHoleRef(feature.element.tags.ref ?? "", courseNumber));
  const refs = parsed.map((ref) => (typeof ref === "number" ? ref : null));
  holeFeatures.forEach((feature, index) => {
    const number = refs[index];
    if (number === null) return leaveUnassigned(feature, parsed[index] as string);
    const copies = refs.filter((ref) => ref === number).length;
    if (copies > 1) return leaveUnassigned(feature, `hole ${number} is drawn ${copies} times in OSM`);
    if (!holesByNumber.has(number)) return leaveUnassigned(feature, `the scorecard has no hole ${number}`);
    const xy = feature.line!.map(project);
    lines.push({ number, feature, coordinates: feature.line!, xy, samples: densify(xy), length: lineLength(xy) });
  });

  // OSM draws holes tee → green. If a line clearly starts on a green and ends nowhere near one, it was drawn backwards.
  const greens = mine.filter((feature) => feature.kind === "green");
  const nearestGreen = (point: GolfCoordinate) => Math.min(Infinity, ...greens.map((green) => pointToRings(point, [green.ring!], project)));
  for (const line of lines) {
    const start = line.coordinates[0], end = line.coordinates[line.coordinates.length - 1];
    if (nearestGreen(start) <= GREEN_END_METERS && nearestGreen(end) > GREEN_END_METERS) {
      line.coordinates = [...line.coordinates].reverse();
      line.xy = [...line.xy].reverse();
      line.samples = densify(line.xy);
      notes.push(`Hole ${line.number}'s OSM line runs green → tee, so it was read the other way round.`);
    }
    const scorecard = holesByNumber.get(line.number)!;
    const par = Number(line.feature.element.tags.par);
    if (Number.isInteger(par) && par !== scorecard.par) notes.push(`OSM says hole ${line.number} is par ${par}; the scorecard says par ${scorecard.par} (scorecard kept).`);
    const handicap = Number(line.feature.element.tags.handicap);
    if (Number.isInteger(handicap) && scorecard.strokeIndex !== undefined && handicap !== scorecard.strokeIndex) {
      notes.push(`OSM says hole ${line.number} has handicap ${handicap}; the scorecard says ${scorecard.strokeIndex} (scorecard kept).`);
    }
  }

  // 4. Assign every other feature to at most one hole.
  type Assigned = { feature: Feature; confidence: number };
  const byHole = new Map<number, Record<AreaKind, Assigned[]>>(lines.map((line) => [line.number, { green: [], tee: [], fairway: [], bunker: [], penalty_area: [] }]));
  const assign = (line: HoleLine, kind: AreaKind, feature: Feature, confidence: number) => byHole.get(line.number)![kind].push({ feature, confidence });
  /** Meters between a feature and a hole line: 0 if the line runs through it. */
  const distanceToLine = (feature: Feature, line: HoleLine) => {
    if (feature.point) return pointToPath(project(feature.point), line.xy);
    const outline = feature.ring!.outer.map(project);
    if (line.samples.some((sample) => insideRings(unproject(sample), [feature.ring!]))) return 0;
    return Math.min(...outline.map((p) => pointToPath(p, line.xy)), ...line.samples.map((s) => pointToPath(s, outline, true)));
  };
  const unproject = (p: XY): GolfCoordinate => {
    const cos = Math.cos((location.lat * Math.PI) / 180), meters = (Math.PI / 180) * 6_371_008.8;
    return { lat: location.lat + p.y / meters, lng: location.lng + p.x / (meters * cos) };
  };
  const holeList = (unsorted: number[]) => {
    const numbers = [...unsorted].sort((a, b) => a - b);
    return numbers.length === 2 ? `holes ${numbers[0]} and ${numbers[1]}` : `holes ${numbers.join(", ")}`;
  };
  const noLines = lines.length === 0;

  for (const feature of mine) {
    if (feature.kind === "hole") continue;
    if (noLines) { leaveUnassigned(feature, "no numbered OSM hole lines on this course to match it to"); continue; }

    if (feature.kind === "green") {
      const ending = lines.filter((line) => pointToRings(line.coordinates[line.coordinates.length - 1], [feature.ring!], project) <= GREEN_END_METERS);
      if (ending.length === 1) assign(ending[0], "green", feature, pointToRings(ending[0].coordinates[ending[0].coordinates.length - 1], [feature.ring!], project) === 0 ? 0.95 : 0.85);
      else leaveUnassigned(feature, ending.length ? `${holeList(ending.map((l) => l.number))} both end on this green` : "no hole line ends on this green (practice green?)");
      continue;
    }

    if (feature.kind === "tee") {
      const anchor = project(feature.point ?? feature.anchor);
      const fits = lines.flatMap((line) => {
        const [a, b] = line.xy;
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const back = { x: a.x - ((b.x - a.x) / length) * TEE_BACK_EXTENSION_METERS, y: a.y - ((b.y - a.y) / length) * TEE_BACK_EXTENSION_METERS };
        const extended = [back, ...line.xy];
        const distance = feature.point ? pointToPath(anchor, extended) : Math.min(pointToPath(anchor, extended), distanceToLine(feature, line));
        const along = alongLine(anchor, extended) - TEE_BACK_EXTENSION_METERS;
        return distance <= TEE_LINE_METERS && along <= TEE_MAX_SHARE_OF_HOLE * line.length ? [{ line, distance }] : [];
      }).sort((x, y) => x.distance - y.distance);
      if (fits.length === 1 || (fits.length > 1 && fits[1].distance - fits[0].distance >= 15)) assign(fits[0].line, "tee", feature, 0.85);
      else leaveUnassigned(feature, fits.length ? `tee box is near the start of ${holeList(fits.map((f) => f.line.number))}` : "not near the start of any mapped hole");
      continue;
    }

    if (feature.kind === "fairway") {
      const crossing = lines.map((line) => ({ line, inside: line.samples.filter((s) => insideRings(unproject(s), [feature.ring!])).length }))
        .filter((c) => c.inside >= FAIRWAY_MIN_INSIDE_SAMPLES).sort((x, y) => y.inside - x.inside);
      if (crossing.length === 1 || (crossing.length > 1 && crossing[0].inside >= 2 * crossing[1].inside)) assign(crossing[0].line, "fairway", feature, 0.85);
      else leaveUnassigned(feature, crossing.length ? `fairway is crossed by ${holeList(crossing.map((c) => c.line.number))}` : "no hole line runs through this fairway");
      continue;
    }

    const rule = HAZARD_RULES[feature.kind === "bunker" ? "bunker" : "penalty_area"];
    const nearest = lines.map((line) => ({ line, distance: distanceToLine(feature, line) })).sort((x, y) => x.distance - y.distance);
    const [first, second] = nearest;
    if (first.distance <= rule.near && (!second || second.distance - first.distance >= rule.margin)) {
      assign(first.line, feature.kind === "bunker" ? "bunker" : "penalty_area", feature, !second || second.distance - first.distance >= 2 * rule.margin ? 0.85 : 0.7);
    } else {
      const close = nearest.filter((n) => n.distance <= rule.near).map((n) => n.line.number);
      leaveUnassigned(feature, close.length > 1 ? `between ${holeList(close.slice(0, 3))}` : `not within ${rule.near} m of any mapped hole line`);
    }
  }

  // 5. Build the enriched holes. A hole gets at most one green: the one its line ends inside; extras are unassigned.
  const withConfidence = (feature: Feature, confidence: number): GolfSourceMetadata => ({ ...feature.source, confidence });
  const counts: GolfGeometryCounts = { courseBoundary: chosen.rings.length > 0, holeCenterlines: 0, greens: 0, tees: 0, fairways: 0, bunkers: 0, penaltyAreas: 0, unassigned: 0 };
  const holes: GolfHole[] = course.holes.map((hole) => {
    const line = lines.find((l) => l.number === hole.number);
    const found = byHole.get(hole.number);
    if (!line || !found) return hole;
    const [green, ...extraGreens] = [...found.green].sort((x, y) => y.confidence - x.confidence);
    for (const extra of extraGreens) leaveUnassigned(extra.feature, `hole ${hole.number} already has a green`);
    const centerline: GolfPolyline = { coordinates: line.coordinates, source: withConfidence(line.feature, 0.95) };
    const tees: GolfTee[] = found.tee.map(({ feature, confidence }) => ({
      id: `${hole.id}:osm:${feature.id}`,
      name: feature.element.tags.name ?? "Tee box",
      ...(feature.element.tags.colour && { color: feature.element.tags.colour }),
      location: feature.point
        ? { kind: "point" as const, coordinate: feature.point, source: withConfidence(feature, confidence) }
        : { kind: "polygon" as const, polygon: polygonOf(feature.ring!, withConfidence(feature, confidence)) },
    }));
    const hazardGeometry = ({ feature, confidence }: Assigned): GolfHazardGeometry => feature.point
      ? { kind: "point", point: feature.point, source: withConfidence(feature, confidence) }
      : { kind: "polygon", polygon: polygonOf(feature.ring!, withConfidence(feature, confidence)) };
    const label = (feature: Feature) => feature.element.tags.name ? { label: feature.element.tags.name } : {};
    const fairways: GolfFairway[] = found.fairway.map(({ feature, confidence }) => ({ id: `osm:${feature.id}`, polygon: polygonOf(feature.ring!, withConfidence(feature, confidence)) }));
    const bunkers: GolfBunker[] = found.bunker.map((a) => ({ id: `osm:${a.feature.id}`, geometry: hazardGeometry(a), ...label(a.feature) }));
    const penaltyAreas: GolfPenaltyArea[] = found.penalty_area.map((a) => ({ id: `osm:${a.feature.id}`, kind: penaltyKind(a.feature.element.tags), geometry: hazardGeometry(a), ...label(a.feature) }));

    counts.holeCenterlines++;
    if (green) counts.greens++;
    counts.tees += tees.length;
    counts.fairways += fairways.length;
    counts.bunkers += bunkers.length;
    counts.penaltyAreas += penaltyAreas.length;
    const enriched: GolfHole = {
      ...hole,
      externalIds: [...(hole.externalIds ?? []), { provider: "openstreetmap", id: line.feature.id }],
      tees: [...hole.tees, ...tees],
      ...(green && { green: { ...hole.green, polygon: polygonOf(green.feature.ring!, withConfidence(green.feature, green.confidence)) } }),
      fairways: [...hole.fairways, ...fairways],
      bunkers: [...hole.bunkers, ...bunkers],
      penaltyAreas: [...hole.penaltyAreas, ...penaltyAreas],
      centerline,
      sources: [...(hole.sources ?? []), line.feature.source],
    };
    return { ...enriched, coverage: measureHoleCoverage(enriched) };
  });
  counts.unassigned = unassigned.length;

  const courseSource: GolfSourceMetadata = { provider: "openstreetmap", providerRecordId: `${chosen.element.type}/${chosen.element.id}`, importedAt, attribution: OSM_ATTRIBUTION, confidence: matchConfidence };
  const enrichedCourse: GolfCourse = {
    ...course,
    externalIds: [...course.externalIds, chosen.candidate.externalId],
    holes,
    sources: [...course.sources, courseSource],
  };
  const courseBoundary = chosen.rings.map((ring) => polygonOf(ring, courseSource));
  return { course: { ...enrichedCourse, coverage: measureCourseCoverage(enrichedCourse) }, courseBoundary, unassigned, counts, notes };
}
