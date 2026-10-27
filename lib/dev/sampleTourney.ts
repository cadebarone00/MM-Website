import type { CodeTournament, CodeTournamentLookup } from "@/lib/platform/codeTournaments";

/**
 * DEV ONLY: a made-up tournament for the app simulator's Tourneys group (/dev/tourney), so the tournament screens can
 * be seen without creating one or running tournament_codes.sql. Nothing here is saved; scores entered in the
 * simulator only change this page until it reloads.
 */

export const TOURNEY_PREVIEWS = ["player", "player-net", "organizer", "organizer-out", "spectator", "final", "create", "join"] as const;
export type TourneyPreview = (typeof TOURNEY_PREVIEWS)[number];

export const SAMPLE_ME = "me";
const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const SI = [7, 13, 17, 1, 9, 3, 15, 11, 5, 8, 14, 18, 2, 10, 4, 16, 12, 6];
const PLAYERS: [string, string, number][] = [
  [SAMPLE_ME, "Cam Latto", 6.2], ["p2", "Cade Barone", 11.4], ["p3", "Jake Hill", 3.8], ["p4", "Luke Sherrell", 15.0],
  ["p5", "Drew Weisser", 8.9], ["p6", "Jackson Collins", 19.6], ["p7", "Nate Brooks", 1.2], ["p8", "Ryan Ortiz", 24.3],
];
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString("en-CA"); };
/** The same made-up score every time: par plus a small, steady wobble by player and hole. */
const strokes = (player: number, round: number, hole: number) => PAR[hole] + [0, 1, 0, -1, 1, 0, 2, 0, 1, 0][(player * 7 + hole * 3 + round * 5) % 10] + (player >= 5 ? 1 : 0) * (hole % 3 === 0 ? 1 : 0);

function build({ scoring, roundsPlayed, holesToday, status, organizerPlays }: { scoring: "Gross" | "Net"; roundsPlayed: number; holesToday: number[]; status: "live" | "ended"; organizerPlays: boolean }): CodeTournament {
  const setup = (name: string) => ({ course: { ref: "sample", name, place: "Dallas, TX", par: PAR, strokeIndex: SI }, tee: { name: "Blue", rating: 70.4, slope: 124 } });
  const players = PLAYERS.filter(([id]) => organizerPlays || id !== SAMPLE_ME);
  const holes: CodeTournament["holes"] = [], cards: CodeTournament["cards"] = [];
  players.forEach(([id], p) => {
    for (let round = 1; round <= roundsPlayed; round++) {
      for (let hole = 0; hole < 18; hole++) holes.push({ profileId: id, round, hole: hole + 1, strokes: strokes(p, round, hole) });
      cards.push({ profileId: id, round, submittedAt: day(roundsPlayed - round - 1) });
    }
    const today = holesToday[p] ?? 0;
    for (let hole = 0; hole < today; hole++) holes.push({ profileId: id, round: roundsPlayed + 1, hole: hole + 1, strokes: strokes(p, roundsPlayed + 1, hole) });
  });
  const rounds = [
    { number: 1, setup: setup("Stevens Golf Course"), date: day(roundsPlayed ? -1 : 0) },
    { number: 2, setup: setup("Cedar Crest Golf Course"), date: day(roundsPlayed ? 0 : 1) },
  ];
  return { id: "sample", code: "K7Q4MZ", name: "Fall Classic", organizer: SAMPLE_ME, organizerPlays, scoring, status, createdAt: "",
    rounds, players: players.map(([profileId, name, handicap]) => ({ profileId, name, username: null, handicap })), holes, cards };
}

/** Who's looking and the tournament they see, for each simulator condition. */
export function sampleTourney(preview: TourneyPreview): { tournament: CodeTournament; meId: string | null; spectator: boolean } {
  const midRound = [7, 9, 5, 12, 0, 3, 14, 6];
  switch (preview) {
    case "player-net": return { tournament: { ...build({ scoring: "Net", roundsPlayed: 1, holesToday: midRound, status: "live", organizerPlays: true }), organizer: "p2" }, meId: SAMPLE_ME, spectator: false };
    case "organizer": return { tournament: build({ scoring: "Gross", roundsPlayed: 0, holesToday: midRound, status: "live", organizerPlays: true }), meId: SAMPLE_ME, spectator: false };
    case "organizer-out": return { tournament: build({ scoring: "Gross", roundsPlayed: 0, holesToday: midRound.slice(1), status: "live", organizerPlays: false }), meId: SAMPLE_ME, spectator: false };
    case "spectator": return { tournament: build({ scoring: "Gross", roundsPlayed: 0, holesToday: midRound, status: "live", organizerPlays: true }), meId: null, spectator: true };
    case "final": return { tournament: { ...build({ scoring: "Gross", roundsPlayed: 2, holesToday: [], status: "ended", organizerPlays: true }), organizer: "p2" }, meId: SAMPLE_ME, spectator: false };
    default: return { tournament: { ...build({ scoring: "Gross", roundsPlayed: 0, holesToday: midRound, status: "live", organizerPlays: true }), organizer: "p2" }, meId: SAMPLE_ME, spectator: false };
  }
}

/** What the Join screen shows for the sample code. */
export const SAMPLE_LOOKUP: CodeTournamentLookup = { id: "sample", name: "Fall Classic", status: "live", scoring: "Net", organizerName: "Cade Barone", member: false, playerCount: 8,
  rounds: [{ number: 1, course: "Stevens Golf Course", date: day(0) }, { number: 2, course: "Cedar Crest Golf Course", date: day(1) }] };
