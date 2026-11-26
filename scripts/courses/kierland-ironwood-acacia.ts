import type { CourseCard } from "../build-course-sql.ts";

/**
 * Kierland Golf Club (Ironwood/Acacia), 15636 Clubgate Dr, Scottsdale, AZ 85254: found online by The Maroon 2026-11-24 (owner
 * asked for "Kierland"), from GolfPass's scorecard and tees page (course 15748). Kierland has three nines; each pairing
 * is its own 18.
 */
export const course: CourseCard = {
  slug: "kierland-ironwood-acacia-scottsdale-az",
  name: "Kierland Golf Club (Ironwood/Acacia)",
  city: "Scottsdale", state: "AZ", timezone: "America/Phoenix", added: "2026-11-24",
  attribution: "Found online by The Maroon (GolfPass scorecard and tees, golfpass.com/courses/15748), 2026-11-24",
  note: "Found online 2026-11-24 (GolfPass). One handicap row; men's and women's ratings.",
  par: [4, 4, 3, 4, 3, 4, 5, 4, 5, 5, 4, 4, 3, 5, 3, 4, 3, 5],
  strokeIndex: [1, 5, 17, 7, 13, 11, 15, 9, 3, 16, 8, 4, 18, 2, 12, 10, 14, 6],
  tees: [
    { name: "Cinder", color: "cinder", men: [72.8, 128], yards: [440, 418, 188, 423, 200, 412, 532, 431, 495, 517, 417, 448, 171, 568, 190, 374, 219, 531], total: 6974 },
    { name: "Copper", color: "copper", men: [69.3, 122], yards: [405, 394, 136, 376, 165, 379, 485, 365, 474, 493, 386, 402, 142, 542, 162, 339, 189, 503], total: 6337 },
    { name: "Indigo", color: "indigo", men: [67.2, 114], women: [72.3, 126], yards: [377, 364, 119, 357, 139, 347, 456, 331, 453, 468, 361, 369, 129, 488, 142, 310, 160, 485], total: 5855 },
    { name: "Turquoise", color: "turquoise", men: [66.3, 111], women: [70.9, 123], yards: [352, 303, 105, 357, 139, 347, 432, 288, 453, 468, 361, 369, 129, 418, 122, 310, 137, 485], total: 5575 },
    { name: "Lava", color: "lava", men: [63.6, 106], women: [67.3, 118], yards: [352, 303, 105, 289, 87, 298, 432, 288, 398, 423, 298, 284, 110, 418, 122, 232, 137, 409], total: 4985 },
  ],
};
