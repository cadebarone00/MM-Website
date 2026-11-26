import type { CourseCard } from "../build-course-sql.ts";

/**
 * RainDance National, Windsor, CO: from the course's printed scorecard (12/2025 card), sent by the owner 2026-11-24.
 * Combo tees follow the card's arrows (▲ = the tee above, ▼ = the tee below); each combo's total matches the card
 * (7311, 6563, 5970, 5124). Hole 17 has a second, shorter box on Purple (142), Blue (132) and White (123); the card's
 * main totals use the longer one, and so does this. Ladies' handicaps (not used): 14 12 16 4 2 18 6 10 8 / 9 7 11 3 13 5 17 15 1.
 */
export const course: CourseCard = {
  slug: "raindance-national-windsor-co",
  name: "RainDance National",
  city: "Windsor", state: "CO", timezone: "America/Denver", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard (12/2025; owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's handicaps; men's and ladies' ratings; combo tees from the card's arrows; hole 17 uses the longer box.",
  par: [4, 5, 4, 4, 4, 3, 5, 3, 4, 4, 4, 3, 5, 3, 4, 5, 3, 5],
  strokeIndex: [13, 11, 15, 1, 3, 17, 5, 9, 7, 4, 12, 10, 6, 18, 8, 14, 16, 2],
  tees: [
    { name: "Tour", color: "tour", men: [80.5, 155], yards: [493, 713, 362, 587, 597, 195, 617, 270, 501, 602, 384, 220, 752, 217, 541, 594, 197, 621], total: 8463 },
    { name: "Purple", color: "purple", men: [76.6, 149], yards: [467, 656, 332, 552, 543, 176, 591, 223, 452, 543, 373, 201, 653, 205, 506, 542, 183, 561], total: 7759 },
    { name: "Purple/Blue", color: "purple/blue", men: [74.6, 141], yards: [467, 618, 332, 486, 489, 176, 542, 223, 432, 479, 373, 201, 590, 205, 506, 499, 183, 510], total: 7311 },
    { name: "Blue", color: "blue", men: [73.0, 137], yards: [436, 618, 308, 486, 489, 152, 542, 191, 432, 479, 345, 184, 590, 163, 431, 499, 157, 510], total: 7012 },
    { name: "Blue/White", color: "blue/white", men: [70.6, 130], yards: [436, 556, 308, 460, 471, 152, 496, 191, 330, 442, 345, 184, 564, 163, 431, 431, 157, 446], total: 6563 },
    { name: "White", color: "white", men: [69.1, 127], women: [75.1, 152], yards: [369, 556, 263, 460, 471, 126, 496, 173, 330, 442, 335, 160, 564, 138, 390, 431, 141, 446], total: 6291 },
    { name: "White/Green", color: "white/green", men: [67.9, 122], women: [73.4, 142], yards: [369, 488, 263, 409, 437, 126, 458, 173, 314, 422, 335, 160, 547, 138, 390, 382, 141, 418], total: 5970 },
    { name: "Green", color: "green", men: [66.4, 118], women: [71.9, 137], yards: [350, 488, 238, 409, 437, 109, 458, 138, 314, 422, 304, 116, 547, 118, 324, 382, 123, 418], total: 5695 },
    { name: "Green/Yellow", color: "green/yellow", men: [63.7, 107], women: [68.9, 124], yards: [350, 431, 238, 337, 313, 109, 444, 138, 280, 319, 304, 116, 497, 118, 324, 308, 123, 375], total: 5124 },
    { name: "Yellow", color: "yellow", men: [62.8, 104], women: [67.8, 117], yards: [319, 431, 216, 337, 313, 89, 444, 115, 280, 319, 277, 74, 497, 98, 315, 308, 112, 375], total: 4919 },
  ],
};
