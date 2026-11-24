import type { CourseCard } from "../build-course-sql.ts";

/**
 * The Park West Palm, West Palm Beach, FL: from the published scorecard with men's and ladies' ratings, screenshots
 * sent by the owner 2026-11-24. Par 71 (35 / 36). The ladies' tees use the same yardages as the men's.
 */
export const course: CourseCard = {
  slug: "the-park-west-palm-beach-fl",
  name: "The Park West Palm",
  city: "West Palm Beach", state: "FL", timezone: "America/New_York", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's published scorecard (owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. One handicap row; men's and ladies' ratings for each tee.",
  par: [5, 4, 3, 4, 3, 4, 3, 4, 5, 4, 3, 4, 4, 4, 5, 4, 3, 5],
  strokeIndex: [13, 9, 17, 3, 7, 11, 15, 1, 5, 10, 14, 4, 8, 2, 12, 18, 16, 6],
  tees: [
    { name: "Yellow", color: "yellow", men: [74.2, 139], women: [80.7, 147], yards: [564, 416, 158, 477, 260, 395, 201, 453, 586, 453, 186, 474, 430, 519, 510, 303, 174, 586], total: 7145 },
    { name: "Black", color: "black", men: [71.9, 134], women: [78.1, 140], yards: [540, 391, 140, 451, 227, 359, 185, 400, 550, 433, 171, 444, 405, 473, 494, 281, 164, 562], total: 6670 },
    { name: "Light Blue", color: "light blue", men: [69.1, 127], women: [75.0, 135], yards: [505, 360, 116, 386, 196, 324, 161, 379, 516, 411, 141, 403, 374, 443, 457, 261, 144, 534], total: 6111 },
    { name: "Sand", color: "sand", men: [66.7, 122], women: [72.1, 129], yards: [471, 327, 103, 365, 170, 279, 140, 349, 468, 382, 127, 372, 348, 414, 415, 246, 132, 487], total: 5595 },
    { name: "Green", color: "green", men: [62.9, 110], women: [67.2, 118], yards: [448, 268, 92, 324, 121, 250, 114, 290, 429, 308, 105, 264, 323, 390, 357, 196, 89, 399], total: 4767 },
  ],
};
