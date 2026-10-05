import type {
  GolfCourse, GolfCourseAccess, GolfCoverageFeatures, GolfDataCoverage, GolfHole, GolfRatingGender, GolfSourceMetadata, GolfTee,
  GolfTeeRating, GolfTeeSet, GolfVerification,
} from "../../domain";
import type { GolfCourseImport, GolfCourseSearchResult } from "../GolfCourseProvider";
import { OPEN_GOLF_ATTRIBUTION } from "./client";
import type { OpenGolfCourseDetail, OpenGolfSearchCourse, OpenGolfTee } from "./types";

/**
 * OpenGolf → Maroon domain. OpenGolf only gives course info and scorecards, so imported courses are scorecard
 * coverage: no tee / green coordinates, fairways, hazards, elevation or slope are ever filled in here.
 *
 * Ids: until courses are saved in the database (a later step), a course's Maroon id is "open_golf:<OpenGolf id>",
 * which is stable for the same OpenGolf course. Holes and tees get ids built from it.
 */

/** Drop keys whose value is null / undefined, so missing data is absent rather than present-but-empty. */
function defined<T extends object>(value: { [K in keyof T]: T[K] | null | undefined }): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined)) as T;
}

/** "US Open" → "us-open"; used to match hole yardage keys ("blue") to tee sets ("Blue"). */
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const GENDERS: Record<string, GolfRatingGender> = { male: "men", men: "men", female: "women", women: "women" };

const ACCESS: Record<string, GolfCourseAccess> = {
  public: "public", municipal: "public", private: "private", "semi-private": "semi_private", "semi private": "semi_private",
  resort: "resort", military: "military",
};

const SCORECARD_ONLY: GolfCoverageFeatures = {
  scorecard: true, teeCoordinates: false, greenPoints: false, greenPolygons: false, fairways: false, hazardLocations: false,
  hazardPolygons: false, holeBoundaries: false, centerlines: false, elevation: false, greenSlope: false,
};

export function normalizeOpenGolfSearchCourse(raw: OpenGolfSearchCourse): GolfCourseSearchResult {
  return defined<GolfCourseSearchResult>({
    externalId: { provider: "open_golf", id: raw.id },
    name: raw.name,
    city: raw.city,
    state: raw.state,
    location: raw.latitude !== null && raw.longitude !== null ? { lat: raw.latitude, lng: raw.longitude } : null,
    par: raw.par,
  });
}

/** OpenGolf lists each tee once per gender; group them into one Maroon tee set per tee name. */
function teeSets(tees: OpenGolfTee[], notes: string[]): GolfTeeSet[] {
  const groups = new Map<string, OpenGolfTee[]>();
  for (const tee of tees) {
    const id = slug(tee.tee_name);
    if (id) groups.set(id, [...(groups.get(id) ?? []), tee]);
  }
  return [...groups].map(([id, group]) => {
    const pars = [...new Set(group.map((tee) => tee.par).filter((par): par is number => par !== null))];
    if (pars.length > 1) notes.push(`Tee "${group[0].tee_name}" lists different pars (${pars.join(" / ")}) by gender, so no tee par was set.`);
    const ratings = group.flatMap((tee): GolfTeeRating[] => tee.course_rating !== null && tee.slope !== null
      ? [{ gender: GENDERS[tee.gender?.toLowerCase() ?? ""] ?? "unspecified", courseRating: tee.course_rating, slopeRating: tee.slope }]
      : []);
    return defined<GolfTeeSet>({
      id,
      name: group[0].tee_name,
      color: group.find((tee) => tee.tee_color)?.tee_color,
      totalYards: group.find((tee) => tee.yardage)?.yardage,
      par: pars.length === 1 ? pars[0] : null,
      ratings: ratings.length ? ratings : null,
    });
  });
}

export function normalizeOpenGolfCourse(raw: OpenGolfCourseDetail, importedAt: string): GolfCourseImport {
  const notes: string[] = [];
  const courseId = `open_golf:${raw.id}`;
  const name = raw.course_name ?? raw.club_name ?? "Unnamed course";
  if (!raw.course_name && !raw.club_name) notes.push("OpenGolf gave no course name.");
  const verification: GolfVerification = { status: "imported", updatedAt: importedAt };
  const source: GolfSourceMetadata = { provider: "open_golf", providerRecordId: raw.id, importedAt, attribution: OPEN_GOLF_ATTRIBUTION };

  const sets = teeSets(raw.tees, notes);
  const setByKey = new Map(sets.map((set) => [set.id, set]));

  const holes: GolfHole[] = [];
  const unmatchedKeys = new Set<string>();
  const withGeometry: number[] = [];
  for (const rawHole of [...raw.holes_data].sort((a, b) => a.number - b.number)) {
    if (holes.some((hole) => hole.number === rawHole.number)) { notes.push(`Hole ${rawHole.number} is listed twice; the first one was used.`); continue; }
    if (rawHole.par === null) { notes.push(`Hole ${rawHole.number} has no par, so it was left out.`); continue; }
    if (rawHole.geometryFieldsPresent.length) withGeometry.push(rawHole.number);
    const holeId = `${courseId}:hole-${rawHole.number}`;
    const tees: GolfTee[] = [];
    for (const [key, yardage] of Object.entries(rawHole.yardages)) {
      const set = setByKey.get(slug(key));
      if (!set) { unmatchedKeys.add(key); continue; }
      tees.push(defined<GolfTee>({ id: `${holeId}:${set.id}`, teeSetId: set.id, name: set.name, color: set.color, yardage }));
    }
    holes.push(defined<GolfHole>({
      id: holeId,
      number: rawHole.number,
      par: rawHole.par,
      strokeIndex: rawHole.handicap_index,
      tees,
      fairways: [],
      bunkers: [],
      penaltyAreas: [],
      coverage: { level: "scorecard", features: SCORECARD_ONLY },
      verification,
    }));
  }

  if (unmatchedKeys.size) notes.push(`Hole yardages for ${[...unmatchedKeys].map((key) => `"${key}"`).join(", ")} don't match any tee set, so they were left out.`);
  if (withGeometry.length) notes.push(`OpenGolf sent map data for hole${withGeometry.length > 1 ? "s" : ""} ${withGeometry.join(", ")} in a format not imported yet, so no GPS data was added.`);
  if (!raw.holes_data.length) notes.push("OpenGolf has no hole-by-hole scorecard for this course.");
  const holeCount = raw.holes ?? holes.length;
  if (raw.holes === null) notes.push(holes.length ? `OpenGolf gave no hole count; using the ${holes.length} hole${holes.length === 1 ? "" : "s"} it listed.` : "OpenGolf gave no hole count.");
  else if (holes.length && holes.length !== raw.holes) notes.push(`OpenGolf says ${raw.holes} holes but listed ${holes.length}.`);
  const parTotal = holes.reduce((sum, hole) => sum + hole.par, 0);
  if (raw.par !== null && holes.length === holeCount && parTotal !== raw.par) notes.push(`OpenGolf lists course par ${raw.par}, but the hole pars add up to ${parTotal}.`);

  const coverage: GolfDataCoverage = { level: "scorecard", features: { ...SCORECARD_ONLY, scorecard: holes.length > 0 }, holesWithGps: 0 };
  const course = defined<GolfCourse>({
    id: courseId,
    externalIds: [{ provider: "open_golf", id: raw.id }],
    name,
    facilityName: raw.club_name && raw.club_name.toLowerCase() !== name.toLowerCase() ? raw.club_name : null,
    address: defined({ street: raw.address, city: raw.city, state: raw.state, postalCode: raw.postal_code }),
    location: raw.lat !== null && raw.lng !== null ? { lat: raw.lat, lng: raw.lng } : null,
    timezone: raw.timezone,
    holeCount,
    holes,
    teeSets: sets,
    metadata: defined({ architect: raw.architect, yearOpened: raw.year_built, access: ACCESS[raw.type?.toLowerCase() ?? ""], website: raw.website, phone: raw.phone }),
    sources: [source],
    coverage,
    verification,
  });
  return { course, notes };
}
