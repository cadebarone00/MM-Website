/** Shared navigation vocabulary for the trip UI and development page shortcuts. */
export const GOLF_TRIP_TABS = ["Home", "Golf", "Venue", "Info"] as const;
export const GOLF_TRIP_SECTIONS = ["Overview", "Competition", "Games"] as const;
export type GolfTripTab = (typeof GOLF_TRIP_TABS)[number];
export type GolfTripSection = (typeof GOLF_TRIP_SECTIONS)[number];
export type GolfTripNavigation = { tab: GolfTripTab; golfSection?: GolfTripSection; command?: number };
