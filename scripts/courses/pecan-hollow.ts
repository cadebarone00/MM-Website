import type { CourseCard } from "../build-course-sql.ts";

/**
 * Pecan Hollow Golf Course, Plano, TX: from a photo of the course's printed scorecard, sent by the owner 2026-11-24.
 * Par 71 (36 / 35). The card suggests tees by handicap (Championship 0-5, Tournament 6-13, Players 14-24, Gentlemen
 * 25+). Players has a second, shorter box on holes 6, 7, 9 and 16 (totals 6012 / 5925, both printed); the card's one
 * Players rating (68.4/118) is kept on the main Players tee and the shorter version is added without a rating.
 */
export const course: CourseCard = {
  slug: "pecan-hollow-plano-tx",
  name: "Pecan Hollow Golf Course",
  city: "Plano", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard (owner photo 2026-11-24)",
  note: "Owner sent the card 2026-11-24. One handicap row; one rating per tee (men's); Players Forward (shorter boxes on 6, 7, 9, 16) has no rating.",
  par: [4, 4, 5, 4, 3, 4, 4, 3, 5, 4, 3, 4, 4, 3, 4, 4, 5, 4],
  strokeIndex: [9, 5, 7, 11, 13, 1, 15, 17, 3, 10, 16, 18, 14, 12, 6, 2, 8, 4],
  tees: [
    { name: "Championship", color: "purple", men: [73.5, 129], yards: [413, 423, 569, 426, 204, 487, 403, 176, 561, 362, 186, 387, 358, 212, 395, 472, 545, 447], total: 7026 },
    { name: "Tournament", color: "green", men: [71.2, 127], yards: [378, 406, 533, 397, 187, 471, 370, 148, 529, 341, 166, 363, 341, 195, 365, 445, 497, 435], total: 6567 },
    { name: "Players", color: "silver", men: [68.4, 118], yards: [359, 356, 508, 363, 165, 434, 330, 145, 489, 300, 165, 292, 322, 174, 341, 428, 457, 384], total: 6012 },
    { name: "Players Forward", color: "silver forward", yards: [359, 356, 508, 363, 165, 399, 321, 145, 463, 300, 165, 292, 322, 174, 341, 411, 457, 384], total: 5925 },
    { name: "Gentlemen", color: "gold", men: [64.8, 104], yards: [341, 337, 468, 328, 142, 383, 278, 128, 421, 244, 136, 254, 287, 146, 303, 356, 403, 310], total: 5265 },
  ],
};
