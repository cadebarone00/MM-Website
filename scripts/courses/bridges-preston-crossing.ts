import type { CourseCard } from "../build-course-sql.ts";

/**
 * The Bridges Golf Club at Preston Crossing, Gunter, TX: from the published scorecard and tees table, screenshots sent
 * by the owner 2026-11-24 (no location given; The Bridges at Preston Crossing is in Gunter, Grayson County).
 */
export const course: CourseCard = {
  slug: "bridges-preston-crossing-gunter-tx",
  name: "The Bridges at Preston Crossing",
  city: "Gunter", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the published scorecard and tees table (owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's handicaps; men's ratings for every tee, women's for White and Red.",
  par: [4, 3, 5, 4, 5, 4, 4, 3, 4, 4, 4, 4, 4, 5, 3, 4, 3, 5],
  strokeIndex: [11, 17, 1, 9, 3, 13, 7, 15, 5, 12, 10, 8, 14, 4, 18, 6, 16, 2],
  tees: [
    { name: "Black", color: "black", men: [77.7, 139], yards: [446, 207, 581, 447, 523, 330, 458, 242, 514, 411, 430, 434, 404, 626, 201, 510, 203, 645], total: 7612 },
    { name: "Gold", color: "gold", men: [75.0, 134], yards: [410, 179, 545, 416, 482, 283, 444, 199, 478, 388, 406, 407, 385, 572, 185, 471, 164, 607], total: 7021 },
    { name: "Blue", color: "blue", men: [72.5, 128], yards: [403, 156, 466, 389, 453, 252, 417, 175, 448, 354, 382, 386, 368, 543, 159, 451, 130, 555], total: 6487 },
    { name: "White", color: "white", men: [70.5, 120], women: [75.7, 140], yards: [370, 135, 459, 352, 423, 212, 408, 144, 420, 326, 343, 317, 357, 522, 140, 434, 99, 530], total: 5991 },
    { name: "Red", color: "red", men: [66.8, 113], women: [70.8, 122], yards: [293, 83, 401, 333, 337, 180, 370, 95, 371, 313, 291, 272, 275, 494, 120, 421, 95, 449], total: 5193 },
  ],
};
