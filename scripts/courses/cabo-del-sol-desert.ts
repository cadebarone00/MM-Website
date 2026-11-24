import type { CourseCard } from "../build-course-sql.ts";

/**
 * Cabo del Sol, Desert Course (the Tom Weiskopf design; the card notes a Fry Straka renovation in process),
 * Carretera Transpeninsular Km 10.3, Cabo San Lucas, Baja California Sur, Mexico: from the course's printed scorecard
 * with its ratings, sent by the owner 2026-11-24. Par 72 (35 / 37). Red has ratings but no yardages on the card, so
 * it's left off (men 63.4/111, women 67.5/113).
 */
export const course: CourseCard = {
  slug: "cabo-del-sol-desert-cabo-san-lucas-mx",
  name: "Cabo del Sol Desert Course",
  city: "Cabo San Lucas", state: "BCS", country: "MX", timezone: "America/Mazatlan", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's printed scorecard (owner screenshot 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's handicaps; men's and women's ratings; Red left off (no yardages on the card). Renovation in process per the card.",
  par: [3, 5, 4, 3, 5, 4, 3, 4, 4, 4, 5, 3, 5, 4, 4, 5, 4, 3],
  strokeIndex: [17, 1, 3, 15, 5, 13, 11, 7, 9, 8, 6, 14, 2, 18, 10, 4, 12, 16],
  tees: [
    { name: "Black", color: "black", men: [73.8, 140], women: [80.7, 145], yards: [199, 592, 480, 196, 512, 329, 214, 403, 329, 441, 502, 212, 589, 334, 395, 623, 404, 254], total: 7008 },
    { name: "Gold", color: "gold", men: [72.0, 135], women: [78.5, 140], yards: [178, 585, 463, 188, 501, 313, 197, 378, 245, 414, 495, 208, 554, 312, 380, 606, 376, 228], total: 6621 },
    { name: "Blue", color: "blue", men: [69.4, 128], women: [75.0, 132], yards: [154, 483, 411, 172, 484, 294, 181, 345, 229, 390, 455, 190, 514, 282, 331, 543, 351, 208], total: 6017 },
    { name: "White", color: "white", men: [66.4, 119], women: [71.2, 124], yards: [110, 476, 402, 147, 451, 244, 123, 270, 213, 366, 372, 149, 474, 245, 293, 503, 327, 187], total: 5352 },
  ],
};
