import type { CourseCard } from "../build-course-sql.ts";

/**
 * Lumberjack National, Nacogdoches, TX: from the course's published scorecard (Men's card), screenshots sent by the
 * owner 2026-11-24. Every tee's front / back / total yardage was checked against the card's printed totals.
 */
export const course: CourseCard = {
  slug: "lumberjack-national-nacogdoches-tx",
  name: "Lumberjack National",
  city: "Nacogdoches", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's published scorecard (Men's card; owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's handicaps; men's and women's ratings for each tee.",
  par: [5, 4, 3, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5, 3, 4, 4, 3],
  strokeIndex: [17, 15, 5, 1, 13, 9, 11, 3, 7, 6, 18, 14, 8, 2, 10, 12, 4, 16],
  tees: [
    { name: "Blue", color: "blue", men: [71.7, 140], women: [78.9, 150], yards: [454, 278, 157, 364, 450, 361, 177, 405, 408, 380, 537, 316, 386, 540, 162, 318, 422, 150], total: 6265 },
    { name: "White", color: "white", men: [69.8, 134], women: [76.1, 142], yards: [442, 272, 144, 330, 436, 326, 145, 356, 382, 367, 462, 307, 375, 515, 158, 311, 381, 140], total: 5849 },
    { name: "Gold", color: "gold", men: [66.5, 122], women: [71.8, 131], yards: [362, 263, 115, 285, 400, 307, 138, 282, 345, 337, 372, 297, 309, 461, 117, 308, 322, 136], total: 5156 },
    { name: "Red", color: "red", men: [65.4, 121], women: [70.3, 127], yards: [356, 256, 113, 282, 397, 280, 131, 236, 340, 334, 369, 210, 269, 376, 116, 303, 320, 128], total: 4816 },
    { name: "Pink", color: "pink", men: [62.7, 116], women: [66.0, 119], yards: [318, 173, 112, 223, 297, 270, 121, 211, 263, 262, 315, 182, 245, 372, 115, 214, 249, 122], total: 4064 },
    { name: "Short", color: "short", men: [54.1, 99], yards: [105, 92, 115, 120, 126, 140, 130, 89, 115, 113, 138, 109, 128, 118, 115, 107, 100, 130], total: 2090 },
  ],
};
