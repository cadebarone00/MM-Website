import type { CourseCard } from "../build-course-sql.ts";

/**
 * Diamond Oaks Country Club, Fort Worth, TX: from the course's printed scorecard, sent by the owner 2026-11-24. Par 70
 * (35 / 35). The Player's Course mixes the circled Black and Blue holes; it adds up to the card's 6,574 yards and is
 * rated 71.8/127 (M), 78.6/133 (W). Women's handicaps (not used): 3 17 9 5 15 13 1 11 7 / 4 8 12 10 2 18 16 6 14.
 */
export const course: CourseCard = {
  slug: "diamond-oaks-fort-worth-tx",
  name: "Diamond Oaks Country Club",
  city: "Fort Worth", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard (owner screenshot 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's handicaps; men's and women's ratings for every tee; Player's Course from the circled holes (6574, matches the card).",
  par: [4, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4],
  strokeIndex: [9, 13, 5, 11, 7, 1, 17, 15, 3, 8, 4, 16, 2, 18, 10, 14, 6, 12],
  tees: [
    { name: "Black", color: "black", men: [72.5, 130], women: [79.2, 133], yards: [419, 185, 408, 375, 559, 186, 327, 322, 440, 433, 426, 205, 444, 580, 425, 195, 381, 403], total: 6713 },
    { name: "Player's Course", color: "players", men: [71.8, 127], women: [78.6, 133], yards: [399, 166, 408, 375, 545, 186, 327, 322, 422, 420, 414, 191, 444, 566, 425, 180, 381, 403], total: 6574 },
    { name: "Blue", color: "blue", men: [71.3, 124], women: [77.8, 131], yards: [399, 166, 400, 360, 545, 178, 309, 316, 422, 420, 414, 191, 429, 566, 408, 180, 363, 392], total: 6458 },
    { name: "White", color: "white", men: [69.5, 121], women: [75.7, 127], yards: [377, 146, 378, 348, 526, 167, 291, 308, 402, 408, 397, 169, 381, 513, 386, 167, 337, 366], total: 6067 },
    { name: "Green", color: "green", men: [66.6, 116], women: [72.3, 121], yards: [337, 118, 330, 309, 483, 159, 283, 294, 347, 379, 333, 157, 341, 468, 352, 152, 320, 314], total: 5476 },
    { name: "Red", color: "red", men: [64.6, 111], women: [69.8, 116], yards: [303, 87, 274, 280, 424, 121, 283, 294, 327, 379, 312, 157, 307, 468, 282, 152, 307, 272], total: 5029 },
  ],
};
