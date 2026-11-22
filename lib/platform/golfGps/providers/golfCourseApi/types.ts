/**
 * GolfCourseAPI reply shapes — ONLY the fields The Maroon reads, after the client has checked them. Any field may be
 * missing in a real reply, so nothing here is trusted until ./client.ts has validated it. Nothing outside
 * ./golfCourseApi/ may import these.
 *
 * Source: api.golfcourseapi.com/docs/api/openapi.yml (v1.4.0, read 2026-11-21) and live replies the same day.
 */

/** One hit from GET /v1/search (a condensed course: no tee boxes, only a count of them). */
export interface GolfCourseApiSearchCourse {
  id: string;
  clubName: string | null;
  courseName: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** One hole inside a tee box. GolfCourseAPI lists holes in order and gives no hole numbers: index 0 = hole 1. */
export interface GolfCourseApiHole {
  par: number | null;
  yardage: number | null;
  handicap: number | null;
}

/** One tee box. GolfCourseAPI groups tee boxes by gender (`tees.male`, `tees.female`). */
export interface GolfCourseApiTeeBox {
  gender: "male" | "female";
  teeName: string;
  courseRating: number | null;
  slopeRating: number | null;
  totalYards: number | null;
  numberOfHoles: number | null;
  parTotal: number | null;
  holes: GolfCourseApiHole[];
}

/** GET /v1/courses/{id}. */
export interface GolfCourseApiCourse {
  id: string;
  clubName: string | null;
  courseName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Male tee boxes first, then female, each in GolfCourseAPI's order. */
  tees: GolfCourseApiTeeBox[];
}
