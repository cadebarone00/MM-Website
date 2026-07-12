import type { VenueCourse, VenueSchedule } from "./types";

function blankHoles(): VenueCourse["holes"] {
  return Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: null, yards: null }));
}

const courses: VenueCourse[] = [
  { id: "tournament", name: "Mission Hills CC Tournament", par: null, yards: null, photos: [], holes: blankHoles() },
  { id: "arnold-palmer", name: "Mission Hills CC Arnold Palmer", par: null, yards: null, photos: [], holes: blankHoles() },
  { id: "pete-dye", name: "Mission Hills CC Pete Dye", par: null, yards: null, photos: [], holes: blankHoles() },
  { id: "north", name: "Mission Hills North Course", par: null, yards: null, photos: [], holes: blankHoles() },
  { id: "golf-course", name: "Mission Hills Golf Course", par: null, yards: null, photos: [], holes: blankHoles() },
];

export const venue2027: VenueSchedule = {
  year: 2027,
  venueName: "Mission Hills CC",
  courses,
  sessions: Array.from({ length: 8 }, (_, i) => ({ session: i + 1, courseId: null, format: null })),
};
