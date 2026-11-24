import type { FeaturedTrip } from "./ribbon.ts";

// Shared by the website (components/platform/TripPromos.tsx) and the Expo app (mobile/), so both show the same plan.
/** The built-in plan: shown whenever no weekly trip plan is live, so Explore always has a featured trip. */
export const BUILT_IN_TRIP: FeaturedTrip = {
  city: "Palm Springs",
  region: "California",
  length: "3 nights · 4 rounds",
  players: 4,
  image: "/schedule/mission-hills.webp",
  tiers: [
    { id: "value", label: "Value", price: "$850", stay: "Shared rental house in Cathedral City",
      courses: ["Escena Golf Club", "Indian Canyons (North)", "Desert Willow (Mountain View)", "Tahquitz Creek (Legend)"],
      days: [
        { day: "Thu", plan: "Arrive PSP · Escena Golf Club (afternoon)" },
        { day: "Fri", plan: "Indian Canyons (North) · team scramble" },
        { day: "Sat", plan: "Desert Willow (Mountain View) · Wolf" },
        { day: "Sun", plan: "Tahquitz Creek (Legend) · singles · fly home" },
      ],
      includes: ["4 rounds with cart", "3 nights lodging (shared)", "Group games set up in the app"] },
    { id: "standard", label: "Standard", price: "$1,250", stay: "Villas at Mission Hills",
      courses: ["Desert Willow (Firecliff)", "Mission Hills · Pete Dye Challenge", "Mission Hills · Arnold Palmer", "Indian Wells (Celebrity)"],
      days: [
        { day: "Thu", plan: "Arrive PSP · Desert Willow (Firecliff)" },
        { day: "Fri", plan: "Mission Hills · Pete Dye Challenge · scramble" },
        { day: "Sat", plan: "Mission Hills · Arnold Palmer · Wolf" },
        { day: "Sun", plan: "Indian Wells (Celebrity) · singles · fly home" },
      ],
      includes: ["4 rounds with cart", "3 nights in on-course villas", "Welcome dinner", "Group games set up in the app"] },
    { id: "premium", label: "Premium", price: "$2,100", stay: "La Quinta Resort & Club",
      courses: ["La Quinta Mountain Course", "PGA West Stadium", "PGA West Nicklaus Tournament", "Mission Hills · Pete Dye Challenge"],
      days: [
        { day: "Thu", plan: "Arrive PSP · La Quinta Mountain Course" },
        { day: "Fri", plan: "PGA West Stadium · scramble" },
        { day: "Sat", plan: "PGA West Nicklaus Tournament · Wolf" },
        { day: "Sun", plan: "Mission Hills · Pete Dye Challenge · singles · fly home" },
      ],
      includes: ["4 premium rounds with cart & range", "3 nights resort lodging", "Airport transfers", "Group dinner", "Group games set up in the app"] },
  ],
};
