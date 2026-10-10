// Builds the Trip History import template (public/templates): one Excel workbook — Instructions, Tournament Setup,
// Player Rounds, Results (formulas), Standings (formulas) — plus plain CSV copies of the two sheets people fill in.
// The sample is a made-up year so groups can copy the layout. Run: node scripts/build-history-template.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const OUT = "public/templates";
const SETUP = "Tournament Setup";
const ROUNDS = "Player Rounds";
const RESULTS = "Results";
const RESULT_ROWS = 80;   // match rows ready for formulas
const PLAYER_ROWS = 400;  // player rows ready for formulas
const STANDING_ROWS = 20; // rounds

/** 0 → "A", 26 → "AA". */
/** A column's data rows on a sheet (row 2 to the last ready row), e.g. 'Player Rounds'!$A$2:$A$401. */
const rows = (sheet, column, last) => `${sheet ? `'${sheet}'!` : ""}$${column}$2:$${column}$${last}`;
const col = (index) => { let s = ""; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const q = (sheet) => `'${sheet}'`;
const holes = Array.from({ length: 18 }, (_, i) => i + 1);

// ---- Sample year (made up): 8 players, two teams, Round 1 Fourball (Nassau), Round 2 Singles. ----
const PAR = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
const SI = [7, 3, 15, 11, 1, 9, 17, 5, 13, 8, 16, 2, 12, 6, 10, 18, 4, 14];
const setupRows = [
  { round: 1, date: "2025-05-15", course: "Sample Golf Club", format: "Fourball", scoring: "Match Play", handicap: "Net", allowance: 100, nassau: "Yes", points: 1, teamA: "Pines", teamB: "Palms" },
  { round: 2, date: "2025-05-16", course: "Sample Golf Club", format: "Singles", scoring: "Match Play", handicap: "Net", allowance: 100, nassau: "No", points: 1, teamA: "Pines", teamB: "Palms" },
];
const players = [
  { name: "Alex Brooks", team: "Pines", hcp: 6 }, { name: "Riley Foster", team: "Pines", hcp: 12 },
  { name: "Jordan Hayes", team: "Pines", hcp: 9 }, { name: "Casey Lopez", team: "Pines", hcp: 15 },
  { name: "Taylor Diaz", team: "Palms", hcp: 8 }, { name: "Morgan Ellis", team: "Palms", hcp: 10 },
  { name: "Drew Keller", team: "Palms", hcp: 4 }, { name: "Quinn Shaw", team: "Palms", hcp: 14 },
];
// Fixed made-up scores: par plus a repeatable wobble, worse for higher handicaps.
const score = (player, round, hole) => {
  const p = players.indexOf(player);
  const wobble = ((p * 7 + round * 2 + hole * 3) % 5) - 1; // -1..3
  const extra = player.hcp >= 12 && (hole + p) % 2 === 0 ? 1 : 0;
  return Math.max(2, PAR[hole - 1] + Math.min(2, wobble) + extra);
};
const pairings = {
  1: [[0, 1, 4, 5], [2, 3, 6, 7]],             // Fourball: two Pines vs two Palms
  2: [[0, 4], [1, 5], [2, 6], [3, 7]],          // Singles
};
const playerRows = [];
for (const [round, matches] of Object.entries(pairings)) {
  matches.forEach((match, index) => {
    for (const p of match) {
      const player = players[p];
      playerRows.push({ round: Number(round), match: index + 1, team: player.team, player: player.name, hcp: player.hcp, holes: holes.map(h => score(player, Number(round), h)) });
    }
  });
}

// ---- Headers ----
const setupHeader = ["Round", "Date (YYYY-MM-DD)", "Course", "Format", "Scoring", "Handicap", "Allowance %", "Nassau", "Points per Match", "Team A", "Team B",
  ...holes.map(h => `Par ${h}`), ...holes.map(h => `Hole Hcp ${h}`)];
const roundsHeader = ["Round", "Match", "Team", "Player", "Handicap", ...holes.map(h => `H${h}`)];
const roundsCalcHeader = ["Gross", "Strokes in Match", ...holes.map(h => `Net ${h}`)];

// ---- Tournament Setup ----
const setupAoa = [setupHeader, ...setupRows.map(r => [r.round, r.date, r.course, r.format, r.scoring, r.handicap, r.allowance, r.nassau, r.points, r.teamA, r.teamB, ...PAR, ...SI])];

// ---- Player Rounds: what people type (A–W), then formulas (X onward) ----
const GROSS = 5;               // F: H1
const CALC = 5 + 18;           // X: Gross total
const STROKES = CALC + 1;      // Y: strokes received in this match
const NET = STROKES + 1;       // Z: Net 1
const setupLookup = (column, roundCell) => `INDEX(${q(SETUP)}!$${column}:$${column},MATCH(${roundCell},${q(SETUP)}!$A:$A,0))`;
const roundsSheet = XLSX.utils.aoa_to_sheet([[...roundsHeader, ...roundsCalcHeader], ...playerRows.map(r => [r.round, r.match, r.team, r.player, r.hcp, ...r.holes])]);
for (let row = 2; row <= PLAYER_ROWS + 1; row++) {
  const empty = `OR($A${row}="",$D${row}="")`;
  roundsSheet[`${col(CALC)}${row}`] = { t: "n", f: `IF(${empty},"",SUM(${col(GROSS)}${row}:${col(GROSS + 17)}${row}))` };
  // Net: strokes off the lowest handicap in the match, times the allowance; Gross rounds give none.
  roundsSheet[`${col(STROKES)}${row}`] = { t: "n", f: `IF(${empty},"",IF(${setupLookup("F", `$A${row}`)}="Net",ROUND(($E${row}-_xlfn.MINIFS(${rows("", "E", PLAYER_ROWS + 1)},${rows("", "A", PLAYER_ROWS + 1)},$A${row},${rows("", "B", PLAYER_ROWS + 1)},$B${row}))*${setupLookup("G", `$A${row}`)}/100,0),0))` };
  holes.forEach((h, i) => {
    const gross = `${col(GROSS + i)}${row}`, strokes = `$${col(STROKES)}${row}`, holeHcp = setupLookup(col(29 + i), `$A${row}`);
    roundsSheet[`${col(NET + i)}${row}`] = { t: "n", f: `IF(OR(${empty},${gross}=""),"",${gross}-(INT(${strokes}/18)+IF(${holeHcp}<=MOD(${strokes},18),1,0)))` };
  });
}
roundsSheet["!ref"] = `A1:${col(NET + 17)}${PLAYER_ROWS + 1}`;

// ---- Results: one row per match (Round + Match typed in), everything else calculated ----
const resultsHeader = ["Round", "Match", "Team A", "Team B", "Result", "Team A Points", "Team B Points", "Front 9 (+ = Team A)", "Back 9 (+ = Team A)", "18 Holes (+ = Team A)", "Closed Out On Hole",
  ...holes.map(h => `Hole ${h} (+1 A / -1 B)`), ...holes.map(h => `After ${h}`), ...holes.map(h => `Closed ${h}`)];
const DIFF = 11, CUM = DIFF + 18, CLOSED = CUM + 18;
const matchKeys = [...new Set(playerRows.map(r => `${r.round}|${r.match}`))].map(key => key.split("|").map(Number));
const resultsSheet = XLSX.utils.aoa_to_sheet([resultsHeader, ...matchKeys.map(([round, match]) => [round, match])]);
const PR = (column) => rows(ROUNDS, column, PLAYER_ROWS + 1);
for (let row = 2; row <= RESULT_ROWS + 1; row++) {
  const blank = `$A${row}=""`;
  resultsSheet[`C${row}`] = { t: "s", v: "", f: `IF(${blank},"",${setupLookup("J", `$A${row}`)})` };
  resultsSheet[`D${row}`] = { t: "s", v: "", f: `IF(${blank},"",${setupLookup("K", `$A${row}`)})` };
  holes.forEach((h, i) => {
    const net = col(NET + i), gross = col(GROSS + i);
    const best = (teamCell) => `_xlfn.MINIFS(${PR(net)},${PR("A")},$A${row},${PR("B")},$B${row},${PR("C")},${teamCell})`;
    // +1: Team A's best net is lower (wins the hole); -1: Team B wins; 0: halved. Blank until the hole has scores.
    resultsSheet[`${col(DIFF + i)}${row}`] = { t: "n", f: `IF(${blank},"",IF(COUNTIFS(${PR("A")},$A${row},${PR("B")},$B${row},${PR(gross)},">0")=0,"",SIGN(${best(`$D${row}`)}-${best(`$C${row}`)})))` };
    resultsSheet[`${col(CUM + i)}${row}`] = { t: "n", f: `IF(${blank},"",SUM($${col(DIFF)}${row}:${col(DIFF + i)}${row}))` };
    resultsSheet[`${col(CLOSED + i)}${row}`] = { t: "n", f: `IF(OR(${blank},${col(DIFF + i)}${row}=""),"",IF(ABS(${col(CUM + i)}${row})>${18 - h},${h},""))` };
  });
  const diffs = `${col(DIFF)}${row}:${col(DIFF + 17)}${row}`, cums = `${col(CUM)}${row}:${col(CUM + 17)}${row}`;
  resultsSheet[`H${row}`] = { t: "n", f: `IF(${blank},"",SUM(${col(DIFF)}${row}:${col(DIFF + 8)}${row}))` };
  resultsSheet[`I${row}`] = { t: "n", f: `IF(${blank},"",SUM(${col(DIFF + 9)}${row}:${col(DIFF + 17)}${row}))` };
  resultsSheet[`J${row}`] = { t: "n", f: `IF(${blank},"",SUM(${diffs}))` };
  resultsSheet[`K${row}`] = { t: "n", f: `IF(${blank},"",MIN(${col(CLOSED)}${row}:${col(CLOSED + 17)}${row}))` };
  const early = `AND($K${row}>0,$K${row}<18)`, atClose = `INDEX(${cums},1,$K${row})`;
  resultsSheet[`E${row}`] = { t: "s", v: "", f: `IF(${blank},"",IF(COUNT(${diffs})=0,"Not played",IF(${early},IF(${atClose}>0,$C${row},$D${row})&" "&ABS(${atClose})&"&"&(18-$K${row}),IF($J${row}=0,"Halved (AS)",IF($J${row}>0,$C${row},$D${row})&" "&ABS($J${row})&" UP"))))` };
  // Points: Nassau = front, back and 18 each pay Points per Match; otherwise the match pays once. Win 1, halve ½.
  const share = (cell, sign) => `IF(${cell}${sign}0,1,IF(${cell}=0,0.5,0))`;
  const decided = `IF(${early},${atClose},$J${row})`;
  const points = (sign) => `IF(OR(${blank},COUNT(${diffs})=0),"",${setupLookup("I", `$A${row}`)}*IF(${setupLookup("H", `$A${row}`)}="Yes",${share(`$H${row}`, sign)}+${share(`$I${row}`, sign)}+${share(`$J${row}`, sign)},${share(decided, sign)}))`;
  resultsSheet[`F${row}`] = { t: "n", f: points(">") };
  resultsSheet[`G${row}`] = { t: "n", f: points("<") };
}
resultsSheet["!ref"] = `A1:${col(CLOSED + 17)}${RESULT_ROWS + 1}`;

// ---- Standings: each round's points, the totals and the winner ----
const standings = XLSX.utils.aoa_to_sheet([["Round", "Team A", "Team A Points", "Team B", "Team B Points"]]);
for (let i = 0; i < STANDING_ROWS; i++) {
  const row = i + 2, setupRow = i + 2;
  const round = `${q(SETUP)}!$A${setupRow}`;
  standings[`A${row}`] = { t: "n", f: `IF(${round}="","",${round})` };
  standings[`B${row}`] = { t: "s", v: "", f: `IF($A${row}="","",${q(SETUP)}!$J${setupRow})` };
  standings[`C${row}`] = { t: "n", f: `IF($A${row}="","",SUMIFS(${rows(RESULTS, "F", RESULT_ROWS + 1)},${rows(RESULTS, "A", RESULT_ROWS + 1)},$A${row}))` };
  standings[`D${row}`] = { t: "s", v: "", f: `IF($A${row}="","",${q(SETUP)}!$K${setupRow})` };
  standings[`E${row}`] = { t: "n", f: `IF($A${row}="","",SUMIFS(${rows(RESULTS, "G", RESULT_ROWS + 1)},${rows(RESULTS, "A", RESULT_ROWS + 1)},$A${row}))` };
}
const total = STANDING_ROWS + 3;
standings[`A${total}`] = { t: "s", v: "Total" };
standings[`B${total}`] = { t: "s", v: "", f: `${q(SETUP)}!$J$2` };
standings[`C${total}`] = { t: "n", f: `SUM(C2:C${STANDING_ROWS + 1})` };
standings[`D${total}`] = { t: "s", v: "", f: `${q(SETUP)}!$K$2` };
standings[`E${total}`] = { t: "n", f: `SUM(E2:E${STANDING_ROWS + 1})` };
standings[`A${total + 1}`] = { t: "s", v: "Winner" };
standings[`B${total + 1}`] = { t: "s", v: "", f: `IF(C${total}>E${total},B${total},IF(E${total}>C${total},D${total},"Tied"))` };
standings["!ref"] = `A1:E${total + 1}`;

// ---- Instructions ----
const instructions = [
  ["Trip History import — how to fill this in"],
  [""],
  ["This file has 5 tabs. You fill in 2 of them; the other 2 calculate everything for you to check before you upload."],
  [""],
  ["1. Tournament Setup — one row per round (the rules)."],
  ["   Round: 1, 2, 3… in the order they were played."],
  ["   Format: Singles, Fourball, Alternate Shot, Scramble or Stroke Play."],
  ["   Scoring: Match Play or Stroke Play.   Handicap: Net or Gross.   Allowance %: usually 100."],
  ["   Nassau: Yes or No. Yes = front 9, back 9 and 18 holes each pay the Points per Match."],
  ["   Team A / Team B: the two team names, spelled exactly the same everywhere."],
  ["   Par 1–18 and Hole Hcp 1–18: from the scorecard (Hole Hcp = the hole's handicap / stroke index, 1 = hardest)."],
  [""],
  ["2. Player Rounds — one row for every player in every round (the scores)."],
  ["   Match: number the matches in each round 1, 2, 3… Everyone in the same match number played together."],
  ["   Same match + same team = partners. Same match + other team = opponents. You never type who played who."],
  ["   Team: exactly as in Tournament Setup.   Player: the same spelling every round and every year."],
  ["   Handicap: the player's course handicap that day. Alternate Shot / Scramble: put the TEAM's handicap on both partners' rows."],
  ["   H1–H18: strokes on each hole. Alternate Shot / Scramble: put the team's score on both partners' rows."],
  ["   Leave the grey columns after H18 alone — they calculate."],
  [""],
  ["3. Results — list each match once (its Round and Match number). Everything else fills in by itself:"],
  ["   who won each hole, the match result (2 UP, 3&2, Halved), Nassau front / back / 18, and the points each team earned."],
  [""],
  ["4. Standings — every round's points, the totals and the winner. Check this matches what happened."],
  [""],
  ["5. Upload. The app works out every result again from the raw scores, compares it with your Results tab, and shows"],
  ["   you a preview. Nothing is saved to History until you confirm. Any problem is listed in plain English."],
  [""],
  ["Rules: no blank holes, no extra columns, no renamed columns, one row per player per round. The sample year is made up —"],
  ["replace it with yours (delete the sample rows first)."],
];

const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(instructions), "Instructions");
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(setupAoa), SETUP);
XLSX.utils.book_append_sheet(book, roundsSheet, ROUNDS);
XLSX.utils.book_append_sheet(book, resultsSheet, RESULTS);
XLSX.utils.book_append_sheet(book, standings, "Standings");
book.Sheets.Instructions["!cols"] = [{ wch: 120 }];
book.Sheets[SETUP]["!cols"] = setupHeader.map((_, i) => ({ wch: i < 11 ? 16 : 9 }));
roundsSheet["!cols"] = [...roundsHeader, ...roundsCalcHeader].map((_, i) => ({ wch: i === 3 ? 18 : i < 5 ? 9 : 6 }));
resultsSheet["!cols"] = resultsHeader.map((_, i) => ({ wch: i === 4 ? 16 : i < 11 ? 12 : 7 }));
standings["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/trip-history-template.xlsx`, XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }));
const csv = (aoa) => aoa.map(row => row.map(value => /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : value).join(",")).join("\n") + "\n";
writeFileSync(`${OUT}/trip-history-tournament-setup.csv`, csv(setupAoa));
writeFileSync(`${OUT}/trip-history-player-rounds.csv`, csv([roundsHeader, ...playerRows.map(r => [r.round, r.match, r.team, r.player, r.hcp, ...r.holes])]));
console.log(`Wrote ${OUT}/trip-history-template.xlsx, trip-history-tournament-setup.csv, trip-history-player-rounds.csv (${playerRows.length} player rows, ${matchKeys.length} matches)`);
