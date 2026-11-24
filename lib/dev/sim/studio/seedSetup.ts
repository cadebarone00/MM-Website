import { SAMPLE_COURSES, type SampleCourse } from "./courses";
import type { StudioSetup } from "./setup";
import type { SimFake, SimPerson, SimSeeded } from "../types";

const FEATURES = {
  scorecard: true, teeCoordinates: false, greenPoints: false, greenPolygons: false, fairways: false, hazardLocations: false,
  hazardPolygons: false, holeBoundaries: false, centerlines: false, elevation: false, greenSlope: false,
};
const COVERAGE = { level: "scorecard", features: FEATURES };
const VERIFICATION = { status: "imported" };
const LICENSE = "GolfCourseAPI-terms";

/**
 * The sample course as the course library stores it (the same payload shape the real save_golf_course takes), so the real
 * search and scorecard route find it. Its ref is stored as a golf_course_api id, which is how a library course answers a ref.
 */
export function coursePayload(course: SampleCourse) {
  const [city, state] = course.place.split(",").map((s) => s.trim());
  return {
    course: { name: course.name, address: { city, state }, hole_count: course.par.length, coverage: COVERAGE, coverage_level: "scorecard", verification: VERIFICATION },
    external_ids: [{ provider: "golf_course_api", id: course.ref }],
    sources: [],
    tee_sets: course.tees.map((tee) => ({
      key: tee.name.toLowerCase(), name: tee.name, license: LICENSE,
      ratings: tee.rating === null || tee.slope === null ? [] : [{ gender: "men", courseRating: tee.rating, slopeRating: tee.slope }],
    })),
    holes: course.par.map((par, i) => ({
      number: i + 1, par, ...(course.strokeIndex?.[i] ? { stroke_index: course.strokeIndex[i] } : {}),
      coverage: COVERAGE, coverage_level: "scorecard", verification: VERIFICATION, tees: [], features: [],
    })),
  };
}

/**
 * A fresh rehearsal from the Studio's setup form: one finished account per player (username = key, display name = name) and
 * the sample course in the course library. No round: the phones start it themselves through the real screens. Inviting
 * players needs no friendships (the invite search finds any account by name).
 */
export async function seedSetup(fake: SimFake, setup: StudioSetup): Promise<SimSeeded> {
  const course = SAMPLE_COURSES.find((c) => c.ref === setup.course);
  if (!course) throw new Error(`Unknown sample course: ${setup.course}`);
  const people: SimPerson[] = [];
  for (const p of setup.players) {
    const user = await fake.addUser({ name: p.key });
    await fake.db.query("update profiles set display_name = $2 where id = $1", [user.id, p.name.trim()]);
    people.push({ key: p.key, name: p.name.trim(), id: user.id, token: user.token });
  }
  const host = people.find((p) => p.key === setup.host);
  if (!host) throw new Error("The host must be one of the players.");
  await fake.db.query("select save_golf_course($1::jsonb)", [JSON.stringify(coursePayload(course))]);
  return {
    people,
    phones: people.map((p) => ({ person: p.key, label: p.name, startPath: "/" })),
    refs: { host: host.id },
  };
}
