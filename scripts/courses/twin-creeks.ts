import type { CourseCard } from "../build-course-sql.ts";

/**
 * The Golf Club at Twin Creeks, Allen, TX (Dallas area): from the published scorecard and tees table, screenshots sent
 * by the owner 2026-11-24 (owner: "in Dallas"; the club is in Allen, north of Dallas).
 */
export const course: CourseCard = {
  slug: "twin-creeks-allen-tx",
  name: "The Golf Club at Twin Creeks",
  city: "Allen", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the published scorecard and tees table (owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. One handicap row; men's ratings for Gold, Blue, White; women's for Red.",
  par: [5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 4, 5, 4, 3, 5, 4, 4],
  strokeIndex: [5, 9, 15, 1, 17, 11, 3, 7, 13, 18, 16, 6, 14, 10, 12, 4, 8, 2],
  tees: [
    { name: "Gold", color: "gold", men: [73.2, 131], yards: [555, 383, 189, 470, 346, 530, 215, 413, 407, 336, 162, 439, 505, 352, 157, 548, 412, 421], total: 6840 },
    { name: "Blue", color: "blue", men: [70.5, 123], yards: [516, 349, 176, 437, 315, 485, 190, 378, 374, 313, 149, 405, 458, 330, 133, 514, 381, 385], total: 6288 },
    { name: "White", color: "white", men: [67.3, 111], yards: [463, 309, 156, 396, 272, 436, 170, 357, 331, 274, 136, 384, 405, 277, 116, 491, 348, 330], total: 5651 },
    { name: "Red", color: "red", women: [66.5, 107], yards: [388, 252, 121, 304, 237, 369, 116, 303, 259, 218, 96, 303, 366, 232, 89, 369, 291, 289], total: 4602 },
  ],
};
