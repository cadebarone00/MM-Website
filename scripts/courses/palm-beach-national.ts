import type { CourseCard } from "../build-course-sql.ts";

/**
 * Palm Beach National Golf Club, Lake Worth, FL 33467: from the published scorecard with ratings, screenshot sent by
 * the owner 2026-11-24. Men's par 72. White's hole yardages add up to 6206, but the card's summary says 6306; the hole
 * numbers are used (total 6206). The card gives women par 4 on hole 1 (men par 5); one par per hole is stored, the men's.
 * Women's handicaps (not used): 15 3 17 5 7 11 1 13 9 / 10 16 12 2 14 8 18 4 6.
 */
export const course: CourseCard = {
  slug: "palm-beach-national-lake-worth-fl",
  name: "Palm Beach National Golf Club",
  city: "Lake Worth", state: "FL", timezone: "America/New_York", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's published scorecard (owner screenshot 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's par and handicaps; men's and ladies' ratings; White uses its hole yardages (6206; the card's summary says 6306).",
  par: [5, 4, 3, 4, 4, 4, 5, 3, 4, 4, 3, 4, 4, 5, 4, 4, 4, 4],
  strokeIndex: [17, 9, 15, 5, 3, 1, 13, 11, 7, 2, 18, 10, 4, 16, 8, 12, 6, 14],
  tees: [
    { name: "Black", color: "black", men: [73.0, 132], yards: [511, 390, 165, 407, 426, 414, 505, 179, 371, 418, 160, 360, 420, 509, 390, 397, 356, 358], total: 6736 },
    { name: "Blue", color: "blue", men: [71.6, 129], yards: [501, 384, 153, 394, 412, 407, 488, 165, 363, 406, 156, 356, 414, 496, 382, 386, 347, 345], total: 6555 },
    { name: "White", color: "white", men: [70.0, 125], women: [75.9, 135], yards: [481, 370, 141, 352, 391, 395, 475, 153, 352, 376, 145, 344, 385, 476, 358, 363, 334, 315], total: 6206 },
    { name: "Gold", color: "gold", men: [67.6, 121], women: [73.0, 129], yards: [405, 327, 130, 317, 369, 326, 452, 143, 311, 364, 135, 304, 345, 415, 333, 329, 318, 299], total: 5622 },
    { name: "Red", color: "red", women: [69.2, 121], yards: [393, 290, 93, 272, 300, 277, 425, 119, 279, 318, 130, 299, 329, 400, 318, 262, 302, 280], total: 5086 },
  ],
};
