import type { CourseCard } from "../build-course-sql.ts";

/**
 * Rayburn Country Club, Brookeland, TX, Blue/Green course (the resort has three nines; this card is Blue front /
 * Green back): from the published scorecard and tee ratings, screenshot sent by the owner 2026-11-24.
 */
export const course: CourseCard = {
  slug: "rayburn-blue-green-brookeland-tx",
  name: "Rayburn Country Club (Blue/Green)",
  city: "Brookeland", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's published scorecard (owner screenshot 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Blue/Green 18; men's ratings for Blue and White.",
  par: [4, 4, 4, 5, 3, 4, 5, 3, 4, 5, 3, 4, 3, 5, 4, 4, 4, 4],
  strokeIndex: [1, 3, 5, 7, 9, 11, 13, 15, 17, 2, 4, 6, 8, 10, 12, 14, 16, 18],
  tees: [
    { name: "Blue", color: "blue", men: [72.5, 129], yards: [373, 440, 365, 590, 145, 363, 537, 172, 373, 510, 195, 387, 190, 494, 348, 455, 401, 381], total: 6719 },
    { name: "White", color: "white", men: [70.1, 125], yards: [327, 410, 340, 540, 125, 323, 510, 145, 360, 475, 172, 351, 156, 457, 333, 428, 380, 352], total: 6184 },
  ],
};
