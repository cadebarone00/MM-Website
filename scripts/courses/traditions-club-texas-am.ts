import type { CourseCard } from "../build-course-sql.ts";

/**
 * The Traditions Club at Texas A&M, College Station area, TX (the club's mailing address is Bryan): from the published
 * scorecard and tees table, screenshots sent by the owner 2026-11-24. Black's tees-table rating (74.5/145) is almost the
 * same as Maroon's though 650 yards shorter; GolfPass's hole-by-hole page lists Black men's 72.7/147, which fits between
 * Maroon and Gold, so that's used. Combos (Maroon/Black, Gold/White) have no rating.
 */
export const course: CourseCard = {
  slug: "traditions-club-texas-am-college-station-tx",
  name: "The Traditions Club at Texas A&M",
  city: "College Station", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the published scorecard and tees table (owner screenshots 2026-11-24); Black rating from GolfPass",
  note: "Owner sent the card 2026-11-24. Men's handicaps; Black rating 72.7/147 (the tees table's 74.5/145 looks wrong); combos have no rating.",
  par: [4, 4, 5, 4, 3, 5, 4, 4, 3, 5, 3, 4, 4, 4, 5, 3, 4, 4],
  strokeIndex: [9, 5, 3, 13, 17, 1, 7, 11, 15, 2, 18, 12, 14, 8, 6, 16, 4, 10],
  tees: [
    { name: "Maroon", color: "maroon", men: [74.6, 151], yards: [429, 387, 539, 354, 192, 584, 439, 412, 216, 559, 182, 428, 381, 407, 551, 190, 427, 444], total: 7121 },
    { name: "Maroon/Black", color: "maroon/black", yards: [391, 387, 539, 354, 163, 525, 384, 412, 183, 559, 182, 381, 381, 407, 551, 190, 371, 395], total: 6755 },
    { name: "Black", color: "black", men: [72.7, 147], yards: [391, 356, 511, 339, 163, 525, 384, 380, 183, 529, 156, 381, 331, 369, 509, 189, 371, 395], total: 6462 },
    { name: "Gold", color: "gold", men: [70.1, 142], women: [77.9, 150], yards: [343, 331, 488, 324, 158, 516, 374, 371, 165, 520, 140, 372, 322, 361, 486, 143, 362, 387], total: 6163 },
    { name: "Gold/White", color: "gold/white", yards: [343, 331, 488, 324, 158, 483, 261, 296, 165, 427, 140, 372, 322, 287, 486, 143, 282, 318], total: 5626 },
    { name: "White", color: "white", men: [64.8, 132], women: [71.8, 126], yards: [292, 242, 403, 248, 136, 483, 261, 296, 141, 427, 132, 284, 246, 287, 386, 100, 282, 318], total: 4964 },
  ],
};
