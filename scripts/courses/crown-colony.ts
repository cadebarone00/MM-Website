import type { CourseCard } from "../build-course-sql.ts";

/**
 * Crown Colony Country Club, Lufkin, TX: from the published scorecard (Men's card), screenshots sent by the owner
 * 2026-11-24 (the card doesn't give the city; Crown Colony is the Lufkin club). Ratings table matched to tees by length:
 * Championship (6692) = Pine, Middle (6100) = Red Oak (card 6168), Forward (5419) = Walnut, Championship (W) (5188) =
 * Dogwood + (card 5155), Forward (W) (4856) = Dogwood. Red Oak + and Walnut + (combo tees) have no rating on file.
 */
export const course: CourseCard = {
  slug: "crown-colony-lufkin-tx",
  name: "Crown Colony Country Club",
  city: "Lufkin", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's published scorecard (Men's card; owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Ratings matched to tees by length (Middle = Red Oak, Championship (W) = Dogwood +); Red Oak + and Walnut + have no rating; Dogwood tees have women's ratings only.",
  par: [5, 4, 5, 3, 4, 4, 3, 4, 4, 4, 4, 3, 5, 3, 4, 5, 3, 5],
  strokeIndex: [3, 11, 9, 15, 7, 5, 17, 13, 1, 2, 12, 14, 10, 18, 6, 8, 16, 4],
  tees: [
    { name: "Pine", color: "pine", men: [73.2, 145], yards: [540, 385, 583, 183, 381, 388, 138, 359, 390, 437, 379, 195, 503, 185, 380, 481, 203, 582], total: 6692 },
    { name: "Red Oak +", color: "red oak +", yards: [515, 385, 583, 175, 381, 373, 138, 338, 390, 400, 379, 175, 503, 150, 348, 481, 180, 582], total: 6476 },
    { name: "Red Oak", color: "red oak", men: [70.8, 139], yards: [515, 337, 502, 175, 352, 373, 120, 338, 360, 400, 352, 175, 477, 150, 348, 456, 180, 558], total: 6168 },
    { name: "Walnut +", color: "walnut +", yards: [515, 320, 502, 138, 352, 280, 120, 330, 360, 350, 352, 135, 477, 125, 340, 456, 114, 470], total: 5736 },
    { name: "Walnut", color: "walnut", men: [66.9, 131], yards: [500, 320, 445, 138, 292, 280, 115, 330, 340, 350, 325, 135, 390, 125, 340, 410, 114, 470], total: 5419 },
    { name: "Dogwood +", color: "dogwood +", women: [70.3, 128], yards: [500, 264, 445, 100, 292, 267, 90, 330, 272, 347, 325, 110, 390, 105, 340, 410, 98, 470], total: 5155 },
    { name: "Dogwood", color: "dogwood", women: [70.3, 128], yards: [419, 264, 378, 100, 272, 267, 90, 316, 272, 347, 303, 110, 388, 105, 257, 404, 98, 466], total: 4856 },
  ],
};
