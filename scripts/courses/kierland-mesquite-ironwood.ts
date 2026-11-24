import type { CourseCard } from "../build-course-sql.ts";

/**
 * Kierland Golf Club (Mesquite/Ironwood), 15636 Clubgate Dr, Scottsdale, AZ 85254: found online by The Maroon 2026-11-24 (owner
 * asked for "Kierland"), from GolfPass's scorecard and tees page (course 15746). Kierland has three nines; each pairing
 * is its own 18. Junior (3139) is a short family tee.
 */
export const course: CourseCard = {
  slug: "kierland-mesquite-ironwood-scottsdale-az",
  name: "Kierland Golf Club (Mesquite/Ironwood)",
  city: "Scottsdale", state: "AZ", timezone: "America/Phoenix", added: "2026-11-24",
  attribution: "Found online by The Maroon (GolfPass scorecard and tees, golfpass.com/courses/15746), 2026-11-24",
  note: "Found online 2026-11-24 (GolfPass). One handicap row; men's and women's ratings.",
  par: [4, 4, 4, 3, 5, 4, 5, 3, 4, 4, 4, 3, 4, 3, 4, 5, 4, 5],
  strokeIndex: [12, 10, 18, 16, 6, 4, 8, 14, 2, 1, 5, 17, 7, 13, 11, 15, 9, 3],
  tees: [
    { name: "Cinder", color: "cinder", men: [73.1, 127], yards: [395, 410, 333, 187, 521, 468, 547, 190, 427, 440, 418, 188, 423, 200, 412, 532, 431, 495], total: 7017 },
    { name: "Copper", color: "copper", men: [69.7, 123], yards: [353, 375, 293, 154, 498, 423, 497, 158, 410, 405, 394, 136, 376, 165, 379, 485, 365, 474], total: 6340 },
    { name: "Indigo", color: "indigo", men: [67.2, 113], women: [72.3, 126], yards: [319, 349, 274, 132, 470, 369, 470, 142, 383, 377, 364, 119, 357, 139, 347, 456, 331, 453], total: 5851 },
    { name: "Turquoise", color: "turquoise", men: [65.6, 109], women: [70.1, 117], yards: [319, 307, 274, 110, 470, 338, 419, 142, 277, 352, 303, 105, 357, 139, 347, 432, 288, 453], total: 5432 },
    { name: "Lava", color: "lava", men: [63.7, 105], women: [67.7, 112], yards: [299, 307, 211, 110, 405, 338, 419, 99, 277, 352, 303, 105, 289, 87, 298, 432, 288, 398], total: 5017 },
    { name: "Junior", color: "junior", men: [57.0, 91], yards: [150, 176, 141, 85, 268, 176, 288, 99, 135, 212, 174, 105, 185, 87, 150, 300, 164, 244], total: 3139 },
  ],
};
