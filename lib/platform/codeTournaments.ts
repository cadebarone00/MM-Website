import type { GolfLeaderboardEntry, GolfMatchPreview, GolfMatchSide } from "./golfTripPreviewFixture";
import type { PlayerRoundTee } from "./playerRounds";
import type { ScoringCourse } from "./personalRound";
import { courseHandicap, strokesReceived } from "./roundGames";

/**
 * Tournaments by code (supabase/tournament_codes.sql; project_specs.md, "Feature: Tournaments by code"): the shapes the
 * server returns, and the leaderboard built from them. Stroke play, gross or net; the leaderboard is the golf trip's
 * (GolfTripLeaderboard), so a tournament is handed to it as a trip-style match preview.
 */

export interface CodeRoundSetup { course: Pick<ScoringCourse, "ref" | "name" | "place" | "par" | "strokeIndex">; tee: PlayerRoundTee | null }
export interface CodeTournament {
  id: string; code: string; name: string; organizer: string; organizerPlays: boolean; scoring: "Gross" | "Net"; status: "live" | "ended"; createdAt: string;
  /** The read-only code (supabase/watch_codes.sql); sent to the organizer only. */
  watchCode?: string;
  rounds: { number: number; setup: CodeRoundSetup; date: string }[];
  players: { profileId: string; name: string; username: string | null; handicap: number | null }[];
  holes: { profileId: string; round: number; hole: number; strokes: number }[];
  cards: { profileId: string; round: number; submittedAt: string }[];
}
/** What a code shows before joining. */
export interface CodeTournamentLookup {
  id: string; name: string; status: "live" | "ended"; scoring: "Gross" | "Net"; organizerName: string; member: boolean; playerCount: number;
  rounds: { number: number; course: string; date: string }[];
}
export interface MyCodeTournament { id: string; name: string; status: "live" | "ended"; firstDate: string | null; lastDate: string | null; course: string | null }

/** "K7Q4MZ" → "K7Q-4MZ" (easier to read out and type). */
export const formatCode = (code: string) => code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
/** A code as typed → as stored: letters and digits only, upper case. */
export const cleanCode = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** My strokes on a round, hole by hole (null = not played). */
export function cardFor(t: CodeTournament, profileId: string, round: number): (number | null)[] {
  const par = t.rounds.find((r) => r.number === round)?.setup.course.par ?? [];
  const holes: (number | null)[] = par.map(() => null);
  for (const h of t.holes) if (h.profileId === profileId && h.round === round && h.hole <= holes.length) holes[h.hole - 1] = h.strokes;
  return holes;
}
export const submitted = (t: CodeTournament, profileId: string, round: number) => t.cards.some((c) => c.profileId === profileId && c.round === round);

/** The round to score now: the one dated today, else the first I haven't submitted, else the last. */
export function currentRound(t: CodeTournament, profileId: string | null, today: string): number {
  const dated = t.rounds.find((r) => r.date === today);
  if (dated) return dated.number;
  const open = t.rounds.find((r) => !profileId || !submitted(t, profileId, r.number));
  return open?.number ?? t.rounds.at(-1)?.number ?? 1;
}

/** Handicap strokes on each hole of a round for a handicap index (none when gross or unknown). */
function strokesFor(setup: CodeRoundSetup, index: number | null, net: boolean): number[] {
  const par = setup.course.par;
  if (!net || index == null) return par.map(() => 0);
  const course = { par, strokeIndex: setup.course.strokeIndex, rating: setup.tee?.rating ?? null, slope: setup.tee?.slope ?? null };
  return strokesReceived(courseHandicap(index, course, [0, par.length]), course, [0, par.length]);
}
/** Course handicap for a round (0 when unknown). */
function playingHandicap(setup: CodeRoundSetup, index: number | null): number {
  const par = setup.course.par;
  return index == null ? 0 : courseHandicap(index, { par, rating: setup.tee?.rating ?? null, slope: setup.tee?.slope ?? null }, [0, par.length]);
}
/** "E", "+3", "-2"; "—" when nothing's been played. */
const toPar = (n: number | null) => n === null ? "—" : n === 0 ? "E" : n > 0 ? `+${n}` : String(n);

type RoundScore = { played: number; gross: number; net: number; holes: (number | null)[]; done: boolean };
function roundScore(t: CodeTournament, player: CodeTournament["players"][number], round: CodeTournament["rounds"][number]): RoundScore {
  const holes = cardFor(t, player.profileId, round.number), par = round.setup.course.par;
  const extra = strokesFor(round.setup, player.handicap, t.scoring === "Net");
  let played = 0, gross = 0, net = 0;
  holes.forEach((s, i) => { if (s == null) return; played++; gross += s - par[i]; net += s - par[i] - extra[i]; });
  return { played, gross, net, holes, done: submitted(t, player.profileId, round.number) || played === par.length };
}

/** Every player's row for one round shown: totals over all rounds, Today / Thru / card for the shown round. */
function rows(t: CodeTournament, shown: number, upTo = Infinity): GolfLeaderboardEntry[] {
  const round = t.rounds.find((r) => r.number === shown);
  if (!round) return [];
  return t.players.map((player) => {
    const scores = t.rounds.filter((r) => r.number <= upTo).map((r) => ({ number: r.number, ...roundScore(t, player, r) }));
    const today = scores.find((s) => s.number === shown)!;
    const any = scores.some((s) => s.played > 0);
    const sum = (key: "gross" | "net") => any ? scores.reduce((total, s) => total + s[key], 0) : null;
    const thru = today.done ? "F" : today.played ? String(today.played) : "—";
    return {
      position: "—", total: toPar(sum("gross")), netTotal: toPar(sum("net")),
      today: toPar(today.played ? today.gross : null), netToday: toPar(today.played ? today.net : null), thru,
      holes: today.holes,
      golfer: { name: player.name, hcp: playingHandicap(round.setup, player.handicap), thru: today.done ? "F" : today.played ? `Thru ${today.played}` : "",
        score: toPar(today.played ? today.gross : null), teeTime: "", course: round.setup.course.name, username: player.username },
    };
  });
}

const NO_SIDE: GolfMatchSide = { name: "", winPct: 0, fairwayPct: "—", greenPct: "—", putts: "—", score: "—" };

/** The tournament as the golf trip's leaderboard reads it, showing one round (totals run through every round). */
export function tournamentPreview(t: CodeTournament, shown: number): GolfMatchPreview {
  const round = t.rounds.find((r) => r.number === shown) ?? t.rounds[0];
  return {
    round: round.number, roundCount: t.rounds.length, course: round.setup.course.name, roundDate: round.date, format: "Stroke Play",
    handicap: t.scoring === "Net", scoring: t.scoring, par: round.setup.course.par, parIsReference: true,
    sides: [NO_SIDE, NO_SIDE], matches: [], leaderboard: rows(t, round.number),
    // Each round on its own (totals through that round), for the player pop-up's round tabs.
    roundStandings: t.rounds.map((r) => ({ round: r.number, datePlayed: r.date, format: "Stroke Play", par: r.setup.course.par, leaderboard: rows(t, r.number, r.number) })),
  };
}

/** One change a player or organizer makes (the POST body for /api/code-tournaments/<id>). */
export type TournamentChange = { action: "strokes"; round: number; hole: number; strokes: number | null } | { action: "submit"; round: number }
  | { action: "addRound"; setup: CodeRoundSetup; date: string } | { action: "end" };

/** The tournament after a change, as the database would make it (the app simulator's sample tournament uses this). */
export function applyChange(t: CodeTournament, me: string, change: TournamentChange): CodeTournament {
  switch (change.action) {
    case "strokes": {
      const holes = t.holes.filter((h) => !(h.profileId === me && h.round === change.round && h.hole === change.hole));
      return { ...t, holes: change.strokes === null ? holes : [...holes, { profileId: me, round: change.round, hole: change.hole, strokes: change.strokes }] };
    }
    case "submit": return submitted(t, me, change.round) ? t : { ...t, cards: [...t.cards, { profileId: me, round: change.round, submittedAt: new Date().toISOString() }] };
    case "addRound": return { ...t, rounds: [...t.rounds, { number: t.rounds.length + 1, setup: change.setup, date: change.date }] };
    case "end": return { ...t, status: "ended" };
  }
}
