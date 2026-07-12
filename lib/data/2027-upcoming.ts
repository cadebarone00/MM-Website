import type { UpcomingTournament } from "./types";

// TODO: once the 2027 tee sheet is finalized, update `liveAt` to the exact
// first-tee-time timestamp (with timezone) so the site flips to "live" the
// moment play begins, and fill in `roster`.
export const upcoming2027: UpcomingTournament = {
  slug: "2027",
  editionLabel: "The Maroon Masters 2027",
  year: 2027,
  venue: "Mission Hills CC",
  location: "Palm Springs, CA",
  dateLabel: "January 6–9, 2027",
  startDate: "2027-01-06",
  endDate: "2027-01-09",
  liveAt: "2027-01-06T09:30:00-06:00",
  notes: "Roster and the first tee time will be added once the 2027 sheet is finalized.",
};
