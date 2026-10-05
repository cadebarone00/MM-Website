import type { GolfCoordinate } from "../../domain";
import type { GolfCourseCandidate, GolfGeometryMatchStatus } from "../GolfGeometryProvider";
import { elementRings, pointToRings, projector, type Ring } from "./geometry";
import type { OsmElement } from "./types";

/**
 * Which OSM golf course (leisure=golf_course) is the Maroon course? Conservative on purpose: a wrong match would put
 * another course's greens on this course's holes, so when the evidence is weak nothing is attached.
 *
 * Rules:
 * 1. The OSM course must be named, and its name must match the course / club name (similarity ≥ 0.5). Numbers have to
 *    agree: "Pinehurst No. 2" never matches "Pinehurst No. 7", and a generic "Pinehurst Resort" can't stand in for it.
 * 2. Its outline must come within 1,500 m of the course's location.
 * 3. If two candidates both pass, the best must beat the next by ≥ 0.25 similarity; otherwise it's ambiguous.
 * 4. Location inside an outline but no name match → low confidence, nothing attached.
 */

export const MIN_NAME_SIMILARITY = 0.5;
export const MAX_MATCH_DISTANCE_METERS = 1500;
const MIN_SIMILARITY_LEAD = 0.25;

/** Words that say "golf course" rather than which one. */
const FILLER = new Set(["golf", "club", "course", "courses", "country", "cc", "gc", "the", "at", "and", "of", "links", "no", "number", "resort", "inc", "llc"]);

export function nameTokens(name: string): string[] {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/#/g, " ")
    .split(/[^a-z0-9]+/).filter((word) => word && !FILLER.has(word));
}

/** 0–1 word overlap (Jaccard) between two names, after dropping filler words; 0 if their numbers disagree. */
export function nameSimilarity(a: string, b: string): number {
  const left = new Set(nameTokens(a)), right = new Set(nameTokens(b));
  if (!left.size || !right.size) return 0;
  const numbers = (words: Set<string>) => [...words].filter((word) => /\d/.test(word)).sort().join(",");
  if (numbers(left) !== numbers(right)) {
    // "Pinehurst No. 2" vs "Pinehurst No. 7": different courses. vs plain "Pinehurst": maybe the whole resort — weak.
    if (numbers(left) && numbers(right)) return 0;
  }
  const shared = [...left].filter((word) => right.has(word)).length;
  const score = shared / new Set([...left, ...right]).size;
  return numbers(left) !== numbers(right) ? Math.min(score, MIN_NAME_SIMILARITY - 0.1) : score;
}

export interface EvaluatedCandidate {
  element: OsmElement;
  rings: Ring[];
  candidate: GolfCourseCandidate;
}

/** Measure every OSM course outline against the Maroon course. Outlines that are incomplete can't be measured and are reported. */
export function evaluateCandidates(location: GolfCoordinate, names: string[], elements: OsmElement[], notes: string[]): EvaluatedCandidate[] {
  const project = projector(location);
  return elements.filter((e) => e.tags.leisure === "golf_course").flatMap((element): EvaluatedCandidate[] => {
    const label = element.tags.name ?? `${element.type}/${element.id}`;
    const rings = elementRings(element);
    if (!rings) { notes.push(`OSM course "${label}" has an incomplete outline, so it couldn't be considered.`); return []; }
    const distanceMeters = Math.round(pointToRings(location, rings, project));
    const osmName = element.tags.name;
    const similarity = osmName ? Math.max(...names.map((name) => nameSimilarity(name, osmName))) : 0;
    return [{
      element, rings,
      candidate: {
        externalId: { provider: "openstreetmap", id: `${element.type}/${element.id}` },
        ...(osmName && { name: osmName }),
        distanceMeters,
        containsLocation: distanceMeters === 0,
        nameSimilarity: Math.round(similarity * 100) / 100,
      },
    }];
  }).sort((a, b) => b.candidate.nameSimilarity - a.candidate.nameSimilarity || a.candidate.distanceMeters - b.candidate.distanceMeters);
}

export interface CourseChoice {
  status: Exclude<GolfGeometryMatchStatus, "no_location">;
  chosen?: EvaluatedCandidate;
  confidence?: number;
  reason: string;
}

export function chooseCourse(evaluated: EvaluatedCandidate[]): CourseChoice {
  if (!evaluated.length) return { status: "no_course_found", reason: "OpenStreetMap has no golf course outline near this course's location." };
  const strong = evaluated.filter(({ candidate }) => candidate.nameSimilarity >= MIN_NAME_SIMILARITY && candidate.distanceMeters <= MAX_MATCH_DISTANCE_METERS);
  if (strong.length > 1 && strong[0].candidate.nameSimilarity - strong[1].candidate.nameSimilarity < MIN_SIMILARITY_LEAD) {
    return { status: "ambiguous", reason: `Several OSM courses match about equally well (${strong.map((s) => `"${s.candidate.name}"`).join(", ")}), so nothing was attached.` };
  }
  const chosen = strong[0];
  if (!chosen) {
    const around = evaluated.find(({ candidate }) => candidate.containsLocation);
    return {
      status: "low_confidence",
      reason: around
        ? `The course's location is inside OSM course "${around.candidate.name ?? around.candidate.externalId.id}", but the names don't match, so nothing was attached.`
        : "Nearby OSM courses don't match this course's name, so nothing was attached.",
    };
  }
  const { nameSimilarity: similarity, distanceMeters } = chosen.candidate;
  const confidence = similarity >= 0.8 && distanceMeters <= 300 ? 0.95 : similarity >= 0.8 || distanceMeters <= 300 ? 0.85 : 0.75;
  return { status: "matched", chosen, confidence, reason: `Matched OSM course "${chosen.candidate.name}" (name similarity ${similarity}, ${distanceMeters} m away).` };
}
