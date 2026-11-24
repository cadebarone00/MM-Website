import type { CourseCard } from "../build-course-sql.ts";

/**
 * Kierland Golf Club (Acacia/Mesquite), 15636 Clubgate Dr, Scottsdale, AZ 85254: found online by The Maroon 2026-11-24 (owner
 * asked for "Kierland"), from GolfPass's scorecard and tees page (course 15747). Kierland has three nines; each pairing
 * is its own 18.
 */
export const course: CourseCard = {
  slug: "kierland-acacia-mesquite-scottsdale-az",
  name: "Kierland Golf Club (Acacia/Mesquite)",
  city: "Scottsdale", state: "AZ", timezone: "America/Phoenix", added: "2026-11-24",
  attribution: "Found online by The Maroon (GolfPass scorecard and tees, golfpass.com/courses/15747), 2026-11-24",
  note: "Found online 2026-11-24 (GolfPass). One handicap row; men's and women's ratings.",
  par: [5, 4, 4, 3, 5, 3, 4, 3, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4],
  strokeIndex: [16, 8, 4, 18, 2, 12, 10, 14, 6, 11, 9, 17, 15, 5, 3, 7, 13, 1],
  tees: [
    { name: "Cinder", color: "cinder", men: [72.5, 127], yards: [517, 417, 448, 171, 568, 190, 374, 219, 531, 395, 410, 333, 187, 521, 468, 547, 190, 427], total: 6913 },
    { name: "Copper", color: "copper", men: [69.2, 124], yards: [493, 386, 402, 142, 542, 162, 339, 189, 503, 353, 375, 293, 154, 498, 423, 497, 158, 410], total: 6319 },
    { name: "Indigo", color: "indigo", men: [67.0, 114], women: [72.2, 126], yards: [468, 361, 369, 129, 488, 142, 310, 160, 485, 319, 349, 274, 132, 470, 369, 470, 142, 383], total: 5820 },
    { name: "Turquoise", color: "turquoise", men: [65.7, 110], women: [70.5, 120], yards: [468, 361, 369, 129, 418, 122, 310, 137, 485, 319, 307, 274, 110, 470, 338, 419, 142, 277], total: 5455 },
    { name: "Lava", color: "lava", men: [63.1, 106], women: [67.4, 113], yards: [423, 298, 284, 110, 418, 122, 232, 137, 409, 299, 307, 211, 110, 405, 338, 419, 99, 277], total: 4898 },
  ],
};
