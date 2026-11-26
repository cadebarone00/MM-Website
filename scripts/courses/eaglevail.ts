import type { CourseCard } from "../build-course-sql.ts";

/**
 * EagleVail Golf Club, Avon, CO: from the course's printed scorecard (08/23 card) with its ratings, sent by the owner
 * 2026-11-24. Par 71 (35 / 36). Combo tees follow the card's arrows (▲ = the tee above, ▼ = the tee below); both
 * match the card's printed totals: White/Gold 2950 + 2877 = 5827, Gold/Red 2499 + 2599 = 5098. Ladies' handicaps
 * (not used): 5 1 13 15 11 3 7 17 9 / 18 2 12 14 8 4 6 16 10.
 */
export const course: CourseCard = {
  slug: "eaglevail-avon-co",
  name: "EagleVail Golf Club",
  city: "Avon", state: "CO", timezone: "America/Denver", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard (08/23; owner screenshot 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's handicaps; men's and ladies' ratings; combo tees from the card's arrows (both match its totals).",
  par: [5, 4, 4, 3, 4, 4, 4, 3, 4, 3, 5, 4, 3, 5, 4, 4, 3, 5],
  strokeIndex: [9, 3, 11, 15, 7, 5, 13, 17, 1, 18, 4, 12, 14, 10, 2, 8, 16, 6],
  tees: [
    { name: "Blue", color: "blue", men: [70.5, 135], yards: [550, 436, 370, 146, 390, 434, 425, 115, 446, 197, 548, 390, 187, 551, 362, 318, 141, 532], total: 6538 },
    { name: "White", color: "white", men: [68.8, 125], women: [74.5, 151], yards: [535, 421, 358, 127, 385, 401, 407, 105, 425, 133, 530, 368, 181, 531, 322, 307, 132, 521], total: 6189 },
    { name: "White/Gold", color: "white/gold", men: [67.4, 120], yards: [535, 396, 358, 127, 385, 360, 386, 105, 298, 133, 462, 340, 170, 500, 312, 307, 132, 521], total: 5827 },
    { name: "Gold", color: "gold", men: [66.1, 114], women: [70.2, 140], yards: [443, 396, 358, 127, 270, 360, 386, 105, 298, 133, 462, 340, 170, 500, 312, 290, 132, 410], total: 5492 },
    { name: "Gold/Red", color: "gold/red", men: [64.4, 113], women: [68.3, 133], yards: [443, 333, 289, 86, 270, 360, 315, 105, 298, 125, 462, 340, 120, 408, 312, 290, 132, 410], total: 5098 },
    { name: "Red", color: "red", men: [62.9, 112], women: [66.8, 124], yards: [429, 333, 289, 86, 270, 360, 315, 90, 298, 125, 385, 260, 120, 408, 243, 206, 112, 410], total: 4739 },
  ],
};
