import type { CourseCard } from "../build-course-sql.ts";

/**
 * Wild Springs Dunes, Mount Enterprise, TX: from the published scorecard (Men's card) and tee ratings, screenshots sent
 * by the owner 2026-11-24 (location from the owner; the card doesn't give it).
 */
export const course: CourseCard = {
  slug: "wild-springs-dunes-mount-enterprise-tx",
  name: "Wild Springs Dunes",
  city: "Mount Enterprise", state: "TX", timezone: "America/Chicago", added: "2026-11-24",
  attribution: "Entered by The Maroon from the course's published scorecard (Men's card; owner screenshots 2026-11-24)",
  note: "Owner sent the card 2026-11-24. Men's handicaps; men's and women's ratings for each tee. Location from the owner (Mount Enterprise, TX).",
  par: [4, 5, 3, 4, 3, 4, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 5],
  strokeIndex: [11, 3, 9, 1, 13, 7, 17, 5, 15, 8, 6, 10, 16, 2, 14, 4, 12, 18],
  tees: [
    { name: "Pine", color: "pine", men: [74.6, 147], women: [80.7, 151], yards: [408, 533, 196, 479, 137, 431, 302, 543, 341, 242, 421, 432, 567, 439, 166, 485, 331, 509], total: 6962 },
    { name: "Spring", color: "spring", men: [71.7, 136], women: [77.4, 143], yards: [379, 511, 145, 435, 124, 394, 270, 472, 305, 223, 401, 341, 543, 382, 153, 471, 322, 495], total: 6366 },
    { name: "Cloud", color: "cloud", men: [69.0, 130], women: [74.6, 137], yards: [320, 491, 126, 410, 108, 330, 259, 425, 245, 201, 389, 334, 496, 351, 137, 427, 311, 483], total: 5843 },
    { name: "Sand", color: "sand", men: [66.2, 123], women: [71.0, 130], yards: [294, 466, 95, 339, 92, 290, 243, 410, 213, 192, 374, 300, 411, 291, 116, 370, 297, 419], total: 5212 },
  ],
};
