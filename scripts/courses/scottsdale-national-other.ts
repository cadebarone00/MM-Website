import type { CourseCard } from "../build-course-sql.ts";

/**
 * Scottsdale National Golf Club, The Other Course, 28265 N Scottsdale National Dr, Scottsdale, AZ 85262: found online by
 * The Maroon 2026-11-24 (owner asked for "Scottsdale National"), from GolfPass (hole-by-hole card on page 20795, ratings
 * on page 39029). The card's 3/4 hole 18 reads 210 (a par 5; 3 is 535, 4 is 510); the rated 3/4 length (6060) makes it
 * 530, used here (the owner's screenshot of the card, 2026-11-24, shows the same 210 / 5740). Tee 4's holes add up to
 * 5723 (rated length 5743). X tee yardages from the owner's screenshot 2026-11-24 (adds up to 7347).
 * The club's main course (Mineshaft) has no hole-by-hole card online yet.
 */
export const course: CourseCard = {
  slug: "scottsdale-national-other-scottsdale-az",
  name: "Scottsdale National Golf Club (The Other Course)",
  city: "Scottsdale", state: "AZ", timezone: "America/Phoenix", added: "2026-11-24",
  attribution: "Found online by The Maroon (GolfPass scorecard 20795 and tees 39029) plus owner screenshot, 2026-11-24",
  note: "Found online 2026-11-24 (GolfPass) plus owner screenshot (X tee). Tee 3/4 hole 18 corrected 210 → 530 from its rated length.",
  par: [4, 5, 3, 5, 4, 3, 4, 5, 3, 5, 3, 4, 3, 4, 5, 3, 4, 5],
  strokeIndex: [11, 3, 15, 9, 7, 13, 5, 1, 17, 6, 18, 14, 16, 8, 2, 12, 10, 4],
  tees: [
    { name: "X", color: "x", men: [74.1, 140], yards: [400, 567, 239, 575, 595, 222, 459, 568, 163, 540, 140, 423, 227, 492, 617, 182, 349, 589], total: 7347 },
    { name: "1", color: "1", men: [73.3, 136], women: [80.3, 146], yards: [400, 567, 239, 575, 519, 189, 419, 568, 163, 545, 140, 423, 227, 492, 617, 167, 326, 589], total: 7165 },
    { name: "1/2", color: "1/2", men: [72.1, 134], yards: [400, 543, 200, 553, 476, 189, 387, 568, 163, 545, 140, 423, 215, 472, 601, 167, 299, 589], total: 6930 },
    { name: "2", color: "2", men: [71.4, 132], women: [78.2, 141], yards: [384, 543, 200, 553, 476, 171, 387, 538, 145, 535, 134, 396, 215, 472, 601, 158, 299, 570], total: 6777 },
    { name: "2/3", color: "2/3", men: [69.7, 128], yards: [384, 512, 178, 520, 433, 171, 365, 538, 145, 498, 134, 396, 169, 439, 548, 158, 283, 535], total: 6406 },
    { name: "3", color: "3", men: [68.8, 125], women: [75.2, 135], yards: [359, 512, 178, 520, 433, 154, 365, 508, 134, 498, 125, 357, 169, 439, 548, 129, 283, 535], total: 6246 },
    { name: "3/4", color: "3/4", men: [67.8, 122], women: [73.9, 132], yards: [336, 512, 178, 520, 403, 154, 345, 508, 134, 460, 125, 357, 169, 418, 548, 129, 234, 530], total: 6060 },
    { name: "4", color: "4", men: [66.3, 118], women: [72.0, 126], yards: [336, 429, 146, 481, 403, 143, 345, 464, 115, 460, 117, 324, 157, 418, 528, 113, 234, 510], total: 5723 },
    { name: "5", color: "5", men: [63.1, 110], women: [67.8, 119], yards: [290, 413, 133, 424, 281, 129, 281, 425, 96, 410, 84, 278, 129, 370, 469, 98, 217, 469], total: 4996 },
    { name: "6", color: "6", men: [61.8, 106], women: [66.4, 116], yards: [290, 378, 133, 424, 281, 129, 281, 374, 96, 341, 84, 251, 129, 294, 469, 98, 217, 391], total: 4660 },
  ],
};
