import type { CourseCard } from "../build-course-sql.ts";

/**
 * The Clubs at Houston Oaks, 22602 Hegar Rd, Hockley, TX 77447: found online by The Maroon 2026-11-24 (owner asked
 * for "Houston Oaks"), from GolfPass's scorecard and tees page (course 3002). The page's scorecard tee names don't match
 * its ratings table, so tees are named and rated by matching lengths: 6249 = Member, 5947 = Club, 5334 = Combo,
 * 5221 = Forward (the card shows two identical rows for 5334 and for 5221). Club's men's slope is printed "1256"; 125 is
 * used. The table's Oaks (6623) and men's Combo (6437) have no hole yardages, so they're off.
 * Women's handicaps (not used): 17 7 9 1 13 5 11 3 15 / 16 14 18 10 4 12 2 6 8.
 */
export const course: CourseCard = {
  slug: "houston-oaks-hockley-tx",
  name: "The Clubs at Houston Oaks",
  city: "Hockley", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Found online by The Maroon (GolfPass scorecard and tees, golfpass.com/courses/3002), 2026-11-24",
  note: "Found online 2026-11-24 (GolfPass). Tees matched to ratings by length; Club men's slope printed 1256, 125 used; Oaks 6623 / Combo 6437 left off (no hole yardages).",
  par: [4, 4, 4, 5, 3, 4, 3, 5, 3, 4, 5, 4, 3, 4, 3, 5, 4, 4],
  strokeIndex: [9, 3, 11, 5, 13, 7, 17, 1, 15, 8, 4, 14, 16, 12, 18, 2, 6, 10],
  tees: [
    { name: "Championship", color: "championship", men: [74.0, 135], yards: [381, 443, 373, 580, 145, 472, 229, 537, 207, 397, 521, 430, 230, 451, 204, 558, 420, 429], total: 7007 },
    { name: "Member", color: "member", men: [70.6, 128], yards: [348, 401, 339, 536, 120, 437, 191, 486, 167, 351, 479, 387, 189, 411, 172, 502, 365, 368], total: 6249 },
    { name: "Club", color: "club", men: [69.3, 125], women: [74.0, 127], yards: [321, 394, 331, 528, 110, 412, 176, 476, 129, 344, 472, 366, 175, 388, 166, 487, 330, 342], total: 5947 },
    { name: "Combo", color: "combo", women: [70.9, 122], yards: [321, 314, 331, 450, 95, 317, 135, 425, 129, 322, 418, 319, 152, 316, 156, 462, 330, 342], total: 5334 },
    { name: "Forward", color: "forward", men: [66.0, 114], women: [70.5, 120], yards: [301, 314, 324, 450, 95, 317, 135, 425, 123, 322, 418, 319, 152, 316, 156, 462, 283, 309], total: 5221 },
    { name: "Wee", color: "wee", women: [65.6, 110], yards: [264, 243, 248, 387, 50, 281, 120, 379, 98, 286, 352, 243, 118, 239, 148, 414, 234, 235], total: 4339 },
  ],
};
