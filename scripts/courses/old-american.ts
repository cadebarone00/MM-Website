import type { CourseCard } from "../build-course-sql.ts";

/**
 * The Old American Golf Club, The Colony, TX: from the published scorecard and tees table, screenshots sent by the owner
 * 2026-11-24. Par 71 (35 / 36). Green/Blue's holes add up to 6772 (the tees table lists 6781). The tees table in the
 * screenshot ends at White/Red, so Red has no rating yet.
 */
export const course: CourseCard = {
  slug: "old-american-the-colony-tx",
  name: "The Old American Golf Club",
  city: "The Colony", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the published scorecard and tees table (owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. One handicap row; men's ratings for every tee but Red (not in the screenshot); women's for Blue, Blue/White, White.",
  par: [4, 5, 3, 4, 3, 5, 3, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4],
  strokeIndex: [8, 14, 16, 2, 10, 18, 12, 6, 4, 3, 7, 11, 9, 1, 15, 13, 17, 5],
  tees: [
    { name: "Leonard", color: "leonard", men: [75.2, 145], yards: [482, 556, 175, 469, 202, 500, 216, 368, 442, 484, 229, 409, 571, 489, 346, 154, 551, 441], total: 7084 },
    { name: "Green", color: "green", men: [74.1, 143], yards: [419, 539, 163, 448, 185, 500, 192, 368, 425, 468, 212, 400, 551, 476, 346, 154, 551, 432], total: 6829 },
    { name: "Green/Blue", color: "green/blue", men: [73.8, 141], yards: [414, 539, 163, 448, 185, 500, 192, 368, 425, 468, 189, 400, 551, 476, 346, 154, 522, 432], total: 6772 },
    { name: "Blue", color: "blue", men: [73.5, 139], women: [79.8, 151], yards: [414, 539, 163, 448, 185, 496, 192, 351, 419, 468, 189, 394, 551, 476, 335, 148, 522, 423], total: 6713 },
    { name: "Blue/White", color: "blue/white", men: [73.0, 138], women: [79.5, 149], yards: [408, 539, 163, 420, 170, 496, 166, 351, 419, 434, 171, 394, 523, 454, 335, 148, 491, 423], total: 6505 },
    { name: "White", color: "white", men: [72.0, 133], women: [77.8, 147], yards: [408, 516, 153, 420, 170, 473, 166, 319, 398, 434, 171, 375, 523, 454, 299, 131, 491, 393], total: 6294 },
    { name: "White/Red", color: "white/red", men: [69.5, 124], yards: [342, 516, 153, 334, 156, 473, 129, 319, 398, 362, 171, 375, 448, 348, 299, 109, 491, 339], total: 5762 },
    { name: "Red", color: "red", yards: [342, 416, 135, 334, 156, 406, 129, 272, 311, 362, 127, 297, 448, 348, 266, 109, 389, 339], total: 5186 },
  ],
};
