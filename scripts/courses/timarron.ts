import type { CourseCard } from "../build-course-sql.ts";

/**
 * Timarron Country Club, Southlake, TX: from the published scorecard and tees table, screenshots sent by the owner
 * 2026-11-24. The tees table doesn't line up exactly with the card; matched by closest length: Black 7012 = Black
 * (7013), Blue 6525 = Copper (6429), White 5949 = White (5841), Green 5309 = Green (5299). The ~100-yard gaps on
 * Copper / White suggest the ratings predate a small course change. The three combos have no rating.
 */
export const course: CourseCard = {
  slug: "timarron-southlake-tx",
  name: "Timarron Country Club",
  city: "Southlake", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the published scorecard and tees table (owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Ratings matched by closest length (table Blue = Copper; Copper and White ~100 yds off the table); combos have no rating.",
  par: [5, 4, 3, 4, 3, 5, 4, 4, 4, 4, 4, 4, 5, 3, 4, 4, 3, 5],
  strokeIndex: [8, 14, 18, 10, 16, 2, 6, 12, 4, 7, 5, 1, 11, 15, 9, 13, 17, 3],
  tees: [
    { name: "Black", color: "black", men: [74.2, 139], yards: [538, 375, 185, 410, 162, 512, 444, 406, 394, 410, 448, 459, 548, 197, 348, 419, 218, 540], total: 7013 },
    { name: "Black/Copper", color: "black/copper", yards: [538, 335, 154, 410, 162, 512, 402, 406, 394, 410, 416, 412, 513, 197, 348, 392, 184, 540], total: 6725 },
    { name: "Copper", color: "copper", men: [71.3, 133], yards: [499, 335, 154, 381, 137, 495, 402, 387, 349, 383, 416, 412, 513, 159, 316, 392, 184, 515], total: 6429 },
    { name: "Copper/White", color: "copper/white", yards: [499, 303, 132, 381, 120, 495, 380, 346, 349, 383, 375, 377, 513, 159, 316, 358, 164, 515], total: 6165 },
    { name: "White", color: "white", men: [68.4, 124], women: [75.1, 144], yards: [465, 303, 132, 351, 120, 425, 380, 346, 285, 349, 375, 377, 487, 137, 294, 358, 164, 493], total: 5841 },
    { name: "White/Green", color: "white/green", yards: [465, 290, 111, 351, 120, 425, 296, 312, 285, 349, 344, 352, 431, 137, 294, 345, 145, 493], total: 5545 },
    { name: "Green", color: "green", men: [65.7, 120], women: [72.2, 132], yards: [445, 290, 111, 282, 108, 413, 296, 312, 275, 320, 344, 352, 431, 116, 276, 345, 145, 438], total: 5299 },
  ],
};
