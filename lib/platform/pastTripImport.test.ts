import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { checkPastTrip, pastTripResults, pastTripTemplate, readPastTripWorkbook, type PastTripKind } from "./pastTripImport.ts";

const TODAY = "2026-11-06";
const file = (kind: PastTripKind) => new Uint8Array(readFileSync(`public${pastTripTemplate(kind)}`));
/** The template's sheets as editable grids (row 0 = spreadsheet row 1). */
function grids(kind: PastTripKind) {
  const book = XLSX.read(file(kind), { type: "array" });
  const grid = (name: string) => book.Sheets[name] ? XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, defval: null, raw: true, blankrows: true }) : null;
  return { trip: grid("Trip")!, rounds: grid("Rounds")!, matches: grid("Matches")!, scores: grid("Scores") };
}
const read = (kind: PastTripKind) => {
  const result = readPastTripWorkbook(file(kind), `${kind}.xlsx`, TODAY);
  assert.ok(result.ok);
  assert.deepEqual(result.problems, []);
  return result.trip!;
};
const nameOf = (trip: ReturnType<typeof read>, id: string | null) => trip.players.find((p) => p.id === id)?.name ?? null;

test("team template: imports with no problems; Pines win 5-3", () => {
  const trip = read("team");
  assert.equal(trip.kind, "team");
  assert.deepEqual(trip.teamNames, ["Pines", "Palms"]);
  assert.equal(trip.players.length, 8);
  assert.deepEqual(trip.rounds.map((r) => r.format), ["Fourball", "Alternate Shot", "Singles"]);
  assert.equal(trip.matches.length, 8);
  const results = pastTripResults(trip);
  assert.deepEqual(results.teamTotals, [5, 3]);
  assert.equal(results.teamWinner, 0);
  assert.deepEqual(results.teamRounds.map((r) => r.points), [[1.5, 0.5], [1, 1], [2.5, 1.5]]);
  // Team-only trips record every match, alternate shot included: Alex won R1, lost R2, won R3.
  const alex = results.players.find((p) => p.name === "Alex Brooks")!;
  assert.deepEqual([alex.won, alex.lost, alex.halved], [2, 1, 0]);
  assert.equal(results.champion, null);
});

test("individual template: Riley Foster wins on net; Stableford and match play are kept apart", () => {
  const trip = read("individual");
  assert.equal(trip.kind, "individual");
  assert.equal(trip.method, "Lowest net total");
  const results = pastTripResults(trip);
  assert.equal(nameOf(trip, results.champion), "Riley Foster");
  const alex = results.players.find((p) => p.name === "Alex Brooks")!;
  // Alex's round 1 was typed hole by hole (84) — it adds up the same as a typed total.
  assert.deepEqual([alex.rounds, alex.gross, alex.net, alex.stableford, alex.won, alex.lost], [2, 84, 78, 34, 1, 0]);
  assert.equal(trip.scores.find((s) => s.player === "Alex Brooks" && s.round === 1)!.holes!.length, 18);
  const riley = results.players.find((p) => p.name === "Riley Foster")!;
  assert.deepEqual([riley.net, riley.lost, riley.place], [76, 1, 1]);
  assert.deepEqual(results.teamTotals, null);
});

test("team + individual template: own-ball matches and scores count for the individual, alternate shot doesn't", () => {
  const trip = read("both");
  assert.equal(trip.kind, "both");
  const results = pastTripResults(trip);
  assert.deepEqual(results.teamTotals, [5, 3]);
  assert.equal(nameOf(trip, results.champion), "Alex Brooks");
  const alex = results.players.find((p) => p.name === "Alex Brooks")!;
  // Fourball win + Singles win; his alternate-shot loss is left off. Net 74 + 76.
  assert.deepEqual([alex.won, alex.lost, alex.matchPoints, alex.rounds, alex.gross, alex.net], [2, 0, 2, 2, 162, 150]);
});

test("a broken file lists each problem with its sheet and row, and gives no trip", () => {
  const sheets = grids("both");
  sheets.matches[5][2] = "Riley Foster";              // Matches row 6: a second player in a Singles match
  sheets.scores![17] = [2, "Alex Brooks", 85];         // Scores row 18: a score in the alternate-shot round
  sheets.trip[13][2] = "Oaks";                         // Trip row 14: a team that doesn't exist
  const { trip, problems } = checkPastTrip(sheets, TODAY);
  assert.equal(trip, null);
  const at = (sheet: string, row: number) => problems.filter((p) => p.sheet === sheet && p.row === row).map((p) => p.message);
  assert.ok(at("Matches", 6).includes("Singles is one player a side."));
  assert.ok(at("Scores", 18).includes("Round 2 was Alternate Shot, so there are no individual scores."));
  assert.ok(at("Trip", 14).includes("Riley Foster's team isn't one of the two team names."));
});

test("hole-by-hole checks: a total that disagrees, missing holes, Stableford without points", () => {
  const sheets = grids("individual");
  sheets.scores![1][2] = 90;                                          // holes add to 84
  sheets.scores![3] = [1, "Jordan Hayes", null, 4, 5, 4];             // 3 holes only, and Jordan already has round 1
  sheets.scores![5] = [2, "Alex Brooks", null, ...Array(18).fill(4)]; // Stableford typed as strokes
  const { problems } = checkPastTrip(sheets, TODAY);
  const messages = problems.map((p) => `${p.sheet} ${p.row}: ${p.message}`);
  assert.ok(messages.includes("Scores 2: Total 90 doesn't match the holes (84)."));
  assert.ok(messages.includes("Scores 4: Only 3 holes filled in."));
  assert.ok(messages.includes("Scores 6: Type the Stableford points in Total score."));
});

test("dates: a trip that hasn't finished and a round outside the trip are refused", () => {
  const sheets = grids("team");
  const end = sheets.trip.findIndex((row) => row[0] === "End date");
  sheets.trip[end][1] = "2026-12-01";
  sheets.rounds[1][1] = "2024-01-01";
  const messages = checkPastTrip(sheets, TODAY).problems.map((p) => p.message);
  assert.ok(messages.includes("This trip hasn't finished yet. Only past trips can be imported."));
  assert.ok(messages.includes("Round 1's date isn't between the trip's start and end dates."));
});

test("files that aren't a template are refused before anything is read", () => {
  const bad = (bytes: Uint8Array, name?: string) => { const r = readPastTripWorkbook(bytes, name, TODAY); assert.equal(r.ok, false); return r.ok ? "" : r.error; };
  assert.match(bad(new Uint8Array()), /empty/);
  assert.match(bad(new TextEncoder().encode("name,score\nA,80")), /isn't an Excel/);
  assert.match(bad(file("team"), "trip.csv"), /\.xlsx/);
  assert.match(bad(new Uint8Array(2 * 1024 * 1024 + 1).fill(1)), /2 MB/);
  const other = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(other, XLSX.utils.aoa_to_sheet([["Hello"]]), "Sheet1");
  assert.match(bad(new Uint8Array(XLSX.write(other, { type: "array", bookType: "xlsx" }))), /templates/);
});
