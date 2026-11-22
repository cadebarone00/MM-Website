import type {
  GolfAddress, GolfCourse, GolfCoverageFeatures, GolfDataCoverage, GolfHole, GolfRatingGender, GolfSourceMetadata, GolfTee, GolfTeeRating,
  GolfTeeSet, GolfVerification,
} from "../../domain";
import type { GolfCourseImport, GolfCourseSearchResult } from "../GolfCourseProvider";
import { GOLF_COURSE_API_ATTRIBUTION } from "./client";
import type { GolfCourseApiCourse, GolfCourseApiSearchCourse, GolfCourseApiTeeBox } from "./types";

/**
 * GolfCourseAPI → Maroon domain. GolfCourseAPI gives course info and scorecards only, so imported courses are scorecard
 * coverage: no tee / green coordinates, fairways or hazards are filled in here (OpenStreetMap adds those for GPS).
 *
 * Tees: GolfCourseAPI lists men's and women's tee boxes separately. Boxes with the same name become ONE Maroon tee set
 * with a rating per gender (so a round saved with tee "White Tees" finds it either way). The men's box gives the
 * set's yardages and pars; if the women's box plays a different par on a hole, that is reported in the notes.
 *
 * Holes: GolfCourseAPI gives no hole numbers, only an ordered list per tee box (index 0 = hole 1). Each hole's default
 * par / handicap comes from the first full-length tee box (men's first); a tee that plays a different par or handicap
 * on a hole keeps its own value on that hole.
 *
 * Ids: a course's Maroon id here is "golf_course_api:<id>" (the course library assigns its own UUID when saved).
 */

/** Drop keys whose value is null / undefined, so missing data is absent rather than present-but-empty. */
function defined<T extends object>(value: { [K in keyof T]: T[K] | null | undefined }): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined)) as T;
}

/** "White Tees" → "white-tees". */
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const GENDER: Record<GolfCourseApiTeeBox["gender"], GolfRatingGender> = { male: "men", female: "women" };

const SCORECARD_ONLY: GolfCoverageFeatures = {
  scorecard: true, teeCoordinates: false, greenPoints: false, greenPolygons: false, fairways: false, hazardLocations: false,
  hazardPolygons: false, holeBoundaries: false, centerlines: false, elevation: false, greenSlope: false,
};

/**
 * One name for a course. GolfCourseAPI splits it into club ("Pinehurst Cc") and course ("No. 8"); when one already
 * contains the other ("Lubbock Country Club" / "Lubbock Country Club") only one is used, otherwise both.
 */
export function golfCourseApiName(clubName: string | null, courseName: string | null): string {
  if (!clubName || !courseName) return courseName ?? clubName ?? "Unnamed course";
  const club = clubName.toLowerCase(), course = courseName.toLowerCase();
  if (course.includes(club)) return courseName;
  if (club.includes(course)) return clubName;
  return `${clubName} – ${courseName}`;
}

export function normalizeGolfCourseApiSearchCourse(raw: GolfCourseApiSearchCourse): GolfCourseSearchResult {
  return defined<GolfCourseSearchResult>({
    externalId: { provider: "golf_course_api", id: raw.id },
    name: golfCourseApiName(raw.clubName, raw.courseName),
    city: raw.city,
    state: raw.state,
    location: raw.latitude !== null && raw.longitude !== null ? { lat: raw.latitude, lng: raw.longitude } : null,
  });
}

/** "1 Carolina Vista Dr, Pinehurst, NC 28374, USA" → street "1 Carolina Vista Dr", only when the next part is the city. */
function address(raw: GolfCourseApiCourse): GolfAddress {
  const parts = raw.address?.split(",").map((part) => part.trim()) ?? [];
  const street = parts.length >= 3 && raw.city && parts[1].toLowerCase() === raw.city.toLowerCase() ? parts[0] : null;
  const country = raw.country === "United States" || raw.country === "USA" ? "US" : raw.country;
  return defined<GolfAddress>({ street, city: raw.city, state: raw.state, country });
}

interface TeeGroup { id: string; name: string; men?: GolfCourseApiTeeBox; women?: GolfCourseApiTeeBox }

export function normalizeGolfCourseApiCourse(raw: GolfCourseApiCourse, importedAt: string): GolfCourseImport {
  const notes: string[] = [];
  const courseId = `golf_course_api:${raw.id}`;
  const name = golfCourseApiName(raw.clubName, raw.courseName);
  if (!raw.clubName && !raw.courseName) notes.push("GolfCourseAPI gave no course name.");
  const verification: GolfVerification = { status: "imported", updatedAt: importedAt };
  const source: GolfSourceMetadata = { provider: "golf_course_api", providerRecordId: raw.id, importedAt, attribution: GOLF_COURSE_API_ATTRIBUTION };

  // Group tee boxes by name: one tee set per name, men's and women's boxes side by side.
  const groups: TeeGroup[] = [];
  for (const box of raw.tees) {
    const id = slug(box.teeName);
    if (!id) continue;
    let group = groups.find((g) => g.id === id);
    if (!group) groups.push(group = { id, name: box.teeName });
    const side = box.gender === "male" ? "men" : "women";
    if (group[side]) { notes.push(`Tee "${box.teeName}" is listed twice for ${side}; the first one was used.`); continue; }
    group[side] = box;
  }
  const main = (group: TeeGroup) => (group.men ?? group.women)!;

  const holeCount = Math.max(0, ...groups.map((group) => main(group).holes.length));
  // Default par / handicap: the first tee box (men's first) that covers every hole.
  const primary = groups.map(main).find((box) => box.holes.length === holeCount && box.holes.every((hole) => hole.par !== null));

  const sets: GolfTeeSet[] = groups.map((group) => {
    const box = main(group);
    const ratings = [group.men, group.women].flatMap((b): GolfTeeRating[] => b && b.courseRating !== null && b.slopeRating !== null
      ? [{ gender: GENDER[b.gender], courseRating: b.courseRating, slopeRating: b.slopeRating }]
      : []);
    if (group.men && group.women) {
      const differ = group.men.holes.flatMap((hole, i) => {
        const other = group.women!.holes[i]?.par;
        return hole.par !== null && other != null && other !== hole.par ? [i + 1] : [];
      });
      if (differ.length) notes.push(`Tee "${group.name}" plays a different women's par on hole${differ.length > 1 ? "s" : ""} ${differ.join(", ")}; the men's par was used.`);
    }
    return defined<GolfTeeSet>({ id: group.id, name: group.name, totalYards: box.totalYards, par: box.parTotal, ratings: ratings.length ? ratings : null });
  });

  const holes: GolfHole[] = [];
  for (let i = 0; i < holeCount; i++) {
    const number = i + 1;
    const par = primary?.holes[i].par ?? groups.map((group) => main(group).holes[i]?.par).find((p) => p != null) ?? null;
    if (par === null) { notes.push(`Hole ${number} has no par, so it was left out.`); continue; }
    const strokeIndex = primary?.holes[i].handicap ?? null;
    const holeId = `${courseId}:hole-${number}`;
    const tees: GolfTee[] = groups.flatMap((group): GolfTee[] => {
      const hole = main(group).holes[i];
      if (!hole || hole.yardage === null) return [];
      return [defined<GolfTee>({
        id: `${holeId}:${group.id}`, teeSetId: group.id, name: group.name, yardage: hole.yardage,
        par: hole.par !== null && hole.par !== par ? hole.par : null,
        strokeIndex: hole.handicap !== null && strokeIndex !== null && hole.handicap !== strokeIndex ? hole.handicap : null,
      })];
    });
    holes.push(defined<GolfHole>({
      id: holeId, number, par, strokeIndex, tees, fairways: [], bunkers: [], penaltyAreas: [],
      coverage: { level: "scorecard", features: SCORECARD_ONLY },
      verification,
    }));
  }

  if (!raw.tees.length) notes.push("GolfCourseAPI has no tee boxes (so no scorecard) for this course.");
  else if (!holeCount) notes.push("GolfCourseAPI has no hole-by-hole scorecard for this course.");
  for (const group of groups) {
    const box = main(group);
    if (box.numberOfHoles !== null && box.holes.length && box.numberOfHoles !== box.holes.length) {
      notes.push(`Tee "${group.name}" says ${box.numberOfHoles} holes but lists ${box.holes.length}.`);
    }
  }

  const coverage: GolfDataCoverage = { level: "scorecard", features: { ...SCORECARD_ONLY, scorecard: holes.length > 0 }, holesWithGps: 0 };
  const course = defined<GolfCourse>({
    id: courseId,
    externalIds: [{ provider: "golf_course_api", id: raw.id }],
    name,
    facilityName: raw.clubName && raw.clubName.toLowerCase() !== name.toLowerCase() ? raw.clubName : null,
    address: address(raw),
    location: raw.latitude !== null && raw.longitude !== null ? { lat: raw.latitude, lng: raw.longitude } : null,
    holeCount,
    holes,
    teeSets: sets,
    sources: [source],
    coverage,
    verification,
  });
  return { course, notes };
}
