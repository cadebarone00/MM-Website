import * as XLSX from "xlsx";
import { checkDraft, draftFromTrip, type DraftStep, MAX_PLAYERS, MAX_ROUNDS, MAX_TRIP_DAYS, SOLO_FORMATS, TEAM_FORMATS, WINNER_METHODS, isMatchRound, ownBall,
  type ImportProblem, type ImportedTrip, type PastFormat, type PastMatch, type PastPlayer, type PastRound, type PastScore, type PastTripKind, type WinnerMethod } from "./pastTripModel.ts";
export * from "./pastTripModel.ts";

/**
 * Golf Trips → Import past trip (spec "Import a past trip from a spreadsheet"): reads one of the three templates in
 * public/templates (built by scripts/build-past-trip-templates.py), checks it and works out the results.
 * Only the yellow input cells are read. The sheet's own formulas are never trusted (Numbers and Google Sheets may not
 * keep them): every check and result is worked out again here. Pure: bytes in, data out; nothing is stored.
 */

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const SHEET_FOR_STEP: Record<DraftStep, string> = { kind: "Trip", basics: "Trip", players: "Trip", rounds: "Rounds", matches: "Matches", scores: "Scores" };

// ---------------------------------------------------------------- reading the file

type Cell = unknown;
type Grid = Cell[][];
export type ReadResult = { ok: true; trip: ImportedTrip | null; problems: ImportProblem[] } | { ok: false; error: string };

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLD_XLS = [0xd0, 0xcf, 0x11, 0xe0];
const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
const text = (value: Cell) => value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function number(value: Cell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value).replace(/^\+/, "-"); // "+2" handicap = plus 2
  return raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
}
const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
};
/** An Excel date (a day number) or typed text: 2025-05-15 or 5/15/2025. */
function dateOf(value: Cell): string | null {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? iso(parsed.y, parsed.m, parsed.d) : null;
  }
  const raw = text(value);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  return m ? iso(+m[3], +m[1], +m[2]) : null;
}
const formatOf = (value: Cell): PastFormat | null => {
  const raw = text(value).toLowerCase();
  if (raw === "fourball (best ball)" || raw === "fourball" || raw === "best ball") return "Fourball";
  return [...TEAM_FORMATS, ...SOLO_FORMATS].find((f) => f.toLowerCase() === raw) ?? null;
};

/** Reads an uploaded template. `ok: false` = not a usable file at all; otherwise the trip (null if it has problems) and every problem found. */
export function readPastTripWorkbook(bytes: Uint8Array, fileName?: string, today = new Date().toISOString().slice(0, 10)): ReadResult {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_IMPORT_BYTES) return { ok: false, error: "The file is larger than 2 MB." };
  if (fileName !== undefined && !/\.xlsx$/i.test(fileName.trim())) return { ok: false, error: "Upload the filled-in template as an Excel (.xlsx) file." };
  if (startsWith(bytes, OLD_XLS) || !startsWith(bytes, ZIP)) return { ok: false, error: "This isn't an Excel (.xlsx) file." };
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false, sheets: ["Trip", "Rounds", "Matches", "Scores"] });
  } catch {
    return { ok: false, error: "This file couldn't be opened. Save it again as .xlsx and try once more." };
  }
  const grid = (name: string): Grid | null => {
    const sheet = book.Sheets[name];
    return sheet ? XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, raw: true, blankrows: true }) : null;
  };
  const trip = grid("Trip"), rounds = grid("Rounds"), matches = grid("Matches");
  if (!trip || !rounds || !matches) return { ok: false, error: "This doesn't look like one of the Import past trip templates. Download the template and fill that in." };
  const checked = checkPastTrip({ trip, rounds, matches, scores: grid("Scores") }, today);
  if (!checked.trip) return { ok: true, ...checked };
  // Then the same rules the in-app walkthrough uses, so both ways in accept exactly the same trips.
  const shared = checkDraft(draftFromTrip(checked.trip), today);
  return shared.trip ? { ok: true, trip: shared.trip, problems: [] }
    : { ok: true, trip: null, problems: shared.problems.map((p) => ({ sheet: SHEET_FOR_STEP[p.step], row: null, message: p.message })) };
}

// ---------------------------------------------------------------- checking

/** The four input sheets as grids of cell values (row 0 = spreadsheet row 1). Exported for tests. */
export function checkPastTrip(sheets: { trip: Grid; rounds: Grid; matches: Grid; scores: Grid | null }, today: string): { trip: ImportedTrip | null; problems: ImportProblem[] } {
  const problems: ImportProblem[] = [];
  const flag = (sheet: string, row: number | null, message: string) => problems.push({ sheet, row, message });

  // Trip: labels in column A, values in column B, then the Players table under its "Player name" header.
  const details = new Map<string, Cell>();
  const headerAt = sheets.trip.findIndex((row) => same(text(row?.[0]), "Player name"));
  sheets.trip.slice(0, headerAt < 0 ? undefined : headerAt).forEach((row) => { if (text(row?.[0])) details.set(text(row[0]).toLowerCase(), row[1]); });
  const team = details.has("team 1 name"), solo = details.has("individual winner decided by");
  if (headerAt < 0 || (!team && !solo)) {
    flag("Trip", null, "This doesn't look like one of the Import past trip templates. Download the template and fill that in.");
    return { trip: null, problems };
  }
  const kind: PastTripKind = team && solo ? "both" : team ? "team" : "individual";
  if (solo && !sheets.scores) flag("Scores", null, "The Scores sheet is missing. Download the template again.");
  const detailRow = (label: string) => sheets.trip.findIndex((row) => same(text(row?.[0]), label)) + 1;
  const name = text(details.get("trip name")).slice(0, 120), place = text(details.get("where")).slice(0, 200);
  const startDate = dateOf(details.get("start date")), endDate = dateOf(details.get("end date"));
  if (!name) flag("Trip", detailRow("Trip name"), "Add the trip name.");
  if (!place) flag("Trip", detailRow("Where"), "Add where the trip was.");
  if (!startDate) flag("Trip", detailRow("Start date"), "Add the start date, like 5/15/2025.");
  if (!endDate) flag("Trip", detailRow("End date"), "Add the end date, like 5/17/2025.");
  if (startDate && endDate) {
    if (endDate < startDate) flag("Trip", detailRow("End date"), "The end date is before the start date.");
    else if ((Date.parse(endDate) - Date.parse(startDate)) / 86400000 >= MAX_TRIP_DAYS) flag("Trip", detailRow("End date"), `A trip can be at most ${MAX_TRIP_DAYS} days.`);
    if (endDate >= today) flag("Trip", detailRow("End date"), "This trip hasn't finished yet. Only past trips can be imported.");
  }
  let teamNames: [string, string] | null = null;
  if (team) {
    teamNames = [text(details.get("team 1 name")).slice(0, 120), text(details.get("team 2 name")).slice(0, 120)];
    if (!teamNames[0]) flag("Trip", detailRow("Team 1 name"), "Add the first team's name.");
    if (!teamNames[1]) flag("Trip", detailRow("Team 2 name"), "Add the second team's name.");
    if (teamNames[0] && same(teamNames[0], teamNames[1])) flag("Trip", detailRow("Team 2 name"), "The two teams need different names.");
  }
  let method: WinnerMethod | null = null;
  if (solo) {
    method = WINNER_METHODS.find((m) => same(m, text(details.get("individual winner decided by")))) ?? null;
    if (!method) flag("Trip", detailRow("Individual winner decided by"), "Pick how the individual winner is decided.");
  }

  const players: PastPlayer[] = [];
  const teamOf = (value: Cell): 0 | 1 | null => teamNames && same(text(value), teamNames[0]) ? 0 : teamNames && same(text(value), teamNames[1]) ? 1 : null;
  sheets.trip.slice(headerAt + 1).forEach((row, i) => {
    const r = headerAt + 2 + i, playerName = text(row?.[0]).slice(0, 120);
    if (!playerName && !text(row?.[1]) && !(team && text(row?.[2]))) return;
    if (!playerName) return flag("Trip", r, "Add the player's name.");
    if (players.some((p) => same(p.name, playerName))) return flag("Trip", r, `${playerName} is listed twice.`);
    const handicap = text(row?.[1]) === "" ? null : number(row?.[1]);
    if (handicap !== null && (handicap < -10 || handicap > 54)) flag("Trip", r, `${playerName}'s handicap should be from -10 to 54.`);
    if (text(row?.[1]) !== "" && handicap === null) flag("Trip", r, `${playerName}'s handicap should be a number.`);
    const side = team ? teamOf(row?.[2]) : null;
    if (team && side === null) flag("Trip", r, text(row?.[2]) ? `${playerName}'s team isn't one of the two team names.` : `Pick ${playerName}'s team.`);
    players.push({ id: playerName, name: playerName, handicap: handicap === null ? null : Math.round(handicap * 10) / 10, team: side });
  });
  if (players.length < 2) flag("Trip", null, "Add at least two players.");
  if (players.length > MAX_PLAYERS) flag("Trip", null, `A trip can have at most ${MAX_PLAYERS} players.`);
  const player = (value: Cell) => players.find((p) => same(p.name, text(value)));

  // Rounds: Round, Date, Course, Format, and Par in files with individual scores.
  const rounds: PastRound[] = [];
  sheets.rounds.slice(1).forEach((row, i) => {
    const r = i + 2;
    if (![0, 1, 2, 3, ...(solo ? [4] : [])].some((c) => text(row?.[c]))) return;
    const par = solo && text(row?.[4]) ? number(row?.[4]) : null;
    const n = number(row?.[0]), date = text(row?.[1]) ? dateOf(row?.[1]) : null, course = text(row?.[2]).slice(0, 200), format = formatOf(row?.[3]);
    if (n === null || !Number.isInteger(n) || n < 1 || n > MAX_ROUNDS) return flag("Rounds", r, "The round number should be 1, 2, 3...");
    if (rounds.some((x) => x.number === n)) return flag("Rounds", r, `Round ${n} is listed twice.`);
    if (text(row?.[1]) && !date) flag("Rounds", r, "The date should look like 5/15/2025.");
    if (date && startDate && endDate && (date < startDate || date > endDate)) flag("Rounds", r, `Round ${n}'s date isn't between the trip's start and end dates.`);
    if (!course) flag("Rounds", r, "Add the course.");
    const allowed = kind === "individual" ? [...SOLO_FORMATS, "Singles"] : kind === "team" ? TEAM_FORMATS : [...TEAM_FORMATS, ...SOLO_FORMATS];
    if (!format || !allowed.includes(format)) return flag("Rounds", r, text(row?.[3]) ? `"${text(row?.[3])}" isn't one of this template's formats.` : "Pick a format.");
    if (solo && text(row?.[4]) && (par === null || !Number.isInteger(par) || par < 27 || par > 80)) return flag("Rounds", r, "The par should be a whole number, like 72.");
    if (solo && par === null && ownBall(format)) return flag("Rounds", r, "Add the course par.");
    rounds.push({ number: n, date, course, format, par });
  });
  if (!rounds.length) flag("Rounds", null, "Add at least one round.");
  rounds.sort((a, b) => a.number - b.number);
  const roundOf = (n: number | null) => rounds.find((x) => x.number === n);

  // Matches. Team files: Round, two players per team, Winner (a team name or Halved). Individual: Round, Player 1, Player 2, Winner.
  const matches: PastMatch[] = [];
  sheets.matches.slice(1).forEach((row, i) => {
    const r = i + 2, cols = team ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3];
    if (!cols.some((c) => text(row?.[c]))) return;
    const before = problems.length;
    const n = number(row?.[0]), round = roundOf(n);
    if (!round) flag("Matches", r, text(row?.[0]) ? `Round ${text(row?.[0])} isn't on the Rounds sheet.` : "Add the round number.");
    else if (!isMatchRound(kind, round.format)) flag("Matches", r, `Round ${round.number} is ${round.format}, which has no matches.`);
    const names = (team ? [[1, 2], [3, 4]] : [[1], [2]]).map((side) => side.map((c) => row?.[c]).filter((v) => text(v)));
    const sides = names.map((side, s) => side.map((value) => {
      const found = player(value);
      if (!found) flag("Matches", r, `${text(value)} isn't on the Trip sheet.`);
      else if (team && found.team !== s) flag("Matches", r, `${found.name} isn't on ${teamNames?.[s]}.`);
      return found?.id ?? "";
    })) as [string[], string[]];
    if (!sides[0].length || !sides[1].length) flag("Matches", r, team ? "Each team needs a player." : "Add both players.");
    if (round && team && round.format === "Singles" && (sides[0].length > 1 || sides[1].length > 1)) flag("Matches", r, "Singles is one player a side.");
    if (round && team && round.format !== "Singles" && TEAM_FORMATS.includes(round.format) && (sides[0].length < 2 || sides[1].length < 2)) flag("Matches", r, `${round.format} needs two players a side.`);
    const everyone = [...sides[0], ...sides[1]].filter(Boolean);
    if (new Set(everyone).size < everyone.length) flag("Matches", r, "The same player is on both sides.");
    for (const id of new Set(everyone)) if (round && matches.some((m) => m.round === round.number && [...m.sides[0], ...m.sides[1]].includes(id))) flag("Matches", r, `${id} is in two matches in round ${round.number}.`);
    const raw = text(team ? row?.[5] : row?.[3]);
    let winner: PastMatch["winner"] | null = null;
    if (same(raw, "Halved")) winner = "halved";
    else if (team) winner = teamOf(raw);
    else winner = player(raw)?.id === sides[0][0] ? 0 : player(raw)?.id === sides[1][0] ? 1 : null;
    if (winner === null) flag("Matches", r, !raw ? "Pick the winner." : team ? "The winner should be a team name or Halved." : "The winner should be one of the two players, or Halved.");
    if (problems.length === before && round && winner !== null) matches.push({ round: round.number, sides, winner });
  });

  // Scores: Round, Player, Total score, then holes 1-18. Only own-ball rounds have individual scores.
  const scores: PastScore[] = [];
  if (solo) (sheets.scores ?? []).slice(1).forEach((row, i) => {
    const r = i + 2, holeCells = Array.from({ length: 18 }, (_, h) => row?.[3 + h]);
    if (![0, 1, 2].some((c) => text(row?.[c])) && !holeCells.some((v) => text(v))) return;
    const before = problems.length;
    const round = roundOf(number(row?.[0])), who = player(row?.[1]);
    if (!round) flag("Scores", r, text(row?.[0]) ? `Round ${text(row?.[0])} isn't on the Rounds sheet.` : "Add the round number.");
    else if (!ownBall(round.format)) flag("Scores", r, `Round ${round.number} was ${round.format}, so there are no individual scores.`);
    if (!who) flag("Scores", r, text(row?.[1]) ? `${text(row?.[1])} isn't on the Trip sheet.` : "Add the player.");
    const holes = holeCells.map((v) => text(v) === "" ? null : number(v));
    const filled = holes.filter((h): h is number => h !== null);
    if (holeCells.some((v, h) => text(v) !== "" && (holes[h] === null || !Number.isInteger(holes[h]) || (holes[h] as number) < 1 || (holes[h] as number) > 15))) flag("Scores", r, "Each hole score should be a whole number from 1 to 15.");
    if (filled.length && filled.length !== 9 && filled.length !== 18) flag("Scores", r, `Only ${filled.length} holes filled in.`);
    const typed = text(row?.[2]) === "" ? null : number(row?.[2]);
    const stableford = round?.format === "Stableford";
    if (text(row?.[2]) !== "" && (typed === null || !Number.isInteger(typed) || typed < 0 || typed > 200)) flag("Scores", r, "The total should be a whole number.");
    if (stableford && typed === null) flag("Scores", r, "Type the Stableford points in Total score.");
    const sum = filled.reduce((a, b) => a + b, 0);
    if (!stableford && typed !== null && filled.length && typed !== sum) flag("Scores", r, `Total ${typed} doesn't match the holes (${sum}).`);
    if (typed === null && !filled.length) flag("Scores", r, "Add the score.");
    if (!stableford && typed !== null && typed < 18) flag("Scores", r, "That total looks too low for strokes.");
    if (round && who && scores.some((s) => s.round === round.number && s.player === who.id)) flag("Scores", r, `${who.name} has two rows for round ${round.number}.`);
    if (problems.length === before && round && who) scores.push({ round: round.number, player: who.id, total: typed ?? sum, holes: filled.length ? holes : null });
  });

  if (problems.length || !startDate || !endDate) return { trip: null, problems };
  return { trip: { kind, name, place, startDate, endDate, teamNames, method, players, rounds, matches, scores }, problems };
}

// ---------------------------------------------------------------- saving (import_golf_trip in supabase/golf_trip_import.sql)

export interface ImportInput {
  requestId: string; name: string; destination: string; startDate: string; endDate: string;
  organizerName: string; organizerMemberId: string | null;
  players: { id: string; name: string }[];
  rounds: { roundNumber: number; dayNumber: number; playDate: string | null; courseName: string }[];
  /** The trip with every player key swapped for their member row id (what the trip page reads back). */
  results: ImportedTrip;
}

/** `me`: which player is the person importing (their row becomes the organizer row), or null if they didn't play.
 *  `newId` makes each player's member row id (crypto.randomUUID on the server). */
export function importInput(trip: ImportedTrip, me: string | null, organizerName: string, requestId: string, newId: () => string): ImportInput {
  const ids = new Map(trip.players.map((p) => [p.id, newId()]));
  const id = (key: string) => ids.get(key) as string;
  const results: ImportedTrip = {
    ...trip,
    players: trip.players.map((p) => ({ ...p, id: id(p.id) })),
    matches: trip.matches.map((m) => ({ ...m, sides: [m.sides[0].map(id), m.sides[1].map(id)] })),
    scores: trip.scores.map((s) => ({ ...s, player: id(s.player) })),
  };
  const mine = me === null ? null : trip.players.find((p) => p.id === me) ?? null;
  const day = (round: PastRound, index: number) => round.date ? Math.round((Date.parse(round.date) - Date.parse(trip.startDate)) / 86400000) + 1 : Math.min(MAX_TRIP_DAYS, index + 1);
  return {
    requestId, name: trip.name, destination: trip.place, startDate: trip.startDate, endDate: trip.endDate,
    organizerName: mine?.name ?? organizerName, organizerMemberId: mine ? id(mine.id) : null,
    players: results.players.map((p) => ({ id: p.id, name: p.name })),
    rounds: trip.rounds.map((r, i) => ({ roundNumber: r.number, dayNumber: day(r, i), playDate: r.date, courseName: r.course })),
    results,
  };
}
