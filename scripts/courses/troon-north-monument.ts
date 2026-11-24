import type { CourseCard } from "../build-course-sql.ts";

/**
 * Monument at Troon North Golf Club, 10320 E Dynamite Blvd, Scottsdale, AZ 85255: found online by The Maroon
 * 2026-11-24 (GolfPass), then checked against the club's printed card the owner sent the same day (every yardage, par
 * and handicap matches). The card has two Copper/Jade combos: men's (circled holes, 5496, 66.9/123) and ladies'
 * (arrowed holes, 5544, 71.4/129; the same row GolfPass shows). Combo totals aren't printed; they're the holes added up.
 * Women's handicaps (GolfPass, not used): 7 15 1 13 5 11 17 9 3 / 12 6 10 18 2 14 16 4 8.
 */
export const course: CourseCard = {
  slug: "troon-north-monument-scottsdale-az",
  name: "Troon North Golf Club (Monument)",
  city: "Scottsdale", state: "AZ", timezone: "America/Phoenix", added: "2026-11-24",
  attribution: "The club's printed scorecard (owner screenshot) and GolfPass (golfpass.com/courses/15732), 2026-11-24",
  note: "Club card checked 2026-11-24. Men's handicaps; men's and ladies' ratings; men's and ladies' Copper/Jade combos.",
  par: [4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 5, 4, 3, 5, 4, 3, 4, 4],
  strokeIndex: [5, 17, 3, 11, 1, 13, 15, 9, 7, 10, 6, 8, 18, 4, 14, 16, 2, 12],
  tees: [
    { name: "Black", color: "black", men: [73.3, 148], yards: [444, 172, 556, 420, 464, 306, 205, 408, 530, 396, 512, 426, 222, 570, 299, 244, 495, 370], total: 7039 },
    { name: "Gold", color: "gold", men: [72.1, 139], yards: [411, 165, 544, 370, 435, 295, 190, 403, 520, 384, 504, 411, 206, 541, 283, 234, 455, 365], total: 6716 },
    { name: "Silver", color: "silver", men: [69.8, 132], women: [75.2, 136], yards: [400, 154, 502, 340, 419, 285, 172, 352, 465, 375, 460, 338, 196, 495, 275, 222, 422, 348], total: 6220 },
    { name: "Copper", color: "copper", men: [68.5, 127], women: [72.9, 131], yards: [370, 150, 466, 328, 389, 275, 140, 314, 440, 337, 451, 331, 173, 475, 229, 213, 405, 335], total: 5821 },
    { name: "Copper/Jade", color: "copper/jade", men: [66.9, 123], yards: [300, 150, 466, 328, 335, 275, 140, 314, 415, 280, 402, 331, 173, 440, 229, 213, 370, 335], total: 5496 },
    { name: "Copper/Jade (Ladies)", color: "copper/jade ladies", women: [71.4, 129], yards: [370, 114, 466, 328, 335, 275, 140, 314, 415, 337, 402, 331, 144, 440, 229, 164, 405, 335], total: 5544 },
    { name: "Jade", color: "jade", men: [65.0, 119], women: [68.6, 119], yards: [300, 114, 456, 256, 335, 261, 105, 308, 415, 280, 402, 260, 144, 440, 221, 164, 370, 253], total: 5084 },
  ],
};
