/**
 * Maroon Masters — live feed for the website.
 *
 * Deploy this as a Web App (Extensions > Apps Script in the Sheet, paste this in,
 * then Deploy > New deployment > Web app). See README.md in this folder for the
 * exact click-by-click steps. The deployed URL gets pasted into the website's
 * LIVE_FEED_URL setting — nothing else needs to change here once that's done.
 *
 * Reads three sheets: "Roster", "Leaderboard" (the mini individual-standings
 * table on the right side of it), and "Player Data Pull" (hole-by-hole scores).
 * Sheet names must match exactly. If a sheet/table can't be found, that section
 * of the response just comes back empty instead of erroring the whole feed.
 */

const GROUP_STRIDE = 24;
const PLAYER_DATA_PULL_NAME_COL = 4;
const PLAYER_DATA_PULL_LABEL_COL = 6;
const ROSTER_LABEL_COL = 4;
const ROSTER_NAME_COL = 6;

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const warnings = [];

  const roster = readRoster(ss, warnings);
  const rosterTeamByName = {};
  roster.maroon.forEach((n) => (rosterTeamByName[n.toLowerCase()] = "maroon"));
  roster.white.forEach((n) => (rosterTeamByName[n.toLowerCase()] = "white"));

  const individualLeaderboard = readIndividualLeaderboard(ss, rosterTeamByName, warnings);
  const scorecards = readScorecards(ss, rosterTeamByName, warnings);

  const payload = {
    roster: roster,
    individualLeaderboard: individualLeaderboard,
    scorecards: scorecards,
    warnings: warnings,
    updatedAt: new Date().toISOString(),
  };

  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function readRoster(ss, warnings) {
  const sheet = ss.getSheetByName("Roster");
  if (!sheet) {
    warnings.push('Roster sheet not found — expected a sheet named exactly "Roster".');
    return { maroon: [], white: [] };
  }
  const rows = sheet.getDataRange().getValues();
  const roster = { maroon: [], white: [] };
  let currentTeam = null;

  for (let r = 0; r < rows.length; r++) {
    const label = String(rows[r][ROSTER_LABEL_COL] || "").trim();
    if (label === "Team Maroon") currentTeam = "maroon";
    else if (label === "Team White") currentTeam = "white";

    const name = String(rows[r][ROSTER_NAME_COL] || "").trim();
    if (currentTeam && name) roster[currentTeam].push(name);
  }
  return roster;
}

function readIndividualLeaderboard(ss, rosterTeamByName, warnings) {
  const sheet = ss.getSheetByName("Leaderboard");
  if (!sheet) {
    warnings.push('Leaderboard sheet not found — expected a sheet named exactly "Leaderboard".');
    return [];
  }
  const rows = sheet.getDataRange().getValues();

  // Find the header row: a cell that says "Rank" with "Player" right next to it.
  let headerRow = -1;
  let rankCol = -1;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length - 1; c++) {
      if (String(rows[r][c]).trim() === "Rank" && String(rows[r][c + 1]).trim() === "Player") {
        headerRow = r;
        rankCol = c;
        break;
      }
    }
    if (headerRow !== -1) break;
  }
  if (headerRow === -1) {
    warnings.push('Could not find the individual leaderboard header ("Rank" / "Player") on the Leaderboard sheet.');
    return [];
  }

  const playerCol = rankCol + 1;
  const header = rows[headerRow];
  let overallCol = -1;
  for (let c = playerCol + 1; c < header.length; c++) {
    if (String(header[c]).trim() === "Overall") {
      overallCol = c;
      break;
    }
  }
  if (overallCol === -1) {
    warnings.push('Could not find the "Overall" column on the individual leaderboard table.');
    return [];
  }

  const standings = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const player = String(rows[r][playerCol] || "").trim();
    if (!player) break;

    // Skip players with no rounds posted yet — keeps a blank sheet showing a blank leaderboard.
    let hasAnyRound = false;
    for (let c = playerCol + 1; c < overallCol; c++) {
      if (rows[r][c] !== "" && rows[r][c] !== null) hasAnyRound = true;
    }
    if (!hasAnyRound) continue;

    const toParRaw = rows[r][overallCol];
    const toPar = typeof toParRaw === "number" ? toParRaw : 0;
    const team = rosterTeamByName[player.toLowerCase()] || "maroon";
    standings.push({ player: player, team: team, toPar: toPar });
  }
  return standings;
}

function readScorecards(ss, rosterTeamByName, warnings) {
  const sheet = ss.getSheetByName("Player Data Pull");
  if (!sheet) {
    warnings.push('Player Data Pull sheet not found — expected a sheet named exactly "Player Data Pull".');
    return [];
  }
  const rows = sheet.getDataRange().getValues();

  // Find every "<Name> Round 1 Scorecard" anchor in the label column.
  const blockStarts = [];
  for (let r = 0; r < rows.length; r++) {
    const cell = String(rows[r][PLAYER_DATA_PULL_LABEL_COL] || "");
    if (/Round 1 Scorecard$/.test(cell)) blockStarts.push(r);
  }

  // How many round-groups exist? Count "Hole" headers spaced GROUP_STRIDE apart, using the first block.
  let numGroups = 0;
  if (blockStarts.length > 0) {
    const holeRow = rows[blockStarts[0] + 1] || [];
    for (let g = 0; g < 12; g++) {
      const col = 6 + GROUP_STRIDE * g;
      if (String(holeRow[col]).trim() === "Hole") numGroups++;
      else break;
    }
  }

  const scorecards = [];
  for (const r of blockStarts) {
    const name = resolvePlayerName(rows, r);
    if (!name) {
      warnings.push("A scorecard block at row " + (r + 1) + " on Player Data Pull has no resolvable player name — skipped.");
      continue;
    }

    const holeRow = rows[r + 1] || [];
    const yardsRow = rows[r + 2] || [];
    const parRow = rows[r + 3] || [];
    const scoreRow = rows[r + 5] || [];
    const puttsRow = rows[r + 6] || [];
    const firRow = rows[r + 7] || [];
    const girRow = rows[r + 8] || [];
    const diffRow = rows[r + 9] || [];

    const allRounds = [];
    for (let g = 0; g < numGroups; g++) {
      const base = 6 + GROUP_STRIDE * g;
      const holes = [];
      let playedCount = 0;
      let putts = 0;
      let girHit = 0;
      let firHit = 0;
      let firTotal = 0;

      for (let h = 0; h < 18; h++) {
        const col = base + 1 + h;
        const score = numOr(scoreRow[col], 0);
        const par = numOr(parRow[col], 0);
        const put = numOr(puttsRow[col], 0);
        const fir = firRow[col] === "X" ? "X" : numOr(firRow[col], 0);
        const gir = numOr(girRow[col], 0);
        const diff = numOr(diffRow[col], score && par ? score - par : 0);

        if (score > 0) {
          playedCount++;
          putts += put;
          if (gir === 1) girHit++;
          if (fir !== "X") {
            firTotal++;
            if (fir === 1) firHit++;
          }
        }

        holes.push({ hole: h + 1, par: par, yards: numOr(yardsRow[col], 0), score: score, putts: put, fir: fir, gir: gir, diff: diff });
      }

      const total = holes.reduce((s, h) => s + h.score, 0);
      const parTotal = holes.reduce((s, h) => s + h.par, 0);

      allRounds.push({
        round: g + 1,
        course: "Round " + (g + 1),
        total: total,
        toPar: total - parTotal,
        putts: putts,
        girHit: girHit,
        girTotal: 18,
        firHit: firHit,
        firTotal: firTotal,
        playedCount: playedCount,
        holes: holes,
      });
    }

    // Only keep rounds that have actually started.
    const startedRounds = allRounds.filter((rd) => rd.playedCount > 0);

    const team = rosterTeamByName[name.toLowerCase()] || "maroon";
    scorecards.push({ player: name, team: team, rounds: startedRounds });
  }

  return scorecards;
}

function resolvePlayerName(rows, anchorRow) {
  const titleNameCell = String(rows[anchorRow][PLAYER_DATA_PULL_NAME_COL] || "").trim();
  if (titleNameCell) return titleNameCell;

  const girRow = rows[anchorRow + 8] || [];
  const girNameCell = String(girRow[PLAYER_DATA_PULL_NAME_COL] || "").trim();
  if (girNameCell) return girNameCell;

  const anchorText = String(rows[anchorRow][PLAYER_DATA_PULL_LABEL_COL] || "");
  const match = anchorText.match(/^(.*?)\s*Round 1 Scorecard$/);
  if (match && match[1]) return match[1].trim();

  return "";
}

function numOr(v, fallback) {
  return typeof v === "number" ? v : fallback;
}
