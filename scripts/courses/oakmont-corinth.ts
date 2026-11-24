import type { CourseCard } from "../build-course-sql.ts";

/**
 * Oakmont Country Club, Corinth, TX: from the published scorecard and tees table, screenshots sent by the owner
 * 2026-11-24. The tees table's "Black" (6799) is the card's Gold (6801), matched by length. Blue/White has no rating.
 */
export const course: CourseCard = {
  slug: "oakmont-corinth-tx",
  name: "Oakmont Country Club",
  city: "Corinth", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the published scorecard and tees table (owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. One handicap row; Gold rated as the table's Black (6799 ≈ 6801); Blue/White has no rating; Red women's only.",
  par: [4, 4, 5, 3, 4, 5, 4, 3, 4, 4, 4, 3, 5, 4, 5, 4, 3, 4],
  strokeIndex: [15, 5, 13, 9, 1, 11, 7, 17, 3, 4, 10, 14, 6, 12, 18, 2, 16, 8],
  tees: [
    { name: "Gold", color: "gold", men: [72.6, 127], yards: [362, 352, 524, 195, 393, 567, 405, 173, 433, 418, 387, 172, 567, 316, 533, 420, 162, 422], total: 6801 },
    { name: "Blue", color: "blue", men: [71.1, 121], yards: [340, 340, 508, 183, 368, 542, 383, 152, 414, 389, 369, 152, 540, 306, 474, 395, 140, 401], total: 6396 },
    { name: "Blue/White", color: "blue/white", yards: [340, 340, 508, 132, 368, 494, 383, 152, 360, 346, 313, 152, 540, 306, 474, 354, 140, 401], total: 6103 },
    { name: "White", color: "white", men: [67.4, 113], yards: [305, 326, 460, 132, 351, 494, 353, 130, 360, 346, 313, 136, 523, 285, 451, 354, 138, 330], total: 5787 },
    { name: "Red", color: "red", women: [69.2, 118], yards: [250, 292, 450, 103, 302, 388, 275, 122, 355, 283, 266, 127, 457, 256, 405, 293, 123, 266], total: 5013 },
  ],
};
