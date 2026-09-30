export const maroonCategories = [
  { slug: "courses", label: "Courses", headline: "The places we play.", description: "Course stories, destination guides, and a closer look at the places behind the tournament.", image: "/schedule/mission-hills.webp" },
  { slug: "equipment", label: "Equipment", headline: "Inside the bag.", description: "Clubs, golf balls, and the details that make a bag your own.", image: "/teams/maroon/collage/07-medallion.jpg" },
  { slug: "teaching", label: "Teaching", headline: "Keep getting better.", description: "Practice ideas, on-course decisions, and lessons for the next round.", image: "/teams/maroon/collage/04-swing-cloudy.jpg" },
  { slug: "news", label: "News", headline: "Around the Maroon Tournament.", description: "Tournament stories, familiar faces, and moments from our golf community.", image: "/teams/maroon/collage/01-hero-team.jpg" },
] as const;

export type MaroonCategory = typeof maroonCategories[number];
