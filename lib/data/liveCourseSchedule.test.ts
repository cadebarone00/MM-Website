import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVenueCoursesFromLive } from "./liveCourseSchedule.ts";

test("buildVenueCoursesFromLive maps live holes to the public shape, sorted, with computed totals", () => {
  const result = buildVenueCoursesFromLive([
    {
      id: "course-1",
      name: "Mission Hills CC Tournament",
      holes: [
        { number: 2, par: 4, yards: 410 },
        { number: 1, par: 5, yards: 540 },
      ],
    },
  ]);

  assert.deepEqual(result, [
    {
      id: "course-1",
      name: "Mission Hills CC Tournament",
      par: 9,
      yards: 950,
      photos: [],
      holes: [
        { hole: 1, par: 5, yards: 540 },
        { hole: 2, par: 4, yards: 410 },
      ],
    },
  ]);
});

test("buildVenueCoursesFromLive gives a course with no holes a null par and yardage instead of zero", () => {
  const result = buildVenueCoursesFromLive([{ id: "course-2", name: "Empty Course", holes: [] }]);

  assert.equal(result[0].par, null);
  assert.equal(result[0].yards, null);
});
