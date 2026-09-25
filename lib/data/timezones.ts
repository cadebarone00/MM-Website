/** Curated venue-timezone choices for a tournament year, same pattern as US_STATES (lib/data/usStates.ts) — a full IANA zone picker (400+ entries) is bad UX for a trip that only ever lands in a handful of real places. Add more the same way as the list grows. */
export const TIMEZONES: { id: string; label: string }[] = [
  { id: "America/Los_Angeles", label: "Pacific Time" },
  { id: "America/Denver", label: "Mountain Time" },
  { id: "America/Mazatlan", label: "Mexican Pacific Time (e.g. Danzante Bay)" },
  { id: "America/Chicago", label: "Central Time" },
  { id: "America/New_York", label: "Eastern Time" },
];

export const TIMEZONE_IDS = new Set(TIMEZONES.map((zone) => zone.id));
