import { PAST_TRIP_KINDS, type PastTripKind } from "./pastTripTemplates.ts";
export { PAST_TRIP_KINDS, pastTripTemplate, type PastTripKind } from "./pastTripTemplates.ts";

/**
 * Import past trip (project_specs.md, "Import past trip, phone-first"): the one trip format every way in produces (the
 * spreadsheet reader in pastTripImport.ts, the in-app walkthrough), its rules and its results. No spreadsheet code
 * here, so the phone screens can use it.
 */

/** The app's format names (savedTripSetup formatNames). The template says "Fourball (best ball)" for Fourball. */
export type PastFormat = "Fourball" | "Singles" | "Alternate Shot" | "Chapman" | "Scramble" | "Shamble" | "Stroke Play" | "Stableford";
export const TEAM_FORMATS: PastFormat[] = ["Fourball", "Singles", "Alternate Shot", "Chapman", "Scramble", "Shamble"];
export const SOLO_FORMATS: PastFormat[] = ["Stroke Play", "Stableford"];
/** Everyone plays their own ball: these rounds count for the individual too. Shared-ball rounds count for the team only. */
export const ownBall = (format: PastFormat) => ["Fourball", "Singles", "Stroke Play", "Stableford"].includes(format);
export const isMatchRound = (kind: PastTripKind, format: PastFormat) => kind === "individual" ? format === "Singles" : TEAM_FORMATS.includes(format);

export const WINNER_METHODS = ["Lowest net total", "Lowest gross total", "Most Stableford points", "Most match points"] as const;
export type WinnerMethod = (typeof WINNER_METHODS)[number];

/** `id` is the player's key in matches and scores: their name while importing, their member row id once saved. */
export interface PastPlayer { id: string; name: string; handicap: number | null; team: 0 | 1 | null }
/** `par`: the course par, asked for in files with individual scores (totals show against it); null in the team-only file. */
/** Shot results stored the way live scoring stores them (lib/platform/playerRounds.ts ShotResult): fairway left / center /
 *  right; green center = hit, "right" = missed (a past miss's direction isn't known — the 2026 historical import does the same). */
export type FairwayResult = "left" | "center" | "right";
export type GreenResult = "center" | "right";
/** `holePars`: each hole's par (from the course's scorecard, or typed), for hole-by-hole stats; null/absent when unknown. */
export interface PastRound { number: number; date: string | null; course: string; format: PastFormat; par: number | null; holePars?: (number | null)[] | null }
export interface PastMatch { round: number; sides: [string[], string[]]; winner: 0 | 1 | "halved" }
/** `putts` / `fairway` / `green`: per-hole stats (18 each), only on holes with strokes; null/absent when not kept. */
export interface PastScore { round: number; player: string; total: number; holes: (number | null)[] | null; putts?: (number | null)[] | null; fairway?: (FairwayResult | null)[] | null; green?: (GreenResult | null)[] | null }
export interface ImportedTrip {
  kind: PastTripKind; name: string; place: string; startDate: string; endDate: string;
  teamNames: [string, string] | null; method: WinnerMethod | null;
  players: PastPlayer[]; rounds: PastRound[]; matches: PastMatch[]; scores: PastScore[];
}
/** `row` is the spreadsheet row (null = the whole sheet). */
export interface ImportProblem { sheet: string; row: number | null; message: string }

export const MAX_PLAYERS = 64, MAX_ROUNDS = 62, MAX_TRIP_DAYS = 31;

// ---------------------------------------------------------------- results (the same rules as the template's Results sheet)

export interface TeamRound { round: number; points: [number, number] }
export interface PlayerLine {
  player: string; name: string; team: 0 | 1 | null; rounds: number; gross: number | null; net: number | null; stableford: number | null;
  won: number; lost: number; halved: number; matchPoints: number; place: number | null;
}
export interface PastTripResults {
  teamRounds: TeamRound[]; teamTotals: [number, number] | null; teamWinner: 0 | 1 | "tied" | null;
  players: PlayerLine[]; champion: string | null;
}

/** Team points per match round (1 a win, half each when halved), everyone's line, and the champion (null while tied or unscored). */
export function pastTripResults(trip: ImportedTrip): PastTripResults {
  const team = trip.kind !== "individual", solo = trip.kind !== "team";
  const formatOf = (round: number) => trip.rounds.find((r) => r.number === round)?.format;
  const teamRounds = team ? trip.rounds.filter((r) => TEAM_FORMATS.includes(r.format)).map((r) => {
    const points: [number, number] = [0, 0];
    for (const m of trip.matches.filter((x) => x.round === r.number)) {
      if (m.winner === "halved") { points[0] += 0.5; points[1] += 0.5; } else points[m.winner] += 1;
    }
    return { round: r.number, points };
  }) : [];
  const teamTotals: [number, number] | null = team ? [teamRounds.reduce((s, r) => s + r.points[0], 0), teamRounds.reduce((s, r) => s + r.points[1], 0)] : null;
  const teamWinner = !teamTotals || teamTotals[0] + teamTotals[1] === 0 ? null : teamTotals[0] > teamTotals[1] ? 0 : teamTotals[1] > teamTotals[0] ? 1 : "tied";

  const players = trip.players.map((p): PlayerLine => {
    // The team-only trip records every match; with an individual winner, only own-ball matches count for the player.
    const counted = trip.matches.filter((m) => !solo || ownBall(formatOf(m.round) ?? "Alternate Shot"));
    const record = { won: 0, lost: 0, halved: 0 };
    for (const m of counted) {
      const side = m.sides[0].includes(p.id) ? 0 : m.sides[1].includes(p.id) ? 1 : null;
      if (side === null) continue;
      if (m.winner === "halved") record.halved++; else if (m.winner === side) record.won++; else record.lost++;
    }
    const mine = trip.scores.filter((s) => s.player === p.id);
    const strokes = mine.filter((s) => formatOf(s.round) !== "Stableford"), points = mine.filter((s) => formatOf(s.round) === "Stableford");
    const gross = strokes.length ? strokes.reduce((sum, s) => sum + s.total, 0) : null;
    return { player: p.id, name: p.name, team: p.team, rounds: mine.length, gross, net: gross === null ? null : gross - strokes.length * (p.handicap ?? 0),
      stableford: points.length ? points.reduce((sum, s) => sum + s.total, 0) : null, ...record, matchPoints: record.won + record.halved / 2, place: null };
  });
  if (solo && trip.method) {
    const [key, low] = ({ "Lowest net total": ["net", true], "Lowest gross total": ["gross", true], "Most Stableford points": ["stableford", false], "Most match points": ["matchPoints", false] } as const)[trip.method];
    const value = (line: PlayerLine) => line[key];
    for (const line of players) {
      const mine = value(line);
      if (mine === null) continue;
      line.place = 1 + players.filter((other) => { const v = value(other); return v !== null && (low ? v < mine : v > mine); }).length;
    }
  }
  const leaders = players.filter((p) => p.place === 1);
  return { teamRounds, teamTotals, teamWinner, players, champion: leaders.length === 1 ? leaders[0].player : null };
}


/** golf_trip_imported_results.results back into a trip, or null when it isn't the shape import_golf_trip saves. */
export function importedTripFromJson(value: unknown): ImportedTrip | null {
  const v = value as Partial<ImportedTrip> | null;
  if (!v || typeof v !== "object" || !PAST_TRIP_KINDS.includes(v.kind as PastTripKind)) return null;
  if (![v.players, v.rounds, v.matches, v.scores].every(Array.isArray)) return null;
  if (!v.players!.every((p) => p && typeof p.id === "string" && typeof p.name === "string")) return null;
  if (!v.rounds!.every((r) => r && Number.isInteger(r.number) && typeof r.format === "string")) return null;
  if (!v.matches!.every((m) => m && Array.isArray(m.sides) && m.sides.length === 2 && (m.winner === 0 || m.winner === 1 || m.winner === "halved"))) return null;
  if (!v.scores!.every((s) => s && typeof s.player === "string" && typeof s.total === "number")) return null;
  return v as ImportedTrip;
}

/** What the Import screen shows before saving: the trip, the team result and the champion, by name. */
export interface ImportSummary {
  kind: PastTripKind; name: string; place: string; startDate: string; endDate: string;
  players: string[]; roundCount: number; matchCount: number; scoreCount: number;
  teams: { names: [string, string]; points: [number, number]; winner: string | null } | null;
  champion: { name: string | null; method: WinnerMethod } | null;
}
export function importSummary(trip: ImportedTrip): ImportSummary {
  const results = pastTripResults(trip);
  const name = (id: string | null) => trip.players.find((p) => p.id === id)?.name ?? null;
  return {
    kind: trip.kind, name: trip.name, place: trip.place, startDate: trip.startDate, endDate: trip.endDate,
    players: trip.players.map((p) => p.name), roundCount: trip.rounds.length, matchCount: trip.matches.length, scoreCount: trip.scores.length,
    teams: trip.teamNames && results.teamTotals ? { names: trip.teamNames, points: results.teamTotals,
      winner: results.teamWinner === null ? null : results.teamWinner === "tied" ? "Tied" : trip.teamNames[results.teamWinner] } : null,
    champion: trip.method ? { name: name(results.champion), method: trip.method } : null,
  };
}

// ---------------------------------------------------------------- the walkthrough's draft and the shared checks

/** Where a problem is fixed in the walkthrough. */
export type DraftStep = "kind" | "basics" | "rounds" | "players" | "matches" | "scores";
export interface DraftProblem { step: DraftStep; message: string }
/** The walkthrough's trip while it's being entered: anything may still be blank. `id`s are local keys. */
export interface TripDraft {
  kind: PastTripKind | null; name: string; place: string; startDate: string; endDate: string;
  teamNames: [string, string]; method: WinnerMethod | null;
  players: { id: string; name: string; handicap: number | null; team: 0 | 1 | null }[];
  rounds: { number: number; date: string | null; course: string; format: PastFormat | null; par: number | null; holePars?: (number | null)[] | null }[];
  matches: { id: string; round: number; sides: [string[], string[]]; winner: 0 | 1 | "halved" | null }[];
  scores: { round: number; player: string; total: number | null; holes: (number | null)[] | null; putts?: (number | null)[] | null; fairway?: (FairwayResult | null)[] | null; green?: (GreenResult | null)[] | null }[];
}
export const emptyDraft = (): TripDraft => ({ kind: null, name: "", place: "", startDate: "", endDate: "", teamNames: ["", ""], method: null, players: [], rounds: [], matches: [], scores: [] });
/** A finished trip back into a draft (so the spreadsheet's result goes through the same checks). */
export const draftFromTrip = (trip: ImportedTrip): TripDraft => ({
  kind: trip.kind, name: trip.name, place: trip.place, startDate: trip.startDate, endDate: trip.endDate,
  teamNames: trip.teamNames ?? ["", ""], method: trip.method, players: trip.players.map((p) => ({ ...p })),
  rounds: trip.rounds.map((r) => ({ ...r })), matches: trip.matches.map((m, i) => ({ id: `m${i}`, ...m })), scores: trip.scores.map((s) => ({ ...s })),
});

/** The formats a kind of trip can use (the same lists as the templates). */
export const formatsFor = (kind: PastTripKind): PastFormat[] => kind === "individual" ? [...SOLO_FORMATS, "Singles"] : kind === "team" ? TEAM_FORMATS : [...TEAM_FORMATS, ...SOLO_FORMATS];
/** Players a side for a match round: Singles 1, the other team formats 2. */
export const playersPerSide = (format: PastFormat) => format === "Singles" ? 1 : 2;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => ISO.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Every rule a past trip must meet, whichever way it came in (walkthrough or spreadsheet), in plain words with the step
 * to fix it at. Returns the finished trip only when there's nothing to fix.
 */
export function checkDraft(draft: TripDraft, today: string): { trip: ImportedTrip | null; problems: DraftProblem[] } {
  const problems: DraftProblem[] = [];
  const flag = (step: DraftStep, message: string) => problems.push({ step, message });
  const kind = draft.kind;
  if (!kind) { flag("kind", "Pick the kind of trip."); return { trip: null, problems }; }
  const team = kind !== "individual", solo = kind !== "team";

  const name = draft.name.trim(), place = draft.place.trim();
  if (!name) flag("basics", "Add the trip name.");
  if (name.length > 120) flag("basics", "The trip name is too long.");
  if (!place) flag("basics", "Add where the trip was.");
  const start = validDate(draft.startDate) ? draft.startDate : null, end = validDate(draft.endDate) ? draft.endDate : null;
  if (!start) flag("basics", "Add the start date.");
  if (!end) flag("basics", "Add the end date.");
  if (start && end) {
    if (end < start) flag("basics", "The end date is before the start date.");
    else if ((Date.parse(end) - Date.parse(start)) / 86400000 >= MAX_TRIP_DAYS) flag("basics", `A trip can be at most ${MAX_TRIP_DAYS} days.`);
    if (end >= today) flag("basics", "This trip hasn't finished yet. Only past trips can be imported.");
  }
  const teamNames: [string, string] | null = team ? [draft.teamNames[0].trim(), draft.teamNames[1].trim()] : null;
  if (teamNames) {
    if (!teamNames[0] || !teamNames[1]) flag("players", "Name both teams.");
    else if (sameName(teamNames[0], teamNames[1])) flag("players", "The two teams need different names.");
  }
  if (solo && !draft.method) flag("basics", "Pick how the individual winner is decided.");

  const players = draft.players.filter((p) => p.name.trim());
  if (players.length < 2) flag("players", "Add at least two players.");
  if (players.length > MAX_PLAYERS) flag("players", `A trip can have at most ${MAX_PLAYERS} players.`);
  players.forEach((p, i) => {
    if (players.slice(0, i).some((o) => sameName(o.name, p.name))) flag("players", `${p.name.trim()} is listed twice.`);
    if (p.handicap !== null && (!Number.isFinite(p.handicap) || p.handicap < -10 || p.handicap > 54)) flag("players", `${p.name.trim()}'s handicap should be from -10 to 54.`);
    if (team && p.team === null) flag("players", `Pick ${p.name.trim()}'s team.`);
  });
  const player = (id: string) => players.find((p) => p.id === id);

  const allowed = formatsFor(kind);
  if (!draft.rounds.length) flag("rounds", "Add at least one round.");
  if (draft.rounds.length > MAX_ROUNDS) flag("rounds", `A trip can have at most ${MAX_ROUNDS} rounds.`);
  draft.rounds.forEach((r, i) => {
    const label = `Round ${r.number}`;
    if (!Number.isInteger(r.number) || r.number < 1 || draft.rounds.slice(0, i).some((o) => o.number === r.number)) flag("rounds", `${label} is listed twice.`);
    if (!r.course.trim()) flag("rounds", `${label}: add the course.`);
    if (!r.format || !allowed.includes(r.format)) flag("rounds", `${label}: pick a format.`);
    if (r.date && !validDate(r.date)) flag("rounds", `${label}: the date isn't valid.`);
    if (r.date && start && end && (r.date < start || r.date > end)) flag("rounds", `${label}'s date isn't between the trip's start and end dates.`);
    const allHolePars = (r.holePars ?? []).filter((h) => h !== null).length === 18;
    if (solo && r.format && ownBall(r.format) && r.par === null && !allHolePars) flag("rounds", `${label}: add the course par.`);
    if (r.par !== null && (!Number.isInteger(r.par) || r.par < 27 || r.par > 80)) flag("rounds", `${label}: the par should be a whole number, like 72.`);
    const holePars = r.holePars ?? [];
    if (holePars.some((h) => h !== null && (!Number.isInteger(h) || h < 3 || h > 6))) flag("rounds", `${label}: each hole's par should be 3, 4, 5 or 6.`);
    const known = holePars.filter((h): h is number => h !== null);
    if (known.length === 18 && r.par !== null && known.reduce((a, b) => a + b, 0) !== r.par) flag("rounds", `${label}: the hole pars add up to ${known.reduce((a, b) => a + b, 0)}, not ${r.par}.`);
  });
  const round = (n: number) => draft.rounds.find((r) => r.number === n);

  draft.matches.forEach((m, i) => {
    const r = round(m.round);
    const label = `Round ${m.round}, match ${draft.matches.filter((o, j) => o.round === m.round && j <= i).length}`;
    if (!r || !r.format) return flag("matches", `${label}: that round doesn't exist any more.`);
    if (!isMatchRound(kind, r.format)) return flag("matches", `${label}: ${r.format} has no matches.`);
    const per = playersPerSide(r.format);
    m.sides.forEach((side, s) => {
      if (side.length !== per) flag("matches", `${label}: ${r.format} is ${per === 1 ? "one player" : "two players"} a side.`);
      side.forEach((id) => {
        const p = player(id);
        if (!p) flag("matches", `${label}: a player here isn't on the trip any more.`);
        else if (team && p.team !== s) flag("matches", `${label}: ${p.name.trim()} isn't on ${teamNames?.[s] || `team ${s + 1}`}.`);
      });
    });
    const everyone = [...m.sides[0], ...m.sides[1]];
    if (new Set(everyone).size < everyone.length) flag("matches", `${label}: the same player is on both sides.`);
    for (const id of new Set(everyone)) {
      if (draft.matches.some((o, j) => j < i && o.round === m.round && [...o.sides[0], ...o.sides[1]].includes(id))) flag("matches", `${label}: ${player(id)?.name.trim() ?? "a player"} is already in a match in round ${m.round}.`);
    }
    if (m.winner === null) flag("matches", `${label}: pick who won.`);
  });

  if (solo) draft.scores.forEach((s, i) => {
    const r = round(s.round), p = player(s.player);
    const label = `Round ${s.round}${p ? `, ${p.name.trim()}` : ""}`;
    if (!r || !r.format) return flag("scores", `${label}: that round doesn't exist any more.`);
    if (!p) return flag("scores", `${label}: that player isn't on the trip any more.`);
    if (!ownBall(r.format)) return flag("scores", `${label}: ${r.format} has no individual scores.`);
    const filled = (s.holes ?? []).filter((h): h is number => h !== null);
    if (s.holes && s.holes.some((h) => h !== null && (!Number.isInteger(h) || h < 1 || h > 15))) flag("scores", `${label}: each hole score should be a whole number from 1 to 15.`);
    if (filled.length && filled.length !== 9 && filled.length !== 18) flag("scores", `${label}: only ${filled.length} holes filled in.`);
    const stableford = r.format === "Stableford";
    if (s.total !== null && (!Number.isInteger(s.total) || s.total < 0 || s.total > 200)) flag("scores", `${label}: the total should be a whole number.`);
    if (stableford && s.total === null) flag("scores", `${label}: type the Stableford points.`);
    if (!stableford && s.total === null && !filled.length) flag("scores", `${label}: add the score.`);
    const sum = filled.reduce((a, b) => a + b, 0);
    if (!stableford && s.total !== null && filled.length && s.total !== sum) flag("scores", `${label}: total ${s.total} doesn't match the holes (${sum}).`);
    if (!stableford && s.total !== null && s.total < 18) flag("scores", `${label}: that total looks too low for strokes.`);
    if (draft.scores.slice(0, i).some((o) => o.round === s.round && o.player === s.player)) flag("scores", `${label}: has two scores for this round.`);
    // Hole stats: only on holes with strokes; putts no more than the strokes; a fairway only on a par 4 or 5.
    const strokesOn = (h: number) => s.holes?.[h] ?? null, holePar = (h: number) => r.holePars?.[h] ?? null;
    for (let h = 0; h < 18; h++) {
      const putts = s.putts?.[h] ?? null, fairway = s.fairway?.[h] ?? null, green = s.green?.[h] ?? null;
      if ((putts !== null || fairway !== null || green !== null) && strokesOn(h) === null) { flag("scores", `${label}: hole ${h + 1} has stats but no score.`); continue; }
      if (putts !== null && (!Number.isInteger(putts) || putts < 0 || putts > 10)) flag("scores", `${label}: hole ${h + 1}'s putts should be 0 to 10.`);
      else if (putts !== null && putts > (strokesOn(h) as number)) flag("scores", `${label}: hole ${h + 1} has more putts than strokes.`);
      if (fairway !== null && !["left", "center", "right"].includes(fairway)) flag("scores", `${label}: hole ${h + 1}'s fairway isn't valid.`);
      else if (fairway !== null && holePar(h) === 3) flag("scores", `${label}: hole ${h + 1} is a par 3, so it has no fairway.`);
      if (green !== null && !["center", "right"].includes(green)) flag("scores", `${label}: hole ${h + 1}'s green isn't valid.`);
    }
  });

  if (problems.length || !start || !end) return { trip: null, problems };
  const sortedRounds = [...draft.rounds].sort((a, b) => a.number - b.number);
  return { problems, trip: {
    kind, name, place, startDate: start, endDate: end, teamNames, method: solo ? draft.method : null,
    players: players.map((p) => ({ id: p.id, name: p.name.trim().slice(0, 120), handicap: p.handicap === null ? null : Math.round(p.handicap * 10) / 10, team: team ? p.team : null })),
    rounds: sortedRounds.map((r) => {
      const holePars = r.holePars && r.holePars.some((h) => h !== null) ? r.holePars : null;
      const known = (holePars ?? []).filter((h): h is number => h !== null);
      return { number: r.number, date: r.date, course: r.course.trim().slice(0, 200), format: r.format as PastFormat,
        par: r.par ?? (known.length === 18 ? known.reduce((a, b) => a + b, 0) : null), holePars };
    }),
    matches: draft.matches.map((m) => ({ round: m.round, sides: m.sides, winner: m.winner as PastMatch["winner"] })),
    scores: solo ? draft.scores.map((s) => {
      const filled = (s.holes ?? []).filter((h): h is number => h !== null);
      const kept = <T,>(list: (T | null)[] | null | undefined) => filled.length && list && list.some((x) => x !== null) ? list : null;
      return { round: s.round, player: s.player, total: s.total ?? filled.reduce((a, b) => a + b, 0), holes: filled.length ? s.holes : null,
        putts: kept(s.putts), fairway: kept(s.fairway), green: kept(s.green) };
    }) : [],
  } };
}

/** A draft as the server receives it (JSON from the walkthrough), or null when it isn't draft-shaped. Values are checked by checkDraft. */
export function draftFromJson(value: unknown): TripDraft | null {
  const v = value as Partial<TripDraft> | null;
  const str = (x: unknown) => typeof x === "string";
  const num = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x));
  if (!v || typeof v !== "object" || !(v.kind === null || PAST_TRIP_KINDS.includes(v.kind as PastTripKind))) return null;
  if (![v.name, v.place, v.startDate, v.endDate].every(str) || !Array.isArray(v.teamNames) || v.teamNames.length !== 2 || !v.teamNames.every(str)) return null;
  if (!(v.method === null || WINNER_METHODS.includes(v.method as WinnerMethod))) return null;
  if (![v.players, v.rounds, v.matches, v.scores].every((a) => Array.isArray(a) && a.length <= 2000)) return null;
  if (!v.players!.every((p) => p && str(p.id) && p.id.length <= 64 && str(p.name) && num(p.handicap) && (p.team === null || p.team === 0 || p.team === 1))) return null;
  const eighteen = (x: unknown, each: (y: unknown) => boolean) => x === undefined || x === null || (Array.isArray(x) && x.length === 18 && x.every(each));
  const shot = (allowed: string[]) => (y: unknown) => y === null || (typeof y === "string" && allowed.includes(y));
  if (!v.rounds!.every((r) => r && Number.isInteger(r.number) && (r.date === null || str(r.date)) && str(r.course) && (r.format === null || str(r.format)) && num(r.par) && eighteen(r.holePars, num))) return null;
  if (!v.matches!.every((m) => m && str(m.id) && Number.isInteger(m.round) && Array.isArray(m.sides) && m.sides.length === 2 && m.sides.every((s) => Array.isArray(s) && s.length <= 4 && s.every(str)) && [0, 1, "halved", null].includes(m.winner as never))) return null;
  if (!v.scores!.every((s) => s && Number.isInteger(s.round) && str(s.player) && num(s.total) && (s.holes === null || (Array.isArray(s.holes) && s.holes.length === 18 && s.holes.every(num)))
    && eighteen(s.putts, num) && eighteen(s.fairway, shot(["left", "center", "right"])) && eighteen(s.green, shot(["center", "right"])))) return null;
  return v as TripDraft;
}

// ---------------------------------------------------------------- fixing results after the trip is added

/** One round's score for one player: a total and/or holes; both null removes the score. */
export interface ScoreChange { round: number; player: string; total: number | null; holes: (number | null)[] | null; putts?: (number | null)[] | null; fairway?: (FairwayResult | null)[] | null; green?: (GreenResult | null)[] | null }
/** A round's hole pars (organizer only). */
export interface ParChange { round: number; holePars: (number | null)[] }
/** `index` is the match's position in the trip's matches. */
export interface MatchChange { index: number; winner: 0 | 1 | "halved" }
export interface ResultChanges { scores: ScoreChange[]; matches: MatchChange[]; pars?: ParChange[] }

/**
 * Applies score and match fixes to a saved trip. A player (`editor.organizer` false) may change only their own scores;
 * the organizer may change any score, match winner or round's hole pars. The changed trip must still pass every check.
 */
export function applyResultChanges(trip: ImportedTrip, changes: ResultChanges, editor: { memberId: string; organizer: boolean }, today: string):
  { ok: true; trip: ImportedTrip } | { ok: false; error: string } {
  const pars = changes.pars ?? [];
  if (!changes.scores.length && !changes.matches.length && !pars.length) return { ok: false, error: "Nothing changed." };
  if (!editor.organizer && (changes.matches.length || pars.length || changes.scores.some((s) => s.player !== editor.memberId))) return { ok: false, error: "You can only change your own scores." };
  const draft = draftFromTrip(trip);
  for (const c of pars) {
    const r = draft.rounds.find((x) => x.number === c.round);
    if (!r) return { ok: false, error: "That round isn't on the trip." };
    r.holePars = c.holePars;
    const known = c.holePars.filter((h): h is number => h !== null);
    if (known.length === 18) r.par = known.reduce((a, b) => a + b, 0);
  }
  for (const m of changes.matches) {
    if (!Number.isInteger(m.index) || !draft.matches[m.index]) return { ok: false, error: "That match isn't on the trip." };
    draft.matches[m.index].winner = m.winner;
  }
  for (const s of changes.scores) {
    if (!trip.players.some((p) => p.id === s.player) || !trip.rounds.some((r) => r.number === s.round)) return { ok: false, error: "That score isn't on the trip." };
    draft.scores = draft.scores.filter((o) => !(o.round === s.round && o.player === s.player));
    if (s.total !== null || (s.holes && s.holes.some((h) => h !== null))) draft.scores.push({ round: s.round, player: s.player, total: s.total, holes: s.holes, putts: s.putts ?? null, fairway: s.fairway ?? null, green: s.green ?? null });
  }
  // A saved trip is in the past by definition, so its own end date can't trip the "hasn't finished" rule here.
  const dayAfterTrip = new Date(Date.parse(`${trip.endDate}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const checked = checkDraft(draft, today > trip.endDate ? today : dayAfterTrip);
  return checked.trip ? { ok: true, trip: checked.trip } : { ok: false, error: checked.problems[0]?.message ?? "That change isn't valid." };
}

/** Score and match fixes as the server receives them, or null when they aren't that shape. */
export function resultChangesFromJson(value: unknown): ResultChanges | null {
  const v = value as Partial<ResultChanges> | null;
  if (!v || !Array.isArray(v.scores) || !Array.isArray(v.matches) || v.scores.length > 400 || v.matches.length > 150) return null;
  const num = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x));
  if (!v.scores.every((s) => s && Number.isInteger(s.round) && typeof s.player === "string" && num(s.total) && (s.holes === null || (Array.isArray(s.holes) && s.holes.length === 18 && s.holes.every(num))))) return null;
  if (!v.matches.every((m) => m && Number.isInteger(m.index) && [0, 1, "halved"].includes(m.winner as never))) return null;
  const eighteen = (x: unknown, each: (y: unknown) => boolean) => x === undefined || x === null || (Array.isArray(x) && x.length === 18 && x.every(each));
  const shot = (allowed: string[]) => (y: unknown) => y === null || (typeof y === "string" && allowed.includes(y));
  if (!v.scores.every((s) => eighteen(s.putts, num) && eighteen(s.fairway, shot(["left", "center", "right"])) && eighteen(s.green, shot(["center", "right"])))) return null;
  if (v.pars !== undefined && (!Array.isArray(v.pars) || v.pars.length > 62 || !v.pars.every((c) => c && Number.isInteger(c.round) && Array.isArray(c.holePars) && c.holePars.length === 18 && c.holePars.every(num)))) return null;
  return v as ResultChanges;
}
