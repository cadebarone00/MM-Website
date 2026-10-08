import type { ComponentProps } from "react";
import type { GolfTripHome } from "@/components/platform/GolfTripHome";
import type { GolfTripDraft } from "@/lib/platform/golfTripDraft";
import { GOLF_MATCH_PREVIEW, GOLF_MATCH_PREVIEWS, GOLF_TRIP_MOCK_DRAFT, matchWinPct, normalizeCompetitor, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { flightSummary } from "@/lib/platform/golfTripFlights";
import type { SimulatorConfig } from "./simulator";

export type SimulatorTripData = Pick<ComponentProps<typeof GolfTripHome>, "preview" | "previewMatch" | "flights" | "travel">;

/** Deterministic fictional crowd, derived from the existing generic format fixture. `names` (randomized busy data) replaces "Guest Golfer N". */
export function populatedMatch(sample: GolfMatchPreview, count: number, names?: string[]): GolfMatchPreview {
  const leaderboard = Array.from({ length: count }, (_, index) => {
    const row = sample.leaderboard[index % sample.leaderboard.length];
    return { ...row, position: String(index + 1), golfer: { ...row.golfer, name: names?.[index] ?? `Guest Golfer ${index + 1}` }, holes: [...row.holes] };
  });
  const matches = Array.from({ length: Math.ceil(count / 2) }, (_, index) => ({
    left: leaderboard[index * 2].golfer, right: leaderboard[index * 2 + 1]?.golfer,
    gross: sample.matches[index % sample.matches.length]?.gross ?? null,
    net: sample.matches[index % sample.matches.length]?.net ?? null,
  }));
  return { ...sample, roundCount: 8, leaderboard, matches };
}

const toParLabel = (value: number) => value === 0 ? "E" : value > 0 ? `+${value}` : String(value);

/** Small seeded random generator (mulberry32): the same seed gives the same numbers, so server and browser agree. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mock trips only: a varied field. Each golfer gets a skill (great → rough), a separate "form today" (so some are under
 * par today but over for the tournament, and the other way round), and a score from earlier rounds. One hole's strokes
 * over par come from a spread that leans with skill + form: birdies and the odd eagle for good play, doubles and worse
 * for bad. Seeded by golfer and round state, so each state has its own mix that stays the same on every load.
 */
function mixedRound(index: number, roundState: string, par: number[], holesPlayed: number, roundsBefore: number, seed = 0) {
  const random = seededRandom((index + 1) * 7919 + roundState.length * 104729 + roundState.charCodeAt(0) * 31 + seed * 2654435761);
  // Skill ≈ strokes over par per hole: -0.16 / -0.1 / -0.04 / 0.02 / 0.08 / 0.14 ≈ -2 / +1 / +5 / +9 / +14 / +18 a round.
  // Built-in contrast: every 4th golfer is a weaker player on a hot day (under today, over for the tournament), the next a
  // strong player on a cold day (over today, under overall); everyone else has normal ups and downs (about ±3 strokes).
  const pick = (options: number[]) => options[Math.floor(random() * options.length)];
  const story = index % 4;
  const skill = story === 0 ? pick([0.02, 0.08]) : story === 1 ? pick([-0.16, -0.1]) : pick([-0.16, -0.1, -0.04, 0.02, 0.08, 0.14]);
  const form = story === 0 ? -0.2 - random() * 0.04 : story === 1 ? 0.16 + random() * 0.04 : (random() - 0.5) * 0.08;
  const holeScore = (holePar: number, lean: number) => {
    const roll = random() + lean;
    const overPar = roll < 0.01 && holePar >= 5 ? -2 : roll < 0.15 ? -1 : roll < 0.6 ? 0 : roll < 0.85 ? 1 : roll < 0.96 ? 2 : 3;
    return Math.max(1, holePar + overPar);
  };
  const holes = Array.from({ length: 18 }, (_, hole) => hole >= holesPlayed ? null : holeScore(par[hole] ?? 4, skill + form));
  let before = 0;
  for (let round = 0; round < roundsBefore; round++) for (let hole = 0; hole < 18; hole++) before += holeScore(par[hole] ?? 4, skill) - (par[hole] ?? 4);
  return { holes, before };
}

/**
 * Round-state simulator conditions. Every state builds the same sample each time, from whatever the source has (the mock
 * is mid-round, the Maroon data is a finished event without hole-by-hole scores), filling missing holes with par-based
 * scores. scheduled: round 1, nothing played. live: holes 1–9 played. between: round 3 finished, round 4 next.
 * complete: the last round finished.
 */
/**
 * Mock / busy data: matches for every round, so the Matches list can step through them. Each round re-pairs the same
 * players (the right-hand sides rotate one place a round). Rounds before the current one are over (a random final
 * result: halved, "1 UP", or won "u&r" with r holes left); the current one depends on the round state (live: each match
 * at a random hole with a random, not-yet-decided standing; just ended / between / complete: over; before round 1:
 * not started); later rounds haven't started. Seeded, so the same state shows the same results every time.
 */
function roundByRoundMatches(match: GolfMatchPreview, current: number, currentState: "pre" | "live" | "final", seed: number): GolfMatchPreview["matches"] {
  const base = match.matches.filter(pairing => pairing.round === undefined || pairing.round === match.round);
  if (!base.length) return match.matches;
  const random = seededRandom(seed * 7919 + current * 104729 + currentState.length * 31 + 17);
  const withThru = (side: GolfMatchPreview["matches"][number]["left"], thru: string) => {
    const comp = normalizeCompetitor(side);
    return { ...comp, thru, golfers: comp.golfers.map(golfer => ({ ...golfer, thru, score: thru ? golfer.score : "—" })) };
  };
  const rights = base.map(pairing => pairing.right);
  const all: GolfMatchPreview["matches"] = [];
  // A match's own stats for its box: fairways / greens hit, putts and score to par for the holes played (none before it starts).
  const sideStats = (name: string, holes: number, winPct: number) => {
    if (!holes) return { name, winPct, fairwayPct: "—", greenPct: "—", putts: "—", score: "—" };
    const toPar = Math.round((random() - 0.35) * holes / 2.5);
    return { name, winPct, fairwayPct: `${30 + Math.floor(random() * 50)}%`, greenPct: `${20 + Math.floor(random() * 50)}%`,
      putts: String(Math.round(holes * (1.6 + random() * 0.5))), score: toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar) };
  };
  const matchSides = (pairing: GolfMatchPreview["matches"][number], right: GolfMatchPreview["matches"][number]["right"], holes: number, leftPct: number) =>
    [sideStats(normalizeCompetitor(pairing.left).name ?? match.sides[0].name, holes, leftPct), sideStats((right && normalizeCompetitor(right).name) ?? match.sides[1].name, holes, 100 - leftPct)] as [GolfMatchPreview["sides"][0], GolfMatchPreview["sides"][1]];
  for (let round = 1; round <= Math.max(1, match.roundCount); round++) {
    const state = round < current ? "final" : round > current ? "pre" : currentState;
    base.forEach((pairing, index) => {
      const right = rights[(index + round - 1) % rights.length];
      if (state === "pre") {
        all.push({ ...pairing, round, right: right && withThru(right, ""), left: withThru(pairing.left, ""), gross: null, net: null, result: undefined, sides: matchSides(pairing, right, 0, 50) });
        return;
      }
      if (state === "live") {
        const holes = 1 + Math.floor(random() * 17);
        // All square about one time in five; otherwise up by 1 to as many as can still be caught (never more than holes left).
        const up = random() < 0.2 ? 0 : 1 + Math.floor(random() * Math.min(holes, 18 - holes));
        const standing = up === 0 ? { leader: null, up: 0 } : { leader: random() < 0.5 ? "left" as const : "right" as const, up };
        all.push({ ...pairing, round, right: right && withThru(right, `Thru ${holes}`), left: withThru(pairing.left, `Thru ${holes}`), gross: standing, net: standing, result: undefined,
          sides: matchSides(pairing, right, holes, matchWinPct(standing, holes, false)) });
        return;
      }
      // Over: halved about one match in six; otherwise won by 1–5, finishing on the last hole or with holes to spare.
      const halved = random() < 0.17;
      const up = 1 + Math.floor(random() * 5);
      const left = up === 1 ? 0 : Math.floor(random() * up);
      const standing = halved ? { leader: null, up: 0 } : { leader: random() < 0.5 ? "left" as const : "right" as const, up };
      const result = halved ? "AS" : left > 0 ? `${up}&${left}` : `${up} UP`;
      all.push({ ...pairing, round, right: right && withThru(right, "F"), left: withThru(pairing.left, "F"), gross: standing, net: standing, result,
        sides: matchSides(pairing, right, 18 - left, matchWinPct(standing, 18, true)) });
    });
  }
  return all;
}

function withRoundState(match: GolfMatchPreview, roundState: Exclude<SimulatorConfig["state"]["roundStatus"], "source">, mixed = false, seed = 0): GolfMatchPreview {
  const resetGolfer = (golfer: ReturnType<typeof normalizeCompetitor>["golfers"][number]) => ({ ...golfer, thru: "—", score: "—", points: 0 });
  if (roundState === "scheduled" && mixed) return { ...withRoundState(match, "scheduled", false, seed), matches: roundByRoundMatches({ ...match, round: 1 }, 1, "pre", seed) };
  if (roundState === "scheduled") {
    return { ...match, round: 1,
      matches: match.matches.map(pairing => ({ ...pairing, gross: null, net: null,
        left: { ...normalizeCompetitor(pairing.left), golfers: normalizeCompetitor(pairing.left).golfers.map(resetGolfer) },
        right: pairing.right ? { ...normalizeCompetitor(pairing.right), golfers: normalizeCompetitor(pairing.right).golfers.map(resetGolfer) } : undefined,
      })),
      leaderboard: match.leaderboard.map(row => ({ ...row, golfer: resetGolfer(row.golfer), total: "—", netTotal: "—", today: "—", netToday: "—", thru: "—", holes: Array(18).fill(null) })),
    };
  }
  const holesPlayed = roundState === "live" ? 9 : 18;
  const roundCount = roundState === "between" ? Math.max(4, match.roundCount) : match.roundCount;
  const round = roundState === "between" ? 3 : roundState === "complete" ? roundCount : Math.min(match.round, roundCount);
  const thru = holesPlayed === 18 ? "F" : String(holesPlayed);
  const par = match.par;
  // Rounds already finished before today's: live plays the current round, between has finished round 3, complete the last.
  const roundsBefore = round - 1;
  let leaderboard = match.leaderboard.map((row, index) => {
    // Mock trips get a varied field (mixedRound). Otherwise played holes keep the source's score, or get par give or take
    // one (same every time, different per golfer), and the round is the whole tournament so far.
    const generated = mixed ? mixedRound(index, roundState, par, holesPlayed, roundsBefore, seed) : null;
    const holes = generated ? generated.holes : Array.from({ length: 18 }, (_, hole) => hole >= holesPlayed ? null
      : row.holes[hole] ?? (par[hole] ?? 4) + ((index + hole) % 5 === 0 ? 1 : (index * 3 + hole) % 7 === 0 ? -1 : 0));
    const today = holes.reduce<number>((sum, strokes, hole) => sum + (strokes === null ? 0 : strokes - (par[hole] ?? 4)), 0);
    const total = today + (generated?.before ?? 0);
    const hcp = row.golfer.hcp ?? 0;
    const label = toParLabel(total);
    return { ...row, holes, thru, today: toParLabel(today), total: label,
      netToday: toParLabel(today - Math.round(hcp * holesPlayed / 18)),
      netTotal: toParLabel(total - Math.round(hcp * ((generated ? roundsBefore : 0) + holesPlayed / 18))),
      golfer: { ...row.golfer, thru: thru === "F" ? "F" : `Thru ${thru}`, score: label } };
  });
  // Mock trips: order by total (lowest first) and number the positions, with ties shown as T2, T2, …
  if (mixed) {
    const value = (label: string) => label === "E" ? 0 : Number(label);
    leaderboard = [...leaderboard].sort((a, b) => value(a.total) - value(b.total));
    leaderboard = leaderboard.map((row, index, rows) => {
      const first = rows.findIndex(other => other.total === row.total);
      const tied = rows.filter(other => other.total === row.total).length > 1;
      return { ...row, position: `${tied ? "T" : ""}${first + 1}` };
    });
  }
  const golferThru = (golfer: ReturnType<typeof normalizeCompetitor>["golfers"][number]) => ({ ...golfer, thru: thru === "F" ? "F" : `Thru ${thru}` });
  if (mixed) return { ...match, round, roundCount, leaderboard,
    matches: roundByRoundMatches({ ...match, roundCount }, round, roundState === "live" ? "live" : "final", seed) };
  return { ...match, round, roundCount, leaderboard,
    matches: match.matches.map(pairing => ({ ...pairing,
      left: { ...normalizeCompetitor(pairing.left), golfers: normalizeCompetitor(pairing.left).golfers.map(golferThru) },
      right: pairing.right ? { ...normalizeCompetitor(pairing.right), golfers: normalizeCompetitor(pairing.right).golfers.map(golferThru) } : undefined,
    })),
  };
}

/**
 * "Just created": a trip right after the organizer finishes Create Golf Trip — every questionnaire answer filled in
 * (name, you, dates, destination, players expected, golf days, rounds a day, courses, tournament yes) and nothing else:
 * only the organizer has joined, no scores, teams, tee times, travel or games yet.
 */
export const JUST_CREATED_DRAFT: GolfTripDraft = {
  yourName: "Jordan Lee", yourEmail: "jordan@example.com", tripName: "Myrtle Beach Golf Trip",
  destination: "Myrtle Beach, SC, USA", destinationLatitude: "33.6891", destinationLongitude: "-78.8867",
  startDate: "2027-05-13", endDate: "2027-05-16", playerCount: "12", golfDays: "3", includesTournament: "yes",
  knowsFlights: "no", knowsLodging: "no", knowsTransportation: "no",
  day1Date: "2027-05-13", day1Rounds: "1", day2Date: "2027-05-14", day2Rounds: "2", day3Date: "2027-05-15", day3Rounds: "1",
  round1Course: "Caledonia Golf & Fish Club", round2Course: "True Blue Golf Club", round3Course: "Tidewater Golf Club", round4Course: "The Dunes Golf & Beach Club",
};

/** Adds days to "YYYY-MM-DD". */
const shiftDay = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** The default busy trip (no seed): Summer Golf Festival, Pinehurst, Apr 22–25 2027, two rounds a day. */
function defaultBusyDraft(): GolfTripDraft {
  const preview: GolfTripDraft = { ...GOLF_TRIP_MOCK_DRAFT, tripName: "Summer Golf Festival", destination: "Pinehurst, North Carolina", destinationLatitude: "35.1954", destinationLongitude: "-79.4695", playerCount: "32", golfDays: "4" };
  for (let day = 1; day <= 4; day++) {
    preview[`day${day}Date`] = `2027-04-${21 + day}`;
    preview[`day${day}Rounds`] = "2";
    preview[`round${day * 2 - 1}Course`] = `Festival Course ${day} · Morning`;
    preview[`round${day * 2}Course`] = `Festival Course ${day} · Afternoon`;
  }
  return preview;
}

// Made-up pieces for the randomized mock trip (fictional people, courses and restaurants; real places and airports).
const TRIP_NAMES = ["Spring Golf Getaway", "Buddies Trip", "Annual Golf Weekend", "The Classic", "Fairway Escape", "Links Week", "Birthday Golf Trip", "The Invitational"];
const PLACES = [
  { destination: "Scottsdale, AZ, USA", lat: "33.4942", lng: "-111.9261", airport: "PHX", town: "Scottsdale" },
  { destination: "Pinehurst, NC, USA", lat: "35.1954", lng: "-79.4695", airport: "RDU", town: "Pinehurst" },
  { destination: "Myrtle Beach, SC, USA", lat: "33.6891", lng: "-78.8867", airport: "MYR", town: "Myrtle Beach" },
  { destination: "Bandon, OR, USA", lat: "43.1190", lng: "-124.4084", airport: "OTH", town: "Bandon" },
  { destination: "Kohler, WI, USA", lat: "43.7397", lng: "-87.7817", airport: "MKE", town: "Kohler" },
  { destination: "Palm Springs, CA, USA", lat: "33.8303", lng: "-116.5453", airport: "PSP", town: "Palm Springs" },
  { destination: "St Andrews, UK", lat: "56.3398", lng: "-2.7967", airport: "EDI", town: "St Andrews" },
  { destination: "Cabo San Lucas, B.C.S., Mexico", lat: "22.8905", lng: "-109.9167", airport: "SJD", town: "Cabo San Lucas" },
];
const HOME_AIRPORTS = ["RDU", "ATL", "ORD", "DFW", "BOS", "DEN", "SEA", "LAX", "JFK", "MSP", "CLT"];
const AIRLINES = [{ name: "American Airlines", code: "AA" }, { name: "Delta", code: "DL" }, { name: "United", code: "UA" }, { name: "Southwest", code: "WN" }];
const COURSE_WORDS = [["Desert", "Canyon", "Pine", "Ocean", "Eagle", "Heron", "Willow", "Granite", "Coyote", "Sandpiper"], ["Ridge", "Dunes", "Valley", "Links", "Creek", "Point", "Hollow", "Bluff", "Meadows", "Pines"]];
const RESTAURANTS = ["Fireside Grill", "Canyon Steakhouse", "The Clubhouse Tavern", "Harbor Oyster Bar", "Saltgrass Kitchen", "The 19th Hole", "Mesa Cantina", "Copper Pot Bistro", "Driftwood Smokehouse", "Pin High Pizza"];
const LODGING = ["The Fairway Villas", "Links Lodge", "Seaside Golf Resort", "Ridgeview Inn", "The Clubhouse Suites", "Palm Court Resort"];
const ROUND_FORMATS = ["singles", "fourball", "foursome", "scramble", "shamble", "chapman", "stableford", "singlesstroke"];
const FIRST = ["Alex", "Jordan", "Taylor", "Casey", "Riley", "Morgan", "Jamie", "Drew", "Avery", "Quinn", "Parker", "Reese", "Logan", "Hayden", "Cameron", "Rowan", "Blake", "Emerson", "Finley", "Sawyer"];
const LAST = ["Brooks", "Carter", "Diaz", "Ellis", "Foster", "Grant", "Hayes", "Irwin", "Jensen", "Keller", "Lopez", "Monroe", "Nash", "Ortiz", "Price", "Quinn", "Reyes", "Shaw", "Turner", "Vance"];

const pickFrom = <T,>(random: () => number, list: readonly T[]) => list[Math.floor(random() * list.length)];
/** A clock time between `from` and `to` ("HH:MM", inclusive) on a `step`-minute grid. */
const timeBetween = (random: () => number, from: string, to: string, step = 10) => {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const slots = Math.floor((minutes(to) - minutes(from)) / step);
  const at = minutes(from) + step * Math.floor(random() * (slots + 1));
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
};
const addMinutes = (stamp: string, minutes: number) => new Date(Date.parse(`${stamp}:00Z`) + minutes * 60000).toISOString().slice(0, 16);

/**
 * "Randomize data" on the mock trip: a whole new trip that reads like a real one, from `seed` (same seed = same trip).
 * - 4–32 players, mostly in fours; random names; random scores (round 1 in play, thru 9).
 * - Arrive the day before golf (morning flight out, rental car after landing, hotel check-in at 3–4 PM); 2–4 golf days of
 *   1–2 rounds at made-up courses with a random format each; leave the morning after the last round (check out 10–11 AM,
 *   return the car 2 hours before a midday / afternoon flight home).
 * - Tee times never before 7:00 AM: one round a day goes off 7:00–9:50, two rounds go 7:00–8:30 and 12:30–1:30 PM.
 * - Dinner every night 6:30–8:00 PM. Everyone is on the tee times and dinners; the flights, car and hotel are the organizer's.
 */
export function randomMockTrip(mock: SimulatorTripData, seed: number, playerCount: number | null): SimulatorTripData {
  const random = seededRandom(seed);
  const place = pickFrom(random, PLACES);
  const home = pickFrom(random, HOME_AIRPORTS.filter(code => code !== place.airport));
  const airline = pickFrom(random, AIRLINES);
  const players = playerCount ?? (random() < 0.8 ? 4 * (1 + Math.floor(random() * 8)) : 4 + Math.floor(random() * 29));
  const used = new Set<string>();
  const names = Array.from({ length: players }, () => {
    let name = "";
    do name = `${pickFrom(random, FIRST)} ${pickFrom(random, LAST)}`; while (used.has(name) && used.size < FIRST.length * LAST.length);
    used.add(name);
    return name;
  });
  const golfDays = 2 + Math.floor(random() * 3);
  const arrival = new Date(Date.UTC(2027, 0, 1) + (30 + Math.floor(random() * 300)) * 86400000).toISOString().slice(0, 10);
  const departure = shiftDay(arrival, golfDays + 1);
  const preview: GolfTripDraft = {
    ...GOLF_TRIP_MOCK_DRAFT, yourName: names[0], tripName: pickFrom(random, TRIP_NAMES), destination: place.destination,
    destinationLatitude: place.lat, destinationLongitude: place.lng, playerCount: String(players), golfDays: String(golfDays),
    startDate: arrival, endDate: departure, knowsFlights: "yes", knowsLodging: "yes", knowsTransportation: "yes",
  };
  type Item = NonNullable<SimulatorTripData["travel"]>["items"][number];
  const items: Item[] = [];
  const add = (id: string, kind: Item["kind"], details: Item["details"], startsAt: string, endsAt: string | undefined, source: Item["source"]) =>
    items.push({ id, kind, details, startsAt, ...(endsAt ? { endsAt } : {}), createdBy: "organizer", source, joinPolicy: "none", optOutAllowed: kind !== "teeTime" });
  // Getting there: morning flight, rental car after landing, hotel at check-in time.
  const outAt = `${arrival}T${timeBetween(random, "06:00", "09:30")}`;
  const landsAt = addMinutes(outAt, 120 + 10 * Math.floor(random() * 19));
  add("rnd-flight-out", "flight", { airline: airline.name, flightNumber: `${airline.code}${100 + Math.floor(random() * 2800)}`, from: home, to: place.airport }, outAt, landsAt, "mine");
  // Golf days, rounds, courses, formats and tee times.
  let round = 0;
  const formats: string[] = [];
  for (let day = 1; day <= golfDays; day++) {
    const date = shiftDay(arrival, day);
    const count = random() < 0.6 ? 1 : 2;
    preview[`day${day}Date`] = date;
    preview[`day${day}Rounds`] = String(count);
    const times = count === 1 ? [timeBetween(random, "07:00", "09:50")] : [timeBetween(random, "07:00", "08:30"), timeBetween(random, "12:30", "13:30")];
    for (const time of times) {
      round++;
      const course = `${pickFrom(random, COURSE_WORDS[0])} ${pickFrom(random, COURSE_WORDS[1])} GC`;
      const format = pickFrom(random, ROUND_FORMATS);
      formats.push(format);
      preview[`round${round}Course`] = course;
      preview[`round${round}Format`] = (GOLF_MATCH_PREVIEWS[format] ?? GOLF_MATCH_PREVIEW).formatDef?.label ?? format;
      preview[`round${round}Scoring`] = pickFrom(random, ["Gross", "Net", "Both"]);
      add(`rnd-tee-${round}`, "teeTime", { name: course, note: `Round ${round}` }, `${date}T${time}`, undefined, "organizer");
    }
  }
  // The rest of the stay: car, hotel, a dinner every night, the flight home.
  const homeAt = `${departure}T${timeBetween(random, "12:00", "17:00")}`;
  add("rnd-car", "ride", { rideType: "rental", place: `${place.airport} · Rental Car Center`, seats: 4 }, addMinutes(landsAt, 40), addMinutes(homeAt, -120), "mine");
  add("rnd-hotel", "lodging", { name: pickFrom(random, LODGING), place: place.town }, `${arrival}T${random() < 0.5 ? "15:00" : "16:00"}`, `${departure}T${random() < 0.5 ? "10:00" : "11:00"}`, "mine");
  for (let night = 0; night <= golfDays; night++) {
    add(`rnd-dinner-${night}`, "dining", { name: pickFrom(random, RESTAURANTS), note: `Reservation for ${players}` }, `${shiftDay(arrival, night)}T${timeBetween(random, "18:30", "20:00", 15)}`, undefined, "organizer");
  }
  add("rnd-flight-home", "flight", { airline: airline.name, flightNumber: `${airline.code}${100 + Math.floor(random() * 2800)}`, from: place.airport, to: home }, homeAt, addMinutes(homeAt, 120 + 10 * Math.floor(random() * 19)), "mine");
  const members = names.map((name, index) => ({ id: `rnd-p${index}`, name, role: index === 0 ? "organizer" as const : "player" as const }));
  const participants = items.flatMap(item => item.source === "organizer"
    ? members.map(member => ({ itemId: item.id, memberId: member.id, status: "going" as const }))
    : [{ itemId: item.id, memberId: members[0].id, status: "going" as const }]);
  const travel = { meId: members[0].id, members, items: items.sort((x, y) => x.startsAt.localeCompare(y.startsAt)), participants };
  // Golf: round 1's format, the field, random scores with round 1 in play.
  const sample = GOLF_MATCH_PREVIEWS[formats[0]] ?? GOLF_MATCH_PREVIEW;
  const scoring = preview.round1Scoring as "Gross" | "Net" | "Both";
  const field = { ...populatedMatch(sample, players, names), round: 1, course: preview.round1Course, roundDate: preview.day1Date, roundCount: round, scoring, handicap: scoring !== "Gross" };
  return { ...mock, preview, travel, previewMatch: withRoundState(field, "live", true, seed) };
}

/** The just-created trip's travel: only the organizer, nothing booked. One shared object, so it reads as "unchanged". */
export const JUST_CREATED_TRAVEL: NonNullable<SimulatorTripData["travel"]> = {
  meId: "organizer", members: [{ id: "organizer", name: JUST_CREATED_DRAFT.yourName, role: "organizer" }], items: [], participants: [],
};

/** Pure presentation overrides; never edit the imported tournament or fixture objects. */
export function simulatorTripData(mock: SimulatorTripData, maroon: SimulatorTripData, config: SimulatorConfig): SimulatorTripData {
  const { source, state } = config;
  let base = source === "maroon" ? maroon : mock;
  if (source === "empty") {
    // Just created: the onboarding answers, round 1 not started, no players' scores, and travel with only the organizer (so
    // the Itinerary is empty and + Add works).
    const side = { winPct: 0, fairwayPct: "—", greenPct: "—", putts: "—", score: "—" };
    const draft = JUST_CREATED_DRAFT;
    base = {
      preview: { ...draft },
      previewMatch: { ...(mock.previewMatch ?? GOLF_MATCH_PREVIEW), course: draft.round1Course, roundDate: draft.day1Date, matches: [], leaderboard: [], round: 1, roundCount: 4, sides: [{ ...side, name: "Team A" }, { ...side, name: "Team B" }] },
      flights: { summary: flightSummary([], draft.startDate), href: null },
      travel: JUST_CREATED_TRAVEL,
    };
  }
  if (source === "mock" && state.seed) base = randomMockTrip(mock, state.seed, state.playerCount);
  if (source === "busy") base = { ...mock, preview: defaultBusyDraft(), previewMatch: populatedMatch(mock.previewMatch ?? GOLF_MATCH_PREVIEW, state.playerCount ?? 32) };
  const preview = { ...base.preview };
  if (state.competition !== "source") preview.includesTournament = state.competition;
  if (state.playerCount !== null) preview.playerCount = String(state.playerCount);
  let previewMatch = base.previewMatch;
  if (previewMatch && state.format !== "source" && GOLF_MATCH_PREVIEWS[state.format]) {
    const format = GOLF_MATCH_PREVIEWS[state.format];
    // Keep the real roster/matches; change only the format presentation metadata.
    previewMatch = { ...previewMatch, format: format.format, formatDef: format.formatDef };
  }
  if (previewMatch && state.roundStatus !== "source") previewMatch = withRoundState(previewMatch, state.roundStatus, source !== "maroon", source === "mock" ? state.seed ?? 0 : 0);
  return { ...base, preview, previewMatch };
}

/**
 * Whether a round is being played, so the Scoring sheet shows: a live round, or one just finished but not yet submitted.
 * Before the first round, between rounds and after the trip there is nothing to score. "From data source" counts as live
 * when someone has started today's round but not finished it.
 */
export function simulatorRoundLive(roundStatus: SimulatorConfig["state"]["roundStatus"], match: GolfMatchPreview | undefined): boolean {
  if (roundStatus !== "source") return roundStatus === "live" || roundStatus === "roundEnd";
  return Boolean(match?.leaderboard.some(row => row.holes.some(strokes => strokes !== null) && row.holes.some(strokes => strokes === null)));
}

/** A Scoring-sheet card filled in for the "End of round, unsubmitted" conditionals (dev only). My strokes come from my
 *  leaderboard row; the rest is filled randomly but the same on every load. */
export type ScoringPrefill = {
  opponentHoles: number[];
  putts: number[];
  fairways: (ScoringDirection | null)[];
  greens: ScoringDirection[];
  /** "Scores don't match": where the opponent's own phone differs by a stroke. */
  otherCardDiff?: { player: "me" | "opponent"; hole: number; delta: number };
};
type ScoringDirection = "up" | "left" | "center" | "right" | "down";

export function simulatorScorecard(roundStatus: SimulatorConfig["state"]["roundStatus"], par: number[] | undefined, opponentCard: SimulatorConfig["state"]["opponentCard"] = "match"): ScoringPrefill | undefined {
  if (roundStatus !== "roundEnd" || !par?.length) return undefined;
  const random = seededRandom(20261005);
  const miss = (): ScoringDirection => (["left", "right", "up", "down"] as const)[Math.floor(random() * 4)];
  const greens = par.map(() => random() < 0.45 ? "center" as const : miss());
  return {
    opponentHoles: par.map(holePar => Math.max(1, holePar + [-1, 0, 0, 0, 1, 1, 2][Math.floor(random() * 7)])),
    // On the green in regulation: usually two putts, sometimes one or three. Missed greens: a chip close, one or two putts.
    putts: greens.map(green => green === "center" ? [1, 2, 2, 2, 3][Math.floor(random() * 5)] : [1, 1, 2][Math.floor(random() * 3)]),
    fairways: par.map(holePar => holePar === 3 ? null : random() < 0.55 ? "center" : random() < 0.5 ? "left" : "right"),
    greens,
    // One player, one hole, one stroke off on the other phone; which player alternates with the seed.
    otherCardDiff: opponentCard === "mismatch" ? { player: random() < 0.5 ? "me" : "opponent", hole: Math.floor(random() * par.length), delta: random() < 0.5 ? -1 : 1 } : undefined,
  };
}


/** Which day (date) and which slot that day (0 = morning, 1 = afternoon) round `round` falls on, from the trip's day rows. */
function roundSlot(preview: GolfTripDraft, round: number): { date: string; slot: number } | null {
  let seen = 0;
  for (let day = 1; day <= 31; day++) {
    const date = preview[`day${day}Date`];
    if (!date) break;
    const count = Math.max(1, Number(preview[`day${day}Rounds`]) || 1);
    if (round <= seen + count) return { date, slot: round - seen - 1 };
    seen += count;
  }
  return preview.startDate ? { date: shiftDay(preview.startDate, round - 1), slot: 0 } : null;
}

/**
 * The trip clock ("YYYY-MM-DDTHH:mm:ss", trip-local) that matches the simulator's round state, so Home's countdown, Live /
 * Upcoming boxes, Mom notes and Itinerary agree with the Scoring sheet. Morning rounds 8 AM–12:30, afternoon 1–5:30.
 * Pre-tournament: 6 PM the night before arrival. Live: mid-round. End of round: just after it ends. Between rounds: 15 minutes
 * after round 3 ends. Complete: noon the day after the trip. "From data source": mid-round when a round is live; otherwise
 * (and for the real Maroon / empty data) undefined = the device's real clock.
 */
export function simulatorNow(config: SimulatorConfig, data: SimulatorTripData, roundLive: boolean): string | undefined {
  const preview = data.preview ?? {};
  const status = config.state.roundStatus;
  if (status === "source" && (!roundLive || config.source === "maroon" || config.source === "empty")) return undefined;
  if (status === "scheduled") return preview.startDate ? `${shiftDay(preview.startDate, -1)}T18:00:00` : undefined;
  if (status === "complete") return preview.endDate ? `${shiftDay(preview.endDate, 1)}T12:00:00` : undefined;
  const round = status === "between" ? 3 : data.previewMatch?.round ?? 1;
  const at = roundSlot(preview, round);
  if (!at) return undefined;
  const times = at.slot === 0 ? { live: "10:30", end: "12:35", after: "12:45" } : { live: "15:30", end: "17:35", after: "17:45" };
  return `${at.date}T${status === "between" ? times.after : status === "roundEnd" ? times.end : times.live}:00`;
}
