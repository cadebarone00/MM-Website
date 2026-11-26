import type { CourseCard } from "../build-course-sql.ts";

/**
 * Eagle's Bluff Country Club, 700 Eagles Bluff Blvd, Bullard, TX: from a photo of the course's printed scorecard plus
 * its published ratings, both sent by the owner 2026-11-24. Par 71 (36 / 35). Combo tees follow the card's arrows
 * (▲ = the tee above, ▼ = the tee below): Gold/Blue totals 6614 (matches the card); Blue/White totals 6016 (the card's
 * tiny printed total is too blurry to read). Red has no published rating. The card's women's handicaps (not used):
 * 7 17 15 5 13 1 9 3 11 / 8 10 6 18 12 16 14 4 2.
 */
export const course: CourseCard = {
  slug: "eagles-bluff-bullard-tx",
  name: "Eagle's Bluff Country Club",
  city: "Bullard", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard and published ratings (owner photo + screenshot 2026-11-24)",
  note: "Owner sent the card and ratings 2026-11-24. Men's handicaps; men's and ladies' ratings; combo tees from the card's arrows; Red has no rating.",
  par: [5, 3, 4, 4, 3, 5, 4, 4, 4, 4, 4, 5, 3, 4, 3, 4, 4, 4],
  strokeIndex: [9, 17, 13, 3, 15, 1, 11, 7, 5, 8, 10, 2, 18, 6, 16, 14, 12, 4],
  tees: [
    { name: "Gold", color: "gold", men: [76.1, 155], women: [83.6, 155], yards: [529, 194, 387, 433, 220, 543, 385, 401, 432, 424, 402, 521, 208, 422, 210, 380, 452, 434], total: 6977 },
    { name: "Gold/Blue", color: "gold/blue", men: [74.2, 154], women: [82.1, 155], yards: [529, 167, 387, 392, 180, 543, 385, 401, 382, 389, 402, 497, 165, 395, 178, 380, 408, 434], total: 6614 },
    { name: "Blue", color: "blue", men: [72.5, 148], women: [80.1, 153], yards: [510, 167, 351, 392, 180, 502, 343, 383, 382, 389, 363, 497, 165, 395, 178, 353, 408, 405], total: 6363 },
    { name: "Blue/White", color: "blue/white", men: [71.0, 143], women: [77.8, 148], yards: [510, 167, 320, 347, 180, 502, 343, 383, 365, 335, 324, 497, 165, 340, 178, 353, 359, 348], total: 6016 },
    { name: "White", color: "white", men: [69.8, 134], women: [74.9, 142], yards: [465, 130, 320, 347, 150, 460, 296, 343, 365, 335, 324, 439, 131, 340, 128, 297, 359, 348], total: 5577 },
    { name: "Red", color: "red", yards: [424, 100, 296, 312, 115, 425, 271, 298, 290, 304, 284, 405, 100, 303, 103, 266, 324, 316], total: 4936 },
  ],
};
