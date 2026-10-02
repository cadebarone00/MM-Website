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

export type GolfMatchSide = {
  name: string; handle: string; record: string; initials: string;
  winPct: number; points: string; avgScore: string; fairwaysPct: string;
};
export type GolfMatchGolfer = { name: string; hcp: number; thru: string; score: string; teeTime: string; course: string };
export type GolfMatchPreview = {
  round: number; roundCount: number;
  sides: [GolfMatchSide, GolfMatchSide];
  matches: { left: GolfMatchGolfer; right: GolfMatchGolfer }[];
  /** The Leaderboard slide: every golfer on their own row, best total first. TOT = whole trip, THRU = holes played
   *  this round, TDY = this round's score. */
  leaderboard: { position: string; golfer: GolfMatchGolfer; total: string; thru: string; today: string }[];
};

/** DEV ONLY: a made-up team match for the Golf tab's Match slide (Sleeper-style layout). */
export const GOLF_MATCH_PREVIEW: GolfMatchPreview = {
  round: 2,
  roundCount: 4,
  sides: [
    { name: "Team Alex", handle: "@alexorganizer", record: "3-0 (#1)", initials: "TA", winPct: 72, points: "3.5", avgScore: "81.4", fairwaysPct: "64%" },
    { name: "Team Jordan", handle: "@jordanp", record: "1-2 (#3)", initials: "TJ", winPct: 28, points: "1.5", avgScore: "86.9", fairwaysPct: "51%" },
  ],
  matches: [
    { left: { name: "A. Organizer", hcp: 6, thru: "Thru 12", score: "-1", teeTime: "8:30 AM", course: "Canyon Ridge" },
      right: { name: "J. Parker", hcp: 9, thru: "Thru 12", score: "+3", teeTime: "8:30 AM", course: "Canyon Ridge" } },
    { left: { name: "M. Chen", hcp: 12, thru: "Thru 9", score: "+2", teeTime: "8:40 AM", course: "Canyon Ridge" },
      right: { name: "D. Romero", hcp: 11, thru: "Thru 9", score: "+2", teeTime: "8:40 AM", course: "Canyon Ridge" } },
    { left: { name: "S. Patel", hcp: 4, thru: "Thru 14", score: "E", teeTime: "8:50 AM", course: "Canyon Ridge" },
      right: { name: "C. Brooks", hcp: 15, thru: "Thru 14", score: "+5", teeTime: "8:50 AM", course: "Canyon Ridge" } },
    { left: { name: "R. Lee", hcp: 18, thru: "Not started", score: "—", teeTime: "9:00 AM", course: "Canyon Ridge" },
      right: { name: "T. Nguyen", hcp: 14, thru: "Not started", score: "—", teeTime: "9:00 AM", course: "Canyon Ridge" } },
  ],
  leaderboard: [
    { position: "1", total: "-3", thru: "12", today: "-1",
      golfer: { name: "A. Organizer", hcp: 6, thru: "Thru 12", score: "-1", teeTime: "8:30 AM", course: "Canyon Ridge" } },
    { position: "2", total: "-1", thru: "14", today: "E",
      golfer: { name: "S. Patel", hcp: 4, thru: "Thru 14", score: "E", teeTime: "8:50 AM", course: "Canyon Ridge" } },
    { position: "T3", total: "+1", thru: "9", today: "+2",
      golfer: { name: "M. Chen", hcp: 12, thru: "Thru 9", score: "+2", teeTime: "8:40 AM", course: "Canyon Ridge" } },
    { position: "T3", total: "+1", thru: "9", today: "+2",
      golfer: { name: "D. Romero", hcp: 11, thru: "Thru 9", score: "+2", teeTime: "8:40 AM", course: "Canyon Ridge" } },
    { position: "5", total: "+4", thru: "12", today: "+3",
      golfer: { name: "J. Parker", hcp: 9, thru: "Thru 12", score: "+3", teeTime: "8:30 AM", course: "Canyon Ridge" } },
    { position: "6", total: "+7", thru: "14", today: "+5",
      golfer: { name: "C. Brooks", hcp: 15, thru: "Thru 14", score: "+5", teeTime: "8:50 AM", course: "Canyon Ridge" } },
    { position: "7", total: "+9", thru: "—", today: "—",
      golfer: { name: "R. Lee", hcp: 18, thru: "Not started", score: "—", teeTime: "9:00 AM", course: "Canyon Ridge" } },
    { position: "8", total: "+11", thru: "—", today: "—",
      golfer: { name: "T. Nguyen", hcp: 14, thru: "Not started", score: "—", teeTime: "9:00 AM", course: "Canyon Ridge" } },
  ],
};
