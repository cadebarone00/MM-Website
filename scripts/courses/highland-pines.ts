import type { CourseCard } from "../build-course-sql.ts";

/**
 * Highland Pines Golf Club, Porter, TX: from the course's printed scorecard (2022 card) and its rating table,
 * screenshots sent by the owner 2026-11-24. The card's handicap rows are blank, so there are no hole handicaps yet.
 */
export const course: CourseCard = {
  slug: "highland-pines-porter-tx",
  name: "Highland Pines Golf Club",
  city: "Porter", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard (2022) and rating table (owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. No hole handicaps on the card (rows blank); men's ratings for every tee, women's for Professional, Masters, Members.",
  par: [4, 4, 4, 3, 4, 5, 4, 3, 5, 4, 4, 3, 4, 4, 5, 4, 3, 5],
  tees: [
    { name: "Professional", color: "black", men: [75.1, 132], women: [81.4, 141], yards: [415, 425, 470, 249, 393, 610, 346, 183, 580, 415, 436, 203, 445, 417, 530, 457, 178, 555], total: 7307 },
    { name: "Masters", color: "green", men: [72.2, 130], women: [78.1, 135], yards: [380, 370, 427, 224, 380, 575, 325, 156, 539, 378, 405, 185, 403, 377, 500, 398, 168, 513], total: 6703 },
    { name: "Members", color: "gold", men: [69.3, 124], women: [74.7, 128], yards: [349, 344, 385, 204, 341, 490, 304, 134, 505, 344, 391, 151, 362, 347, 469, 359, 158, 471], total: 6108 },
    { name: "Forward", color: "white", men: [67.1, 118], yards: [327, 312, 343, 181, 303, 449, 276, 113, 473, 334, 366, 136, 350, 337, 444, 349, 148, 426], total: 5667 },
    { name: "First", color: "yellow", men: [64.1, 112], yards: [298, 266, 318, 160, 219, 410, 256, 97, 433, 291, 317, 107, 311, 297, 402, 309, 120, 388], total: 4999 },
  ],
};
