import type { CourseCard } from "../build-course-sql.ts";

/**
 * Neches Pines Golf Course, Diboll, TX: from a photo of the course's printed scorecard, sent by the owner 2026-11-24.
 * Every tee adds up to its printed total (Red's front reads 2845 in the photo, but its holes and its 5969 total make it
 * 2945). Gold is the ladies' tee with its own handicap row (not used; it lists 6 twice: 7 11 15 13 17 5 3 9 1 /
 * 12 18 6 8 14 4 10 6 2), so its rating is stored as women's.
 */
export const course: CourseCard = {
  slug: "neches-pines-diboll-tx",
  name: "Neches Pines Golf Course",
  city: "Diboll", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard (owner photo 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's handicaps; ratings from the card (Gold = ladies' tee, women's rating).",
  par: [5, 4, 3, 4, 3, 4, 4, 5, 4, 4, 4, 4, 4, 3, 4, 5, 3, 5],
  strokeIndex: [5, 11, 13, 9, 17, 3, 1, 7, 15, 4, 12, 10, 8, 14, 2, 18, 16, 6],
  tees: [
    { name: "Blue", color: "blue", men: [73.9, 133], yards: [553, 377, 193, 415, 183, 402, 416, 596, 445, 416, 369, 363, 394, 172, 422, 518, 192, 588], total: 7014 },
    { name: "White", color: "white", men: [71.8, 124], yards: [526, 350, 166, 389, 157, 375, 386, 571, 378, 396, 350, 342, 375, 152, 402, 498, 174, 548], total: 6535 },
    { name: "Silver", color: "silver", men: [70.6, 121], yards: [451, 350, 155, 389, 153, 348, 350, 506, 370, 390, 350, 345, 370, 152, 380, 479, 170, 494], total: 6202 },
    { name: "Red", color: "red", men: [69.2, 119], yards: [451, 319, 140, 329, 144, 348, 350, 506, 358, 375, 330, 322, 355, 133, 382, 479, 154, 494], total: 5969 },
    { name: "Gold", color: "gold", women: [71.4, 123], yards: [432, 293, 125, 299, 130, 329, 327, 483, 358, 315, 195, 322, 295, 133, 320, 409, 140, 474], total: 5379 },
  ],
};
