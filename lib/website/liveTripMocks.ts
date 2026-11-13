/** Fictional directory entries only; never populated from private saved trips. */
export const LIVE_TRIP_COUNTS = [0, 1, 3, 12] as const;
export type LiveTripCount = (typeof LIVE_TRIP_COUNTS)[number];
export const LIVE_TRIP_MOCKS = [
  { id: "maroon-classic", name: "The Maroon Classic", location: "Scottsdale, Arizona" },
  { id: "sandhills", name: "Sandhills Showdown", location: "Pinehurst, North Carolina" },
  { id: "coastal-cup", name: "The Coastal Cup", location: "Hilton Head Island, South Carolina" },
  { id: "desert-weekend", name: "Desert Golf Weekend", location: "Palm Springs, California" },
  { id: "northwoods", name: "Northwoods Invitational", location: "Brainerd, Minnesota" },
  { id: "lowcountry", name: "Lowcountry Links", location: "Charleston, South Carolina" },
  { id: "boys-of-summer", name: "Boys of Summer", location: "Traverse City, Michigan" },
  { id: "mountain-match", name: "The Mountain Match", location: "Asheville, North Carolina" },
  { id: "links-week", name: "A Week on the Links", location: "Bandon, Oregon" },
  { id: "fairway-friends", name: "Fairways & Friends", location: "Bend, Oregon" },
  { id: "lake-house", name: "The Lake House Cup", location: "Lake Geneva, Wisconsin" },
  { id: "last-round", name: "One More Round Before We Head Home", location: "St. Andrews, Scotland" },
] as const;

export function liveTripMockCount(value?: string | string[]): LiveTripCount {
  return typeof value === "string" && LIVE_TRIP_COUNTS.some(count => String(count) === value) ? Number(value) as LiveTripCount : 3;
}
