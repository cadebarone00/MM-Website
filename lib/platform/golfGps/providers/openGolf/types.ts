/**
 * OpenGolfAPI reply shapes — ONLY the fields The Maroon reads. Every field may be null or missing in real replies, so
 * the client validates before anything here is trusted. Nothing outside ./openGolf/ may import these.
 *
 * Seen live on 2026-10-05 (api.opengolfapi.org). Endpoint paths live in OPEN_GOLF_PATHS (./client.ts).
 */

/** One hit from the search reply (OPEN_GOLF_PATHS.search). */
export interface OpenGolfSearchCourse {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  par: number | null;
}

export interface OpenGolfSearchReply {
  courses: OpenGolfSearchCourse[];
  total: number | null;
}

/** One tee entry. OpenGolf lists the same tees once per gender ("blue-male", "blue-female"). */
export interface OpenGolfTee {
  tee_key: string | null;
  tee_name: string;
  tee_color: string | null;
  gender: string | null;
  course_rating: number | null;
  slope: number | null;
  par: number | null;
  yardage: number | null;
}

/**
 * One hole. `yardages` is keyed by lower-case tee name ({ blue: 393, white: 376 }). The geometry fields are listed
 * only so we can tell when OpenGolf starts sending them; their shape is unknown (always null so far), so they are
 * never read as geometry.
 */
export interface OpenGolfHole {
  number: number;
  par: number | null;
  handicap_index: number | null;
  yardages: Record<string, number>;
  /** Names of geometry fields that came back non-empty (tee_coords, green, green_polygon, hazards …). */
  geometryFieldsPresent: string[];
}

/** The course-detail reply (OPEN_GOLF_PATHS.courseDetail) — course info, tees and holes in one reply. */
export interface OpenGolfCourseDetail {
  id: string;
  course_name: string | null;
  club_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  /** "Public", "Private", "Resort", "Semi-Private", "Private/Resort", … */
  type: string | null;
  par: number | null;
  holes: number | null;
  architect: string | null;
  year_built: number | null;
  phone: string | null;
  website: string | null;
  tees: OpenGolfTee[];
  holes_data: OpenGolfHole[];
}
