import type { CourseCard } from "../build-course-sql.ts";

/**
 * Irving Golf Club, Irving, TX: from the course's printed scorecard, sent by the owner 2026-11-24. Par 71 (36 / 35).
 * The card prints men's ratings only (Red is marked "M").
 */
export const course: CourseCard = {
  slug: "irving-golf-club-irving-tx",
  name: "Irving Golf Club",
  city: "Irving", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard (owner screenshot 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's handicaps; men's ratings for every tee.",
  par: [4, 4, 4, 5, 3, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 5, 3],
  strokeIndex: [5, 1, 13, 11, 15, 17, 3, 7, 9, 2, 10, 16, 12, 8, 4, 14, 18, 6],
  tees: [
    { name: "Black", color: "black", men: [71.8, 127], yards: [381, 458, 346, 520, 189, 303, 426, 233, 538, 422, 376, 154, 374, 563, 446, 183, 547, 173], total: 6632 },
    { name: "Blue", color: "blue", men: [69.4, 120], yards: [353, 424, 338, 468, 159, 296, 378, 199, 471, 393, 366, 146, 365, 531, 401, 176, 512, 165], total: 6141 },
    { name: "White", color: "white", men: [67.5, 116], yards: [298, 376, 317, 460, 153, 273, 370, 191, 462, 370, 330, 128, 341, 522, 393, 147, 504, 132], total: 5767 },
    { name: "Red", color: "red", men: [63.8, 109], yards: [272, 368, 267, 418, 126, 237, 325, 138, 402, 264, 289, 111, 285, 468, 320, 141, 425, 92], total: 4948 },
  ],
};
