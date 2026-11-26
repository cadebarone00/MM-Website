import type { CourseCard } from "../build-course-sql.ts";

/**
 * Woodland Hills Golf Club, Nacogdoches, TX: from the published scorecard (Men's card), screenshots sent by the owner
 * 2026-11-24. The ratings table names tees differently; matched by length: Championship (6620) = Blue (card 6641),
 * Middle (6162) = White, Senior's (5137) = Gold (card 5124). Forward (W) has no hole yardages, so it's left off.
 */
export const course: CourseCard = {
  slug: "woodland-hills-nacogdoches-tx",
  name: "Woodland Hills Golf Club",
  city: "Nacogdoches", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's published scorecard (Men's card; owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Ratings matched to tees by length (Championship = Blue, Middle = White, Senior's = Gold); Forward (W) left off (no hole yardages).",
  par: [4, 4, 3, 4, 5, 3, 5, 4, 4, 5, 3, 4, 4, 3, 4, 4, 4, 5],
  strokeIndex: [11, 13, 9, 2, 3, 17, 8, 1, 7, 16, 10, 18, 4, 15, 5, 12, 6, 14],
  tees: [
    { name: "Blue", color: "blue", men: [72.0, 123], yards: [412, 367, 208, 418, 540, 156, 556, 395, 351, 508, 167, 327, 389, 204, 407, 354, 403, 479], total: 6641 },
    { name: "White", color: "white", men: [70.0, 115], yards: [387, 351, 144, 395, 510, 148, 534, 357, 328, 475, 152, 309, 375, 164, 388, 332, 348, 465], total: 6162 },
    { name: "Gold", color: "gold", men: [71.0, 117], yards: [287, 279, 115, 320, 410, 113, 467, 321, 265, 381, 138, 244, 328, 79, 325, 277, 329, 446], total: 5124 },
  ],
};
