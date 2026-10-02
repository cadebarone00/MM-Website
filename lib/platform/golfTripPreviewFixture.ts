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
/** Match play standing: who's ahead and by how many holes (leader null = all square). null = not started. */
export type GolfMatchStanding = { leader: "left" | "right" | null; up: number } | null;
export type GolfMatchGolfer = { name: string; hcp: number; thru: string; score: string; teeTime: string; course: string };
export type GolfMatchPreview = {
  round: number; roundCount: number;
  /** This round's course, date (YYYY-MM-DD) and format, shown in the Leaderboard / Match slide headers. */
  course: string; roundDate: string; format: string;
  /** Handicap on for this event: the Leaderboard gets a GROSS / NET switch. */
  handicap: boolean;
  /** This round's par for holes 1–18 (the Leaderboard's SCORECARD view). */
  par: number[];
  sides: [GolfMatchSide, GolfMatchSide];
  /** Each match's standing, gross and net (the Match slide's GROSS / NET switch). */
  matches: { left: GolfMatchGolfer; right: GolfMatchGolfer; gross: GolfMatchStanding; net: GolfMatchStanding }[];
  /** The Leaderboard slide: every golfer on their own row, best total first. TOT = whole trip, THRU = holes played
   *  this round, TDY = this round's score. `holes` = this round's strokes on holes 1–18, null where not played yet. */
  leaderboard: { position: string; golfer: GolfMatchGolfer; total: string; thru: string; today: string; netTotal: string; netToday: string;
    holes: (number | null)[] }[];
};

const unplayed = (count: number): null[] => Array<null>(count).fill(null);

/** DEV ONLY: a made-up team match for the Golf tab's Match slide (Sleeper-style layout). */
export const GOLF_MATCH_PREVIEW: GolfMatchPreview = {
  round: 2,
  course: "Canyon Ridge",
  roundDate: "2027-04-23",
  format: "Singles Match Play",
  roundCount: 4,
  handicap: true,
  par: [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5],
  sides: [
    { name: "Team Alex", handle: "@alexorganizer", record: "3-0 (#1)", initials: "TA", winPct: 72, points: "3.5", avgScore: "81.4", fairwaysPct: "64%" },
    { name: "Team Jordan", handle: "@jordanp", record: "1-2 (#3)", initials: "TJ", winPct: 28, points: "1.5", avgScore: "86.9", fairwaysPct: "51%" },
  ],
  matches: [
    { left: { name: "A. Organizer", hcp: 6, thru: "Thru 12", score: "-1", teeTime: "8:30 AM", course: "Canyon Ridge" },
      right: { name: "J. Parker", hcp: 9, thru: "Thru 12", score: "+3", teeTime: "8:30 AM", course: "Canyon Ridge" },
      gross: { leader: "left", up: 2 }, net: { leader: "left", up: 1 } },
    { left: { name: "M. Chen", hcp: 12, thru: "Thru 9", score: "+2", teeTime: "8:40 AM", course: "Canyon Ridge" },
      right: { name: "D. Romero", hcp: 11, thru: "Thru 9", score: "+2", teeTime: "8:40 AM", course: "Canyon Ridge" },
      gross: { leader: null, up: 0 }, net: { leader: "right", up: 1 } },
    { left: { name: "S. Patel", hcp: 4, thru: "Thru 14", score: "E", teeTime: "8:50 AM", course: "Canyon Ridge" },
      right: { name: "C. Brooks", hcp: 15, thru: "Thru 14", score: "+5", teeTime: "8:50 AM", course: "Canyon Ridge" },
      gross: { leader: "left", up: 4 }, net: { leader: "right", up: 2 } },
    { left: { name: "R. Lee", hcp: 18, thru: "Not started", score: "—", teeTime: "9:00 AM", course: "Canyon Ridge" },
      right: { name: "T. Nguyen", hcp: 14, thru: "Not started", score: "—", teeTime: "9:00 AM", course: "Canyon Ridge" },
      gross: null, net: null },
  ],
  leaderboard: [
    { position: "1", total: "-3", thru: "12", netTotal: "-13", netToday: "-5", today: "-1", holes: [4, 4, 3, 4, 5, 4, 2, 5, 4, 4, 4, 3, ...unplayed(6)],
      golfer: { name: "A. Organizer", hcp: 6, thru: "Thru 12", score: "-1", teeTime: "8:30 AM", course: "Canyon Ridge" } },
    { position: "2", total: "-1", thru: "14", netTotal: "-8", netToday: "-3", today: "E", holes: [4, 3, 3, 5, 4, 4, 3, 5, 5, 4, 5, 3, 4, 4, ...unplayed(4)],
      golfer: { name: "S. Patel", hcp: 4, thru: "Thru 14", score: "E", teeTime: "8:50 AM", course: "Canyon Ridge" } },
    { position: "T3", total: "+1", thru: "9", netTotal: "-17", netToday: "-4", today: "+2", holes: [5, 5, 3, 4, 4, 5, 3, 5, 4, ...unplayed(9)],
      golfer: { name: "M. Chen", hcp: 12, thru: "Thru 9", score: "+2", teeTime: "8:40 AM", course: "Canyon Ridge" } },
    { position: "T3", total: "+1", thru: "9", netTotal: "-16", netToday: "-4", today: "+2", holes: [4, 6, 3, 4, 5, 4, 3, 5, 4, ...unplayed(9)],
      golfer: { name: "D. Romero", hcp: 11, thru: "Thru 9", score: "+2", teeTime: "8:40 AM", course: "Canyon Ridge" } },
    { position: "5", total: "+4", thru: "12", netTotal: "-11", netToday: "-3", today: "+3", holes: [4, 5, 3, 4, 4, 6, 3, 6, 4, 4, 4, 3, ...unplayed(6)],
      golfer: { name: "J. Parker", hcp: 9, thru: "Thru 12", score: "+3", teeTime: "8:30 AM", course: "Canyon Ridge" } },
    { position: "6", total: "+7", thru: "14", netTotal: "-20", netToday: "-7", today: "+5", holes: [5, 5, 4, 4, 4, 5, 3, 6, 4, 5, 4, 3, 5, 4, ...unplayed(4)],
      golfer: { name: "C. Brooks", hcp: 15, thru: "Thru 14", score: "+5", teeTime: "8:50 AM", course: "Canyon Ridge" } },
    { position: "7", total: "+9", thru: "—", netTotal: "-9", netToday: "—", today: "—", holes: unplayed(18),
      golfer: { name: "R. Lee", hcp: 18, thru: "Not started", score: "—", teeTime: "9:00 AM", course: "Canyon Ridge" } },
    { position: "8", total: "+11", thru: "—", netTotal: "-3", netToday: "—", today: "—", holes: unplayed(18),
      golfer: { name: "T. Nguyen", hcp: 14, thru: "Not started", score: "—", teeTime: "9:00 AM", course: "Canyon Ridge" } },
  ],
};
