import type { CourseCard } from "../build-course-sql.ts";

/**
 * The Texas A&M Golf Club (the campus course), College Station, TX: from the course's printed scorecard (06/18 card),
 * sent by the owner 2026-11-24. Par 71 (35 / 36). Combo mixes Black (B) and Maroon (M) holes as marked on the card.
 * The card prints one rating per tee, no gender given; stored as men's.
 */
export const course: CourseCard = {
  slug: "texas-am-golf-club-college-station-tx",
  name: "The Texas A&M Golf Club",
  city: "College Station", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard (06/18; owner screenshot 2026-11-24)",
  note: "Owner sent the card 2026-11-24. One handicap row; one rating per tee (stored as men's).",
  par: [4, 4, 4, 4, 3, 5, 3, 4, 4, 5, 3, 5, 3, 4, 4, 4, 4, 4],
  strokeIndex: [15, 3, 9, 17, 11, 5, 7, 13, 1, 10, 8, 6, 18, 4, 16, 14, 2, 12],
  tees: [
    { name: "Black", color: "black", men: [73.8, 130], yards: [347, 433, 448, 353, 200, 618, 217, 332, 491, 550, 200, 530, 180, 457, 389, 394, 465, 404], total: 7008 },
    { name: "Combo", color: "combo", men: [72.7, 128], yards: [347, 406, 427, 353, 180, 594, 195, 332, 430, 550, 182, 530, 180, 400, 389, 394, 465, 404], total: 6758 },
    { name: "Maroon", color: "maroon", men: [71.6, 125], yards: [323, 406, 427, 333, 180, 594, 195, 311, 430, 541, 182, 496, 160, 400, 370, 361, 414, 380], total: 6503 },
    { name: "White", color: "white", men: [69.7, 122], yards: [298, 385, 409, 311, 160, 558, 167, 287, 409, 509, 167, 469, 140, 378, 351, 338, 392, 360], total: 6088 },
    { name: "Blue", color: "blue", men: [67.5, 116], yards: [276, 364, 371, 291, 124, 540, 148, 271, 390, 486, 110, 429, 127, 355, 325, 320, 364, 340], total: 5631 },
    { name: "Yellow", color: "yellow", men: [64.5, 110], yards: [239, 333, 317, 255, 113, 450, 132, 234, 362, 455, 93, 393, 100, 321, 274, 278, 325, 294], total: 4968 },
  ],
};
