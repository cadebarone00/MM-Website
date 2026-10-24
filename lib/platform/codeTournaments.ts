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
  /** The organizer's cut (supabase/tournament_cuts.sql); none = everyone plays every round. */
  cut?: TournamentCut | null;
  /** Shown in the Tourneys search and live feed (supabase/tournament_public.sql); new tournaments start private. */
  isPublic?: boolean;
  rounds: { number: number; setup: CodeRoundSetup; date: string; /** Set by the organizer (supabase/tournament_tee_sheets.sql); none = automatic foursomes. */ teeSheet?: TeeSheet | null }[];
  players: { profileId: string; name: string; username: string | null; handicap: number | null }[];
  holes: { profileId: string; round: number; hole: number; strokes: number }[];
  cards: { profileId: string; round: number; submittedAt: string }[];
}
/** What a code shows before joining. */
/** A cut after round `after`: the top `value` players and ties ("top"), or everyone at `value` to par or better ("score"),
 *  on the tournament's own scoring (gross or net) through that round. */
export interface TournamentCut { after: number; kind: "top" | "score"; value: number }
export interface CodeTournamentLookup {
  id: string; name: string; status: "live" | "ended"; scoring: "Gross" | "Net"; organizerName: string; member: boolean; playerCount: number;
  rounds: { number: number; course: string; date: string }[];
}
/** A public tournament in the Tourneys search / live feed. */
export interface PublicCodeTournament { id: string; name: string; scoring: "Gross" | "Net"; status: "live" | "ended"; organizerName: string; playerCount: number; firstDate: string | null; lastDate: string | null; course: string | null; place: string | null }

/** Which Tourneys list a public tournament is in: Past once it has ended, Upcoming before its first round day, else Live. */
export function publicSection(t: PublicCodeTournament, today: string): "Live" | "Upcoming" | "Past" {
  if (t.status === "ended") return "Past";
  return t.firstDate && t.firstDate > today ? "Upcoming" : "Live";
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

/** A round's tee sheet: each group's tee time ("HH:MM", 24-hour), starting hole and players (profile ids, in order). */
export interface TeeSheet { groups: { time: string; hole: number; players: string[] }[] }
/** How the organizer times the groups: the first tee time, minutes between times, and where they start: all off 1,
 *  off 1 and 10 (18-hole rounds), or a shotgun (every group at the first tee time, each on its own hole). */
export type TeeStart = "1" | "1&10" | "shotgun";
export interface TeeTiming { first: string; every: number; start: TeeStart }
export const DEFAULT_TIMING: TeeTiming = { first: "08:00", every: 10, start: "1&10" };

/** "08:30" → "8:30 AM". */
export function teeTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "Tee time TBD";
  return `${(h + 11) % 12 + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Group `g`'s time and starting hole under a timing: two groups per time (holes 1 and 10) off 1 & 10, one per time off 1,
 *  or a shotgun: all at the first tee time on holes 1, 2, 3… (past the last hole, a second group goes off each hole). */
export function teeSlot(g: number, timing: TeeTiming, holes: number): { time: string; hole: number } {
  if (timing.start === "shotgun") return { time: timing.first, hole: g % holes + 1 };
  const perTee = timing.start === "1&10" && holes >= 18 ? 2 : 1;
  const [h, m] = timing.first.split(":").map(Number);
  const minutes = ((h || 0) * 60 + (m || 0) + Math.floor(g / perTee) * timing.every) % (24 * 60);
  return { time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`, hole: g % perTee ? 10 : 1 };
}

/** The field split as evenly as possible into foursomes (threesomes when it doesn't divide by four), in the order given. */
export function foursomes(players: string[], timing: TeeTiming, holes: number): TeeSheet {
  const count = Math.ceil(players.length / 4);
  let next = 0;
  return { groups: Array.from({ length: count }, (_, g) => {
    const size = Math.floor(players.length / count) + (g < players.length % count ? 1 : 0);
    return { ...teeSlot(g, timing, holes), players: players.slice(next, next += size) };
  }) };
}

/** Random pairings: the field shuffled, then split into foursomes. */
/**
 * Pairings by score: the field ordered worst to best on the standings before `round` (the tournament's gross or net,
 * every earlier round), so the worst scores go off first and the leaders last; players with no score yet go first.
 * Ties keep the field's order. Null before anyone has a score from an earlier round (e.g. Round 1).
 */
export function scoreTeeSheet(t: CodeTournament, round: number, players: string[], timing: TeeTiming, holes: number): TeeSheet | null {
  const earlier = t.rounds.filter((r) => r.number < round);
  const net = t.scoring === "Net";
  const score = new Map(players.map((id) => {
    const player = t.players.find((p) => p.profileId === id);
    const scores = player ? earlier.map((r) => roundScore(t, player, r)) : [];
    return [id, scores.some((s) => s.played) ? scores.reduce((sum, s) => sum + (net ? s.net : s.gross), 0) : null] as const;
  }));
  if (![...score.values()].some((s) => s !== null)) return null;
  const rank = (id: string) => score.get(id) ?? Infinity;
  return foursomes([...players].sort((a, b) => rank(b) - rank(a)), timing, holes);
}

export function randomTeeSheet(players: string[], timing: TeeTiming, holes: number): TeeSheet {
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  return foursomes(shuffled, timing, holes);
}

/** The tee sheet a round shows: the organizer's (players who've left dropped, anyone not yet placed in a group of
 *  their own at the end), or foursomes in field order at the default times when none has been set. */
export function roundTeeSheet(t: CodeTournament, round: number): TeeSheet {
  const r = t.rounds.find((x) => x.number === round);
  const holes = r?.setup.course.par.length ?? 18;
  const ids = t.players.map((p) => p.profileId).filter((id) => !cutFrom(t, id, round));
  if (!r?.teeSheet) return foursomes(ids, DEFAULT_TIMING, holes);
  const groups = r.teeSheet.groups.map((g) => ({ ...g, players: g.players.filter((id) => ids.includes(id)) })).filter((g) => g.players.length);
  const placed = new Set(groups.flatMap((g) => g.players));
  const left = ids.filter((id) => !placed.has(id));
  return { groups: left.length ? [...groups, { time: "", hole: 1, players: left }] : groups };
}

const NO_SIDE: GolfMatchSide = { name: "", winPct: 0, fairwayPct: "—", greenPct: "—", putts: "—", score: "—" };

/** "+3", "E", "-2". */
export const cutLabel = (value: number) => value === 0 ? "E" : value > 0 ? `+${value}` : String(value);

/**
 * Where the cut stands: who's missing it (profile ids) on the standings through the cut round, and whether it's final
 * (every player has turned in that round's card, a later round has scores, or the tournament has ended); until then
 * it's projected. A player with no score through the cut round misses only once it's final. Null without a cut.
 */
export function cutStatus(t: CodeTournament): { missed: Set<string>; final: boolean; cut: TournamentCut } | null {
  const cut = t.cut;
  if (!cut || !t.rounds.some((r) => r.number > cut.after)) return null;
  const net = t.scoring === "Net";
  const final = t.status === "ended" || t.players.every((p) => submitted(t, p.profileId, cut.after)) || t.holes.some((h) => h.round > cut.after);
  const scores = t.players.map((player) => {
    const through = t.rounds.filter((r) => r.number <= cut.after).map((r) => roundScore(t, player, r));
    return { id: player.profileId, score: through.some((r) => r.played) ? through.reduce((sum, r) => sum + (net ? r.net : r.gross), 0) : null };
  });
  const ranked = scores.filter((x) => x.score !== null).map((x) => x.score as number).sort((a, b) => a - b);
  const line = cut.kind === "top" ? ranked[Math.min(cut.value, ranked.length) - 1] ?? Infinity : cut.value;
  return { cut, final, missed: new Set(scores.filter((x) => x.score === null ? final : x.score > line).map((x) => x.id)) };
}

/** Out of a round: I missed the cut and the round comes after it. */
export const cutFrom = (t: CodeTournament, profileId: string | null, round: number) => {
  const status = cutStatus(t);
  return Boolean(profileId && status?.final && round > status.cut.after && status.missed.has(profileId));
};

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
  | { action: "addRound"; setup: CodeRoundSetup; date: string } | { action: "teeSheet"; round: number; teeSheet: TeeSheet } | { action: "cut"; cut: TournamentCut | null } | { action: "public"; isPublic: boolean } | { action: "end" };

/** The tournament after a change, as the database would make it (the app simulator's sample tournament uses this). */
export function applyChange(t: CodeTournament, me: string, change: TournamentChange): CodeTournament {
  switch (change.action) {
    case "strokes": {
      const holes = t.holes.filter((h) => !(h.profileId === me && h.round === change.round && h.hole === change.hole));
      return { ...t, holes: change.strokes === null ? holes : [...holes, { profileId: me, round: change.round, hole: change.hole, strokes: change.strokes }] };
    }
    case "submit": return submitted(t, me, change.round) ? t : { ...t, cards: [...t.cards, { profileId: me, round: change.round, submittedAt: new Date().toISOString() }] };
    case "addRound": return { ...t, rounds: [...t.rounds, { number: t.rounds.length + 1, setup: change.setup, date: change.date }] };
    case "teeSheet": return { ...t, rounds: t.rounds.map((r) => r.number === change.round ? { ...r, teeSheet: change.teeSheet } : r) };
    case "cut": return { ...t, cut: change.cut };
    case "public": return { ...t, isPublic: change.isPublic };
    case "end": return { ...t, status: "ended" };
  }
}
