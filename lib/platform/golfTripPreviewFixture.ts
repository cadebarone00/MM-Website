import type { GolfTripDraft } from "./golfTripDraft";

/**
 * DEV ONLY: a fully answered Golf Trip questionnaire, for the /dev/tournament design preview.
 * Same keys the questionnaire saves, so Golf Trip Home reads it exactly like a real draft. Made-up data.
 */
export const GOLF_TRIP_PREVIEW_DRAFT: GolfTripDraft = {
  yourName: "Alex Organizer",
  yourEmail: "organizer@example.com",
  tripName: "Spring Golf Weekend",
  destination: "Scottsdale, AZ",
  startDate: "2027-04-22",
  endDate: "2027-04-25",
  golfDays: "3",
  day1Date: "2027-04-22",
  day1Rounds: "1",
  day2Date: "2027-04-23",
  day2Rounds: "2",
  day3Date: "2027-04-24",
  day3Rounds: "1",
  round1Course: "Desert Pines GC",
  round2Course: "Canyon Ridge (Front)",
  round3Course: "Canyon Ridge (Back)",
  round4Course: "Saguaro Links",
  includesTournament: "yes",
  knowsFlights: "yes",
  knowsLodging: "yes",
  knowsTransportation: "no",
};
