import type { CourseCard } from "../build-course-sql.ts";

/**
 * Sherrill Park Golf Course, Course #1, Richardson, TX (Dallas area): from the published scorecard and tees table,
 * screenshots sent by the owner 2026-11-24 (owner: "in Dallas"; Sherrill Park is in Richardson). The park has two
 * courses; this is Course #1.
 */
export const course: CourseCard = {
  slug: "sherrill-park-1-richardson-tx",
  name: "Sherrill Park Golf Course (Course #1)",
  city: "Richardson", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the published scorecard and tees table (owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. One handicap row; men's ratings for Pro, Champion, Middle; women's for Middle and Forward.",
  par: [5, 4, 3, 4, 5, 3, 4, 4, 4, 4, 5, 4, 3, 5, 3, 4, 4, 4],
  strokeIndex: [10, 2, 18, 14, 6, 16, 8, 4, 12, 5, 3, 11, 17, 9, 15, 13, 1, 7],
  tees: [
    { name: "Pro", color: "pro", men: [74.4, 132], yards: [524, 389, 197, 336, 541, 177, 423, 437, 403, 412, 524, 400, 174, 599, 188, 436, 433, 423], total: 7016 },
    { name: "Champion", color: "champion", men: [70.2, 125], yards: [504, 345, 177, 311, 504, 156, 386, 407, 361, 362, 488, 375, 148, 564, 167, 401, 411, 395], total: 6462 },
    { name: "Middle", color: "middle", men: [68.0, 121], women: [73.7, 131], yards: [484, 303, 142, 295, 466, 139, 350, 321, 328, 332, 459, 330, 123, 515, 125, 342, 351, 321], total: 5726 },
    { name: "Forward", color: "forward", women: [69.4, 124], yards: [441, 274, 95, 261, 440, 109, 326, 298, 295, 247, 408, 275, 101, 412, 105, 316, 326, 281], total: 5010 },
  ],
};
