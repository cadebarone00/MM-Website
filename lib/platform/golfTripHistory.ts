/**
 * Organizer settings → History: past trips an organizer enters by hand (rounds, scores, leaderboard, champion).
 * Plain data + pure functions so the screens stay simple and the shape can become database tables later.
 * Courses use the same reference as Trip Schedule: the course API's `ref` when picked from search (null for a
 * course typed by name), plus a display label saved at pick time.
 */

export interface PastCourse { ref: string | null; name: string; place: string; par: number | null }

export interface PastRound {
  id: string;
  number: number;
  date: string | null;
  course: PastCourse;
  /** Gross 18-hole (or round) totals by player name. A missing name = no score entered. */
  scores: Record<string, number>;
}

export interface PastTrip {
  id: string;
  /** Trip dates, YYYY-MM-DD (arrival ≤ departure). */
  arrival: string;
  departure: string;
  name: string;
  place: string;
  players: string[];
  rounds: PastRound[];
  /** Organizer's pick when the scores alone don't decide it (ties, other formats). Null = use the leaderboard. */
  championOverride: string | null;
}

export interface PastLeaderboardRow { place: string; player: string; total: number; toPar: number | null; roundsPlayed: number }

const MIN_SCORE = 18;
const MAX_SCORE = 200;
const newId = () => Math.random().toString(36).slice(2, 10);

/** Lowest total wins. Only players with a score in every round get a place; the rest follow with "—". */
export function pastLeaderboard(trip: PastTrip): PastLeaderboardRow[] {
  if (!trip.rounds.length) return [];
  const rows = trip.players.map((player) => {
    const played = trip.rounds.filter((round) => round.scores[player] !== undefined);
    const total = played.reduce((sum, round) => sum + round.scores[player], 0);
    const parKnown = played.every((round) => round.course.par !== null);
    const par = played.reduce((sum, round) => sum + (round.course.par ?? 0), 0);
    return { player, total, toPar: played.length && parKnown ? total - par : null, roundsPlayed: played.length };
  }).filter((row) => row.roundsPlayed > 0);
  const complete = rows.filter((row) => row.roundsPlayed === trip.rounds.length).sort((a, b) => a.total - b.total || a.player.localeCompare(b.player));
  const partial = rows.filter((row) => row.roundsPlayed < trip.rounds.length).sort((a, b) => b.roundsPlayed - a.roundsPlayed || a.total - b.total || a.player.localeCompare(b.player));
  const placed = complete.map((row) => {
    const rank = complete.findIndex((other) => other.total === row.total) + 1;
    const tied = complete.filter((other) => other.total === row.total).length > 1;
    return { ...row, place: `${tied ? "T" : ""}${rank}` };
  });
  return [...placed, ...partial.map((row) => ({ ...row, place: "—" }))];
}

/** The organizer's pick if it's still a trip player; otherwise the outright leader; null while tied or unscored. */
export function pastChampion(trip: PastTrip): string | null {
  if (trip.championOverride && trip.players.includes(trip.championOverride)) return trip.championOverride;
  const leaders = pastLeaderboard(trip).filter((row) => row.place === "1" || row.place === "T1");
  return leaders.length === 1 ? leaders[0].player : null;
}

/** Newest trip first. */
export const sortPastTrips = (trips: PastTrip[]) => [...trips].sort((a, b) => b.arrival.localeCompare(a.arrival) || a.name.localeCompare(b.name));

const cleanNames = (names: string[]) => [...new Set(names.map((name) => name.trim()).filter(Boolean))];

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

export function addPastTrip(trips: PastTrip[], input: { arrival: string; departure: string; name: string; place: string; players: string[] }, today = new Date().toISOString().slice(0, 10)): PastTrip[] {
  const name = input.name.trim();
  if (!name) throw new Error("Give the trip a name.");
  if (!isDate(input.arrival) || !isDate(input.departure)) throw new Error("Pick the arrival and departure dates.");
  if (input.arrival < "1900-01-01" || input.arrival > today) throw new Error("The arrival date should be in the past.");
  if (input.departure < input.arrival) throw new Error("Departure can't be before arrival.");
  return [...trips, { id: newId(), arrival: input.arrival, departure: input.departure, name: name.slice(0, 100), place: input.place.trim().slice(0, 100), players: cleanNames(input.players), rounds: [], championOverride: null }];
}

export function addPastRound(trip: PastTrip, course: PastCourse, date: string | null = null): PastTrip {
  return { ...trip, rounds: [...trip.rounds, { id: newId(), number: trip.rounds.length + 1, date, course, scores: {} }] };
}

export function removePastRound(trip: PastTrip, roundId: string): PastTrip {
  return { ...trip, rounds: trip.rounds.filter((round) => round.id !== roundId).map((round, index) => ({ ...round, number: index + 1 })) };
}

/** Null clears the score; a score outside 18–200 strokes is ignored. */
export function setPastScore(trip: PastTrip, roundId: string, player: string, score: number | null): PastTrip {
  if (score !== null && (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE)) return trip;
  return { ...trip, rounds: trip.rounds.map((round) => {
    if (round.id !== roundId) return round;
    const scores = { ...round.scores };
    if (score === null) delete scores[player];
    else scores[player] = score;
    return { ...round, scores };
  }) };
}

export function addPastPlayer(trip: PastTrip, name: string): PastTrip {
  return { ...trip, players: cleanNames([...trip.players, name.slice(0, 60)]) };
}

export function removePastPlayer(trip: PastTrip, player: string): PastTrip {
  return {
    ...trip,
    players: trip.players.filter((name) => name !== player),
    rounds: trip.rounds.map((round) => { const scores = { ...round.scores }; delete scores[player]; return { ...round, scores }; }),
    championOverride: trip.championOverride === player ? null : trip.championOverride,
  };
}

/** Dev preview only: one finished past trip so the History screens have something to show. */
export function samplePastTrips(players: string[]): PastTrip[] {
  const names = players.length >= 4 ? players.slice(0, 6) : ["A. Organizer", "J. Parker", "M. Chen", "S. Patel"];
  const base = [82, 79, 88, 76, 91, 85];
  return [{
    id: "sample-2026", arrival: "2026-04-16", departure: "2026-04-19", name: "Desert Classic", place: "Scottsdale, AZ", players: names, championOverride: null,
    rounds: [
      { id: "sample-r1", number: 1, date: "2026-04-17", course: { ref: null, name: "Desert Pines GC", place: "Scottsdale, AZ", par: 72 },
        scores: Object.fromEntries(names.map((name, index) => [name, base[index]])) },
      { id: "sample-r2", number: 2, date: "2026-04-18", course: { ref: null, name: "Saguaro Links", place: "Scottsdale, AZ", par: 71 },
        scores: Object.fromEntries(names.map((name, index) => [name, base[(index + 2) % base.length] - 1])) },
    ],
  }];
}
