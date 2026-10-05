import { getPlayerDisplayName, getPlayerSlug } from "../data/players";
import { palmSprings2026 } from "../data/2026-palm-springs";
import type { Tournament } from "../data/types";
import type { GolfTripDraft } from "./golfTripDraft";
import type { GolfTripFlight } from "./golfTripFlights";
import type { TripWeather } from "./weather/types";
import type { ItineraryItem } from "./golfTripItinerary";
import { FORMATS, type FormatDefinition } from "./formats";

function tournamentTripDraftFromTournament(tournament: Tournament): GolfTripDraft {
  const dayDates = tournament.dayDates ?? {};
  const uniqueDays = Array.from(new Set(Object.keys(dayDates).map(Number))).sort((a, b) => a - b);
  const golfDays = uniqueDays.length || Math.max(1, tournament.matches.reduce((max, match) => Math.max(max, match.day), 0));
  const draft: GolfTripDraft = {
    yourName: "Cade Barone",
    yourEmail: "organizer@example.com",
    tripName: tournament.editionLabel,
    destination: tournament.location,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    playerCount: String((tournament.roster.maroon.length + tournament.roster.white.length)),
    golfDays: String(golfDays),
    includesTournament: "yes",
    knowsFlights: "",
    knowsLodging: "",
    knowsTransportation: "",
  };

  for (let day = 1; day <= golfDays; day++) {
    draft[`day${day}Date`] = dayDates[day] ?? tournament.startDate;
    draft[`day${day}Rounds`] = "1";
    draft[`round${(day - 1) * 2 + 1}Course`] = tournament.venue;
    if (day > 1) draft[`round${(day - 1) * 2}Course`] = tournament.venue;
  }

  // Keep the trip shell aligned to the actual tournament values while leaving all travel info empty for later manual entry.
  return draft;
}

/**
 * DEV ONLY: a fully answered Golf Trip questionnaire, for the /dev/tournament design preview.
 * Uses real Maroon tournament data and leaves travel/lodging fields empty until the organizer adds them later.
 */
export const GOLF_TRIP_PREVIEW_DRAFT: GolfTripDraft = tournamentTripDraftFromTournament(palmSprings2026);

/** Generic future trip with incomplete fields for empty-state previews. */
export const GOLF_TRIP_MOCK_DRAFT: GolfTripDraft = {
  yourName: "Alex Morgan", yourEmail: "organizer@example.com", tripName: "Friends Golf Weekend",
  destination: "", startDate: "2027-04-22", endDate: "2027-04-26", playerCount: "8", golfDays: "2",
  includesTournament: "yes", knowsFlights: "", knowsLodging: "", knowsTransportation: "",
  day1Date: "2027-04-22", day1Rounds: "1", day2Date: "2027-04-23", day2Rounds: "1",
  round1Course: "", round3Course: "Canyon Ridge",
};

export type GolfMatchSide = {
  name: string;
  winPct: number;
  /** This round's stats overview on the team card: fairways hit %, greens in regulation %, putts, score to par. */
  fairwayPct: string; greenPct: string; putts: string; score: string;
};

/** Match play standing: who's ahead and by how many holes (leader null = all square). null = not started. */
export type GolfMatchStanding = { leader: "left" | "right" | null; up: number } | null;

/** `points` = match points the golfer has earned, shown on the Match box above the Golf tabs ("3 PTS"). */
export type GolfMatchGolfer = {
  name: string;
  hcp: number;
  thru: string;
  score: string;
  teeTime: string;
  course: string;
  points?: number;
};

/**
 * A competitor side in a match or flight.
 * Can represent an individual golfer, a 2-person pair (Fourball / Alternate Shot), or a team (Scramble / Shamble),
 * with an optional team/pair label.
 */
export type GolfMatchCompetitor = {
  /** Optional pair or team name (e.g. "Team Alex", "Dye / Nicklaus", "Scottsdale 4"). */
  name?: string;
  golfers: GolfMatchGolfer[];
  points?: number;
  totalScore?: string;
  totalNet?: string;
  thru?: string;
  teeTime?: string;
  course?: string;
};

/** Converts a standalone GolfMatchGolfer or GolfMatchCompetitor into a unified GolfMatchCompetitor. */
export function normalizeCompetitor(input: GolfMatchCompetitor | GolfMatchGolfer): GolfMatchCompetitor {
  if ("golfers" in input && Array.isArray(input.golfers)) return input;
  const golfer = input as GolfMatchGolfer;
  return {
    name: golfer.name,
    golfers: [golfer],
    points: golfer.points,
    totalScore: golfer.score,
    thru: golfer.thru,
    teeTime: golfer.teeTime,
    course: golfer.course,
  };
}

export type GolfMatchPairing = {
  left: GolfMatchCompetitor | GolfMatchGolfer;
  right?: GolfMatchCompetitor | GolfMatchGolfer;
  gross: GolfMatchStanding;
  net: GolfMatchStanding;
};

export type GolfLeaderboardEntry = {
  position: string;
  golfer: GolfMatchGolfer;
  total: string;
  thru: string;
  today: string;
  netTotal: string;
  netToday: string;
  /** Stableford points for points-based formats */
  pointsTotal?: number;
  pointsToday?: number;
  holes: (number | null)[];
};

export type GolfMatchPreview = {
  round: number;
  roundCount: number;
  /** This round's course, date (YYYY-MM-DD) and format, shown in the Leaderboard / Match slide headers. */
  course: string;
  roundDate: string;
  format: string;
  formatDef?: FormatDefinition;
  /** Handicap on for this event: the Leaderboard gets a GROSS / NET switch. */
  handicap: boolean;
  /** This round's par for holes 1–18 (the Leaderboard's SCORECARD view). */
  par: number[];
  sides: [GolfMatchSide, GolfMatchSide];
  /** Each match's standing, gross and net (the Match slide's GROSS / NET switch). */
  matches: GolfMatchPairing[];
  /** The Leaderboard slide: every golfer on their own row, best total first. */
  leaderboard: GolfLeaderboardEntry[];
};

const unplayed = (count: number): null[] => Array<null>(count).fill(null);

const DEFAULT_PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];

/** 1. Singles Match Play Preview */
export const GOLF_MATCH_PREVIEW_SINGLES: GolfMatchPreview = {
  round: 2,
  course: "Canyon Ridge",
  roundDate: "2027-04-23",
  format: "Singles Match Play",
  formatDef: FORMATS.Singles,
  roundCount: 4,
  handicap: true,
  par: DEFAULT_PAR,
  sides: [
    { name: "Team Alex", winPct: 72, fairwayPct: "64%", greenPct: "50%", putts: "29", score: "+9" },
    { name: "Team Jordan", winPct: 28, fairwayPct: "51%", greenPct: "39%", putts: "32", score: "+15" },
  ],
  matches: [
    { left: { name: "A. Organizer", hcp: 6, thru: "Thru 12", score: "-1", teeTime: "8:30 AM", course: "Canyon Ridge", points: 3 },
      right: { name: "J. Parker", hcp: 9, thru: "Thru 12", score: "+3", teeTime: "8:30 AM", course: "Canyon Ridge", points: 1 },
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

/** 2. Fourball 2v2 Preview */
export const GOLF_MATCH_PREVIEW_FOURBALL: GolfMatchPreview = {
  round: 1,
  course: "Desert Pines GC",
  roundDate: "2027-04-22",
  format: "Fourball",
  formatDef: FORMATS.Fourball,
  roundCount: 4,
  handicap: true,
  par: DEFAULT_PAR,
  sides: [
    { name: "Team Alex", winPct: 60, fairwayPct: "68%", greenPct: "55%", putts: "30", score: "-3" },
    { name: "Team Jordan", winPct: 40, fairwayPct: "58%", greenPct: "48%", putts: "31", score: "-1" },
  ],
  matches: [
    {
      left: {
        name: "Organizer / Patel",
        points: 2,
        golfers: [
          { name: "A. Organizer", hcp: 6, thru: "Thru 15", score: "-2", teeTime: "8:00 AM", course: "Desert Pines GC" },
          { name: "S. Patel", hcp: 4, thru: "Thru 15", score: "-1", teeTime: "8:00 AM", course: "Desert Pines GC" },
        ],
      },
      right: {
        name: "Parker / Chen",
        points: 0,
        golfers: [
          { name: "J. Parker", hcp: 9, thru: "Thru 15", score: "+1", teeTime: "8:00 AM", course: "Desert Pines GC" },
          { name: "M. Chen", hcp: 12, thru: "Thru 15", score: "E", teeTime: "8:00 AM", course: "Desert Pines GC" },
        ],
      },
      gross: { leader: "left", up: 3 },
      net: { leader: "left", up: 2 },
    },
    {
      left: {
        name: "Brooks / Lee",
        golfers: [
          { name: "C. Brooks", hcp: 15, thru: "Thru 13", score: "+4", teeTime: "8:15 AM", course: "Desert Pines GC" },
          { name: "R. Lee", hcp: 18, thru: "Thru 13", score: "+5", teeTime: "8:15 AM", course: "Desert Pines GC" },
        ],
      },
      right: {
        name: "Romero / Nguyen",
        golfers: [
          { name: "D. Romero", hcp: 11, thru: "Thru 13", score: "+2", teeTime: "8:15 AM", course: "Desert Pines GC" },
          { name: "T. Nguyen", hcp: 14, thru: "Thru 13", score: "+3", teeTime: "8:15 AM", course: "Desert Pines GC" },
        ],
      },
      gross: { leader: "right", up: 1 },
      net: { leader: null, up: 0 },
    },
  ],
  leaderboard: GOLF_MATCH_PREVIEW_SINGLES.leaderboard,
};

/** 3. Alternate Shot 2v2 (Foursome) Preview */
export const GOLF_MATCH_PREVIEW_FOURSOME: GolfMatchPreview = {
  ...GOLF_MATCH_PREVIEW_FOURBALL,
  format: "Alternate Shot",
  formatDef: FORMATS.Foursome,
  matches: [
    {
      left: {
        name: "Organizer / Chen",
        golfers: [
          { name: "A. Organizer", hcp: 6, thru: "Thru 18", score: "+2", teeTime: "8:30 AM", course: "Desert Pines GC" },
          { name: "M. Chen", hcp: 12, thru: "Thru 18", score: "+2", teeTime: "8:30 AM", course: "Desert Pines GC" },
        ],
      },
      right: {
        name: "Parker / Romero",
        golfers: [
          { name: "J. Parker", hcp: 9, thru: "Thru 18", score: "+4", teeTime: "8:30 AM", course: "Desert Pines GC" },
          { name: "D. Romero", hcp: 11, thru: "Thru 18", score: "+4", teeTime: "8:30 AM", course: "Desert Pines GC" },
        ],
      },
      gross: { leader: "left", up: 2 },
      net: { leader: "left", up: 1 },
    },
  ],
};

/** 4. Scramble 4-Person Team Preview */
export const GOLF_MATCH_PREVIEW_SCRAMBLE: GolfMatchPreview = {
  round: 3,
  course: "Saguaro Links",
  roundDate: "2027-04-24",
  format: "Scramble",
  formatDef: FORMATS.Scramble,
  roundCount: 4,
  handicap: false,
  par: DEFAULT_PAR,
  sides: [
    { name: "Maroon Group", winPct: 55, fairwayPct: "80%", greenPct: "75%", putts: "27", score: "-8" },
    { name: "White Group", winPct: 45, fairwayPct: "72%", greenPct: "68%", putts: "29", score: "-6" },
  ],
  matches: [
    {
      left: {
        name: "Maroon Scramble Team",
        totalScore: "-8",
        thru: "Thru 16",
        teeTime: "9:00 AM",
        course: "Saguaro Links",
        golfers: [
          { name: "A. Organizer", hcp: 6, thru: "Thru 16", score: "-8", teeTime: "9:00 AM", course: "Saguaro Links" },
          { name: "S. Patel", hcp: 4, thru: "Thru 16", score: "-8", teeTime: "9:00 AM", course: "Saguaro Links" },
          { name: "M. Chen", hcp: 12, thru: "Thru 16", score: "-8", teeTime: "9:00 AM", course: "Saguaro Links" },
          { name: "R. Lee", hcp: 18, thru: "Thru 16", score: "-8", teeTime: "9:00 AM", course: "Saguaro Links" },
        ],
      },
      right: {
        name: "White Scramble Team",
        totalScore: "-6",
        thru: "Thru 16",
        teeTime: "9:00 AM",
        course: "Saguaro Links",
        golfers: [
          { name: "J. Parker", hcp: 9, thru: "Thru 16", score: "-6", teeTime: "9:00 AM", course: "Saguaro Links" },
          { name: "D. Romero", hcp: 11, thru: "Thru 16", score: "-6", teeTime: "9:00 AM", course: "Saguaro Links" },
          { name: "C. Brooks", hcp: 15, thru: "Thru 16", score: "-6", teeTime: "9:00 AM", course: "Saguaro Links" },
          { name: "T. Nguyen", hcp: 14, thru: "Thru 16", score: "-6", teeTime: "9:00 AM", course: "Saguaro Links" },
        ],
      },
      gross: { leader: "left", up: 2 },
      net: null,
    },
  ],
  leaderboard: [
    {
      position: "1", total: "-8", thru: "16", netTotal: "-8", netToday: "-8", today: "-8",
      holes: [3, 4, 3, 3, 4, 3, 2, 4, 3, 4, 3, 3, 4, 3, 4, 3, null, null],
      golfer: { name: "Maroon Foursome", hcp: 0, thru: "Thru 16", score: "-8", teeTime: "9:00 AM", course: "Saguaro Links" },
    },
    {
      position: "2", total: "-6", thru: "16", netTotal: "-6", netToday: "-6", today: "-6",
      holes: [4, 4, 3, 4, 4, 4, 2, 4, 4, 4, 4, 3, 4, 4, 4, 3, null, null],
      golfer: { name: "White Foursome", hcp: 0, thru: "Thru 16", score: "-6", teeTime: "9:00 AM", course: "Saguaro Links" },
    },
  ],
};

/** 5. Stableford Points Preview */
export const GOLF_MATCH_PREVIEW_STABLEFORD: GolfMatchPreview = {
  round: 4,
  course: "Saguaro Links",
  roundDate: "2027-04-25",
  format: "Stableford",
  formatDef: FORMATS.Stableford,
  roundCount: 4,
  handicap: true,
  par: DEFAULT_PAR,
  sides: [
    { name: "Team Alex", winPct: 58, fairwayPct: "65%", greenPct: "60%", putts: "28", score: "78 PTS" },
    { name: "Team Jordan", winPct: 42, fairwayPct: "55%", greenPct: "45%", putts: "31", score: "69 PTS" },
  ],
  matches: GOLF_MATCH_PREVIEW_SINGLES.matches,
  leaderboard: [
    { position: "1", total: "42 PTS", thru: "18", netTotal: "48 PTS", netToday: "48 PTS", today: "42 PTS", pointsTotal: 42, pointsToday: 42,
      holes: [4, 4, 3, 4, 5, 4, 2, 5, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4],
      golfer: { name: "A. Organizer", hcp: 6, thru: "F", score: "42 PTS", teeTime: "8:30 AM", course: "Saguaro Links" } },
    { position: "2", total: "39 PTS", thru: "18", netTotal: "44 PTS", netToday: "44 PTS", today: "39 PTS", pointsTotal: 39, pointsToday: 39,
      holes: [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5],
      golfer: { name: "S. Patel", hcp: 4, thru: "F", score: "39 PTS", teeTime: "8:50 AM", course: "Saguaro Links" } },
    { position: "3", total: "36 PTS", thru: "18", netTotal: "47 PTS", netToday: "47 PTS", today: "36 PTS", pointsTotal: 36, pointsToday: 36,
      holes: [5, 5, 3, 4, 4, 5, 3, 5, 4, 5, 4, 3, 5, 4, 4, 4, 4, 5],
      golfer: { name: "M. Chen", hcp: 12, thru: "F", score: "36 PTS", teeTime: "8:40 AM", course: "Saguaro Links" } },
    { position: "4", total: "34 PTS", thru: "18", netTotal: "43 PTS", netToday: "43 PTS", today: "34 PTS", pointsTotal: 34, pointsToday: 34,
      holes: [4, 6, 3, 4, 5, 4, 3, 5, 4, 5, 5, 3, 5, 4, 5, 3, 4, 5],
      golfer: { name: "D. Romero", hcp: 11, thru: "F", score: "34 PTS", teeTime: "8:40 AM", course: "Saguaro Links" } },
    { position: "5", total: "32 PTS", thru: "18", netTotal: "40 PTS", netToday: "40 PTS", today: "32 PTS", pointsTotal: 32, pointsToday: 32,
      holes: [5, 5, 4, 4, 4, 5, 3, 6, 4, 5, 4, 3, 5, 4, 5, 4, 4, 5],
      golfer: { name: "J. Parker", hcp: 9, thru: "F", score: "32 PTS", teeTime: "8:30 AM", course: "Saguaro Links" } },
  ],
};

export const GOLF_MATCH_PREVIEWS: Record<string, GolfMatchPreview> = {
  singles: GOLF_MATCH_PREVIEW_SINGLES,
  fourball: GOLF_MATCH_PREVIEW_FOURBALL,
  foursome: GOLF_MATCH_PREVIEW_FOURSOME,
  scramble: GOLF_MATCH_PREVIEW_SCRAMBLE,
  stableford: GOLF_MATCH_PREVIEW_STABLEFORD,
  bestball: { ...GOLF_MATCH_PREVIEW_FOURBALL, format: "Best Ball", formatDef: FORMATS.BestBall },
  shamble: { ...GOLF_MATCH_PREVIEW_SCRAMBLE, format: "Shamble", formatDef: FORMATS.Shamble },
  chapman: { ...GOLF_MATCH_PREVIEW_FOURSOME, format: "Chapman", formatDef: { ...FORMATS.Foursome, label: "Chapman", description: "Pairs play both tee shots, switch balls for the second shot, then choose one ball and alternate shots." } },
  singlesstroke: { ...GOLF_MATCH_PREVIEW_SINGLES, format: "Singles Stroke Play", formatDef: FORMATS.SinglesStroke },
  custom: { ...GOLF_MATCH_PREVIEW_SINGLES, format: "Custom Format", formatDef: FORMATS.Custom },
};

/** Default preview matching previous export for complete backward compatibility. */
export const GOLF_MATCH_PREVIEW: GolfMatchPreview = GOLF_MATCH_PREVIEW_SINGLES;

/** Made-up current weather for the preview's Home quick-weather area (matches the course forecast below; not real weather). */
export const GOLF_PREVIEW_TRIP_WEATHER: TripWeather = {
  status: "ok",
  weather: { temperature: 78, temperatureUnit: "F", condition: "Partly Cloudy", high: 84, low: 61, precipitationChance: 10, windSpeed: "8 mph", windDirection: "SW", updatedAt: "2027-04-22T08:00:00Z" },
};

/** Made-up course forecast for the preview's Golf tab weather card (not real weather). */
export const GOLF_PREVIEW_COURSE_WEATHER = {
  temperature: 78,
  stats: [["High", "84°"], ["Low", "61°"], ["Wind", "8 mph SW"], ["Rain", "10%"]],
  hours: [["8 AM", "64°"], ["10 AM", "71°"], ["12 PM", "78°"], ["2 PM", "83°"], ["4 PM", "81°"]],
} as const;

/** Made-up flights for the preview's Info → Flights card (a connection out, a nonstop home). */
const previewFlight = (id: string, direction: GolfTripFlight["direction"], airline: string, flightNumber: string, from: string, to: string, departs: string, arrives: string): GolfTripFlight =>
  ({ id, direction, airline, flightNumber, departureAirport: from, arrivalAirport: to, departureLocal: departs, arrivalLocal: arrives,
    confirmationNumber: null, notes: null, source: "manual", liveStatus: null, departureTerminal: null, departureGate: null, arrivalTerminal: null, arrivalGate: null });
export const GOLF_TRIP_PREVIEW_FLIGHTS: GolfTripFlight[] = [
  previewFlight("preview-1", "arrival", "American Airlines", "AA1234", "RDU", "DFW", "2027-04-22T06:10", "2027-04-22T08:05"),
  previewFlight("preview-2", "arrival", "American Airlines", "AA2210", "DFW", "PHX", "2027-04-22T09:15", "2027-04-22T10:05"),
  previewFlight("preview-3", "return", "American Airlines", "AA987", "PHX", "RDU", "2027-04-25T13:40", "2027-04-25T21:02"),
];

/**
 * DEV ONLY: the mock trip's itinerary (Friends Golf Weekend, Phoenix area, Apr 22–25 2027), matching its flights and
 * courses. Feeds the Home "what's next" cards and Info → Itinerary. Made up; real trips don't have an itinerary yet.
 */
export const GOLF_TRIP_MOCK_ITINERARY: ItineraryItem[] = [
  { id: "it-flight-out-1", kind: "flight", title: "AA1234 · RDU → DFW", detail: "American Airlines · Lands 8:05 AM", startsAt: "2027-04-22T06:10" },
  { id: "it-flight-out-2", kind: "flight", title: "AA2210 · DFW → PHX", detail: "American Airlines · Lands 10:05 AM", startsAt: "2027-04-22T09:15" },
  { id: "it-car-pickup", kind: "ride", title: "Rental car pickup", detail: "PHX Sky Harbor · Rental Car Center", startsAt: "2027-04-22T10:45" },
  { id: "it-hotel-in", kind: "lodging", title: "The Shorebreak Villas", detail: "Check-in · 3 nights", startsAt: "2027-04-22T15:00" },
  { id: "it-dinner-1", kind: "dining", title: "Fireside Grill", detail: "Dinner reservation · 8 people", startsAt: "2027-04-22T19:30" },
  { id: "it-tee-1", kind: "teeTime", title: "Desert Pines GC", detail: "Round 1 · Tee time", startsAt: "2027-04-23T08:30" },
  { id: "it-dinner-2", kind: "dining", title: "Canyon Steakhouse", detail: "Dinner reservation · 8 people", startsAt: "2027-04-23T19:00" },
  { id: "it-tee-2", kind: "teeTime", title: "Canyon Ridge", detail: "Round 2 · Tee time", startsAt: "2027-04-24T09:10" },
  { id: "it-hotel-out", kind: "lodging", title: "The Shorebreak Villas", detail: "Check-out", startsAt: "2027-04-25T10:00" },
  { id: "it-car-return", kind: "ride", title: "Rental car return", detail: "PHX Sky Harbor · Rental Car Center", startsAt: "2027-04-25T11:30" },
  { id: "it-flight-home", kind: "flight", title: "AA987 · PHX → RDU", detail: "American Airlines · Lands 9:02 PM", startsAt: "2027-04-25T13:40" },
];
