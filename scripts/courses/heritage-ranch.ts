import type { CourseCard } from "../build-course-sql.ts";

/**
 * Heritage Ranch Golf & Country Club, Fairview, TX: from the published scorecard and tees table, screenshots sent by
 * the owner 2026-11-24 (the owner wrote "Fairfield"; Heritage Ranch is in Fairview, near McKinney). The tees table names
 * tees differently; matched by length: its Blue (6988) = Black, White (6472) = Blue, Bronze (6051) = White. Its Combo
 * (6228) has no hole yardages, so it's off. White/Gold, Gold, Red, Red/Green and Green have no rating on the page.
 */
export const course: CourseCard = {
  slug: "heritage-ranch-fairview-tx",
  name: "Heritage Ranch Golf & Country Club",
  city: "Fairview", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the published scorecard and tees table (owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Ratings matched to tees by length; five forward/combo tees have no rating; Combo 6228 left off (no hole yardages).",
  par: [4, 4, 5, 3, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4],
  strokeIndex: [11, 5, 13, 7, 1, 17, 3, 15, 9, 12, 14, 16, 2, 10, 18, 8, 6, 4],
  tees: [
    { name: "Black", color: "black", men: [73.6, 133], women: [80.2, 138], yards: [388, 406, 524, 210, 443, 173, 388, 571, 403, 385, 535, 182, 448, 388, 356, 208, 547, 433], total: 6988 },
    { name: "Blue", color: "blue", men: [71.0, 130], women: [77.4, 132], yards: [353, 383, 501, 192, 396, 156, 337, 534, 386, 358, 506, 160, 422, 362, 327, 182, 519, 398], total: 6472 },
    { name: "White", color: "white", men: [69.0, 124], women: [75.1, 127], yards: [343, 359, 485, 160, 385, 140, 322, 505, 322, 329, 476, 135, 400, 340, 320, 165, 499, 366], total: 6051 },
    { name: "White/Gold", color: "white/gold", yards: [343, 325, 468, 160, 364, 140, 305, 475, 322, 329, 446, 135, 364, 340, 320, 165, 458, 346], total: 5805 },
    { name: "Gold", color: "gold", yards: [320, 325, 468, 158, 364, 131, 305, 475, 319, 305, 446, 121, 364, 312, 304, 165, 458, 346], total: 5686 },
    { name: "Red", color: "red", yards: [264, 303, 421, 139, 298, 111, 256, 429, 306, 270, 401, 104, 322, 279, 273, 102, 385, 283], total: 4946 },
    { name: "Red/Green", color: "red/green", yards: [264, 303, 291, 139, 298, 111, 256, 350, 208, 270, 315, 104, 322, 279, 273, 102, 385, 235], total: 4505 },
    { name: "Green", color: "green", yards: [260, 225, 291, 139, 220, 111, 202, 350, 208, 268, 315, 104, 252, 212, 231, 102, 275, 235], total: 4000 },
  ],
};
