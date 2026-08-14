/**
 * Maroon Masters — score write-back for /portal's scoring tools, plus host admin.
 *
 * Paste this in as a SECOND file in the SAME Apps Script project as live-feed.gs
 * (Apps Script shares one global scope across files in a project, so this reuses
 * resolvePlayerName/GROUP_STRIDE/numOr/readRoster/etc. that are already defined
 * there — no need to redeploy or create a second Web App URL. The existing
 * deployment already handles this automatically: GET = live feed, POST = this file.
 *
 * Auth: every action here trusts a single shared secret (SCOREKEEPER_SERVER_SECRET,
 * set via the menu below) sent by the website's own server — the website has
 * already verified who's asking (via its own Supabase login) before it ever calls
 * here, so this script doesn't need its own login system. It just checks the
 * secret matches, then does what it's told: writes/reads a named player's scores,
 * or (when the caller says isHost) runs pairings/round-control.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Maroon Masters")
    .addItem("Set Scoring Server Secret", "promptSetScorekeeperSecret")
    .addItem("Rebuild Sheet (2027 setup)", "rebuildSheetForSeason")
    .addToUi();
}

function promptSetScorekeeperSecret() {
  const ui = SpreadsheetApp.getUi();

  const resp = ui.prompt(
    "Scoring Server Secret",
    "Paste the same value you put in the website's SCOREKEEPER_SERVER_SECRET setting:",
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const secret = resp.getResponseText().trim();
  if (!secret) {
    ui.alert("Secret can't be blank. Run this again to try again.");
    return;
  }

  PropertiesService.getScriptProperties().setProperty("SCOREKEEPER_SERVER_SECRET", secret);
  ui.alert("Scoring server secret saved.");
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: "Could not read the request." });
  }

  if (body.type === "playerGetRounds") return jsonResponse(handlePlayerGetRounds(body.serverSecret, body.player));
  if (body.type === "playerSubmitHole")
    return jsonResponse(
      handlePlayerSubmitHole(body.serverSecret, body.player, body.round, body.target, body.hole, body.score, body.putts, body.fir, body.gir)
    );
  if (body.type === "hostGetData") return jsonResponse(handleHostGetData(body.serverSecret));
  if (body.type === "hostSubmitHole")
    return jsonResponse(handleHostSubmitHole(body.serverSecret, body.player, body.round, body.hole, body.score, body.putts, body.fir, body.gir));
  if (body.type === "hostGetPlayerRound") return jsonResponse(handleHostGetPlayerRound(body.serverSecret, body.player, body.round));
  if (body.type === "hostSetPairings")
    return jsonResponse(handleHostSetPairings(body.serverSecret, body.round, body.session, body.format, body.maroonPlayers, body.whitePlayers));
  if (body.type === "hostDeletePairing") return jsonResponse(handleHostDeletePairing(body.serverSecret, body.row));
  if (body.type === "hostStartRound") return jsonResponse(handleHostStartRound(body.serverSecret, body.round));
  if (body.type === "hostResetRound") return jsonResponse(handleHostResetRound(body.serverSecret, body.round));
  if (body.type === "hostSendRawEmail") return jsonResponse(handleHostSendRawEmail(body.to, body.subject, body.body, body.secret));
  return jsonResponse({ error: "Unknown request type." });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Auth ---------- */

function checkServerSecret(serverSecret) {
  const expected = PropertiesService.getScriptProperties().getProperty("SCOREKEEPER_SERVER_SECRET");
  if (!expected) {
    return {
      valid: false,
      error: 'No scoring server secret has been set yet. Open the Sheet, then run "Maroon Masters > Set Scoring Server Secret" from the menu.',
    };
  }
  if (String(serverSecret || "") !== expected) return { valid: false, error: "Unauthorized." };
  return { valid: true };
}

/* ---------- Shared scorecard helpers ---------- */

function findPlayerBlockRow(rows, playerName) {
  const target = playerName.toLowerCase();
  for (let r = 0; r < rows.length; r++) {
    const cell = String(rows[r][PLAYER_DATA_PULL_LABEL_COL] || "");
    if (/Round 1 Scorecard$/.test(cell)) {
      const name = resolvePlayerName(rows, r);
      if (name.toLowerCase() === target) return r;
    }
  }
  return -1;
}

function readPlayerRoundHoles(player, round) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Player Data Pull");
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  const blockRow = findPlayerBlockRow(rows, player);
  if (blockRow === -1) return null;

  const base = 6 + GROUP_STRIDE * (round - 1);
  const yardsRow = rows[blockRow + 2] || [];
  const parRow = rows[blockRow + 3] || [];
  const scoreRow = rows[blockRow + 5] || [];
  const puttsRow = rows[blockRow + 6] || [];
  const firRow = rows[blockRow + 7] || [];
  const girRow = rows[blockRow + 8] || [];

  const holes = [];
  for (let h = 0; h < 18; h++) {
    const col = base + 1 + h;
    holes.push({
      hole: h + 1,
      par: numOr(parRow[col], 0),
      yards: numOr(yardsRow[col], 0),
      score: numOr(scoreRow[col], 0),
      putts: numOr(puttsRow[col], 0),
      fir: firRow[col] === "X" ? "X" : numOr(firRow[col], 0),
      gir: numOr(girRow[col], 0),
    });
  }
  return holes;
}

function writeHoleScore(playerName, round, hole, score, putts, fir, gir) {
  const holeNum = Number(hole);
  if (!holeNum || holeNum < 1 || holeNum > 18) return { saved: false, error: "Hole must be between 1 and 18." };

  const scoreVal = Number(score);
  if (!scoreVal || scoreVal < 1) return { saved: false, error: "Score must be at least 1." };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Player Data Pull");
  if (!sheet) return { saved: false, error: "Player Data Pull sheet not found." };
  const rows = sheet.getDataRange().getValues();
  const blockRow = findPlayerBlockRow(rows, playerName);
  if (blockRow === -1) return { saved: false, error: "Could not find " + playerName + "'s scorecard block." };

  const base = 6 + GROUP_STRIDE * (round - 1);
  const col = base + 1 + (holeNum - 1);
  const parRow = rows[blockRow + 3] || [];
  const par = numOr(parRow[col], 0);
  const isPar3 = par === 3;

  const puttsVal = Number(putts) || 0;
  const girVal = gir ? 1 : 0;
  const firVal = isPar3 ? "X" : fir ? 1 : 0;
  const diffVal = par ? scoreVal - par : 0;

  // rows[] is 0-indexed (from getValues); getRange() is 1-indexed — hence the +1s below.
  sheet.getRange(blockRow + 4 + 1, col + 1).setValue(true); // Played
  sheet.getRange(blockRow + 5 + 1, col + 1).setValue(scoreVal); // Score
  sheet.getRange(blockRow + 6 + 1, col + 1).setValue(puttsVal); // Putts
  sheet.getRange(blockRow + 7 + 1, col + 1).setValue(firVal); // FIR
  sheet.getRange(blockRow + 8 + 1, col + 1).setValue(girVal); // GIR
  sheet.getRange(blockRow + 9 + 1, col + 1).setValue(diffVal); // Diff

  return { saved: true, player: playerName, round: round, hole: holeNum };
}

/* ---------- Pairings ---------- */

function readPairings(ss) {
  const sheet = ss.getSheetByName("Pairings");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const pairings = [];
  for (let r = 1; r < rows.length; r++) {
    const session = String(rows[r][1] || "").trim();
    const format = String(rows[r][2] || "").trim();
    if (!session && !format) continue;
    pairings.push({
      row: r + 1,
      round: Number(rows[r][0]) || 0,
      session: session,
      format: format,
      maroonPlayers: [String(rows[r][3] || "").trim(), String(rows[r][4] || "").trim()].filter(Boolean),
      whitePlayers: [String(rows[r][5] || "").trim(), String(rows[r][6] || "").trim()].filter(Boolean),
    });
  }
  return pairings;
}

function findPairingForPlayer(pairings, round, playerName) {
  const target = playerName.toLowerCase();
  for (const p of pairings) {
    if (p.round !== round) continue;
    const mi = p.maroonPlayers.findIndex((n) => n.toLowerCase() === target);
    if (mi !== -1) return { pairing: p, side: "maroon", slot: mi, partner: p.whitePlayers[mi] || null };
    const wi = p.whitePlayers.findIndex((n) => n.toLowerCase() === target);
    if (wi !== -1) return { pairing: p, side: "white", slot: wi, partner: p.maroonPlayers[wi] || null };
  }
  return null;
}

function handleHostSetPairings(serverSecret, round, session, format, maroonPlayers, whitePlayers) {
  const check = checkServerSecret(serverSecret);
  if (!check.valid) return { ok: false, error: check.error };

  const roundNum = Number(round);
  const sessionVal = String(session || "").trim();
  const formatVal = String(format || "").trim();
  if (!roundNum || roundNum < 1) return { ok: false, error: "Round is required." };
  if (!sessionVal) return { ok: false, error: "Session is required." };
  if (!formatVal) return { ok: false, error: "Format is required." };
  if (!Array.isArray(maroonPlayers) || maroonPlayers.length === 0) return { ok: false, error: "Pick at least one Maroon player." };
  if (!Array.isArray(whitePlayers) || whitePlayers.length === 0) return { ok: false, error: "Pick at least one White player." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Pairings");
  if (!sheet) {
    sheet = ss.insertSheet("Pairings");
    sheet.getRange(1, 1, 1, 7).setValues([["Round", "Session", "Format", "Maroon1", "Maroon2", "White1", "White2"]]);
  }

  const row = [roundNum, sessionVal, formatVal, maroonPlayers[0] || "", maroonPlayers[1] || "", whitePlayers[0] || "", whitePlayers[1] || ""];
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

  return { ok: true };
}

function handleHostDeletePairing(serverSecret, row) {
  const check = checkServerSecret(serverSecret);
  if (!check.valid) return { ok: false, error: check.error };

  const rowNum = Number(row);
  if (!rowNum || rowNum < 2) return { ok: false, error: "Invalid row." };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pairings");
  if (!sheet) return { ok: false, error: "Pairings sheet not found." };
  if (rowNum > sheet.getLastRow()) return { ok: false, error: "That pairing no longer exists." };

  sheet.deleteRow(rowNum);
  return { ok: true };
}

/* ---------- Player emails (unrelated to login — used for other host comms) ---------- */

function readPlayerEmails(ss) {
  const sheet = ss.getSheetByName("Player Emails");
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  const map = {};
  for (let r = 1; r < rows.length; r++) {
    const first = String(rows[r][0] || "").trim();
    const last = String(rows[r][1] || "").trim();
    const email = String(rows[r][2] || "").trim();
    const name = [first, last].filter(Boolean).join(" ");
    if (name && email) map[name.toLowerCase()] = email;
  }
  return map;
}

function handleHostSendRawEmail(to, subject, body, secret) {
  const expected = PropertiesService.getScriptProperties().getProperty("RAW_EMAIL_SECRET");
  if (!expected || String(secret || "") !== expected) return { ok: false, error: "Unauthorized." };
  if (!to || !subject || !body) return { ok: false, error: "Missing to, subject, or body." };
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: "Could not send email: " + err.message };
  }
}

/* ---------- Round lifecycle ---------- */

function readRoundState(ss) {
  const sheet = ss.getSheetByName("Round State");
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const state = [];
  for (let r = 1; r < rows.length; r++) {
    const round = Number(rows[r][0]);
    const started = rows[r][1] === true || String(rows[r][1]).trim().toUpperCase() === "TRUE";
    if (round) state.push({ round: round, started: started });
  }
  return state;
}

function startedRounds(ss) {
  return readRoundState(ss)
    .filter((r) => r.started)
    .map((r) => r.round);
}

function handleHostStartRound(serverSecret, round) {
  const check = checkServerSecret(serverSecret);
  if (!check.valid) return { ok: false, error: check.error };

  const roundNum = Number(round);
  if (!roundNum || roundNum < 1) return { ok: false, error: "Round is required." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Round State");
  if (!sheet) {
    sheet = ss.insertSheet("Round State");
    sheet.getRange(1, 1, 1, 2).setValues([["Round", "Started"]]);
  }

  const rows = sheet.getDataRange().getValues();
  let found = false;
  for (let r = 1; r < rows.length; r++) {
    if (Number(rows[r][0]) === roundNum) {
      sheet.getRange(r + 1, 2).setValue(true);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[roundNum, true]]);
  }

  return { ok: true, round: roundNum };
}

function handleHostResetRound(serverSecret, round) {
  const check = checkServerSecret(serverSecret);
  if (!check.valid) return { ok: false, error: check.error };

  const roundNum = Number(round);
  if (!roundNum || roundNum < 1) return { ok: false, error: "Round is required." };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Player Data Pull");
  if (!sheet) return { ok: false, error: "Player Data Pull sheet not found." };
  const rows = sheet.getDataRange().getValues();

  const blockStarts = [];
  for (let r = 0; r < rows.length; r++) {
    const cell = String(rows[r][PLAYER_DATA_PULL_LABEL_COL] || "");
    if (/Round 1 Scorecard$/.test(cell)) blockStarts.push(r);
  }

  const base = 6 + GROUP_STRIDE * (roundNum - 1);
  const startCol = base + 2; // 1-indexed column for hole 1
  const blankRow18 = new Array(18).fill("");
  const falseRow18 = new Array(18).fill(false);

  for (const blockRow of blockStarts) {
    sheet.getRange(blockRow + 5, startCol, 1, 18).setValues([falseRow18]); // Played
    sheet.getRange(blockRow + 6, startCol, 1, 18).setValues([blankRow18]); // Score
    sheet.getRange(blockRow + 7, startCol, 1, 18).setValues([blankRow18]); // Putts
    sheet.getRange(blockRow + 8, startCol, 1, 18).setValues([blankRow18]); // FIR
    sheet.getRange(blockRow + 9, startCol, 1, 18).setValues([blankRow18]); // GIR
    sheet.getRange(blockRow + 10, startCol, 1, 18).setValues([blankRow18]); // Diff
  }

  return { ok: true, round: roundNum, playersCleared: blockStarts.length };
}

/* ---------- Player scoring ---------- */

function handlePlayerGetRounds(serverSecret, player) {
  const check = checkServerSecret(serverSecret);
  if (!check.valid) return { valid: false, error: check.error };

  const playerName = String(player || "").trim();
  if (!playerName) return { valid: false, error: "Player is required." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const started = startedRounds(ss);
  if (started.length === 0) {
    return { valid: true, player: playerName, rounds: [], waiting: "Waiting for the host to start a round." };
  }

  const pairings = readPairings(ss);
  const rounds = [];
  for (const round of started) {
    const holes = readPlayerRoundHoles(playerName, round);
    if (!holes) continue;
    const match = findPairingForPlayer(pairings, round, playerName);
    const partner = match ? match.partner : null;
    const partnerHoles = partner ? readPlayerRoundHoles(partner, round) : null;
    rounds.push({ round: round, holes: holes, partner: partner, partnerHoles: partnerHoles });
  }

  if (rounds.length === 0) {
    return { valid: true, player: playerName, rounds: [], waiting: "Waiting for the host to start a round." };
  }

  return { valid: true, player: playerName, rounds: rounds };
}

function handlePlayerSubmitHole(serverSecret, player, round, target, hole, score, putts, fir, gir) {
  const check = checkServerSecret(serverSecret);
  if (!check.valid) return { saved: false, error: check.error };

  const playerName = String(player || "").trim();
  if (!playerName) return { saved: false, error: "Player is required." };

  const roundNum = Number(round);
  if (!roundNum || roundNum < 1) return { saved: false, error: "Round is required." };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const started = startedRounds(ss);
  if (started.indexOf(roundNum) === -1) return { saved: false, error: "This round hasn't been started by the host yet." };

  let writeTarget;
  if (target === "self") {
    writeTarget = playerName;
  } else if (target === "partner") {
    const pairings = readPairings(ss);
    const match = findPairingForPlayer(pairings, roundNum, playerName);
    if (!match || !match.partner) return { saved: false, error: "No playing partner assigned for this round yet." };
    writeTarget = match.partner;
  } else {
    return { saved: false, error: "Invalid target." };
  }

  return writeHoleScore(writeTarget, roundNum, hole, score, putts, fir, gir);
}

/* ---------- Host data + direct-edit actions ---------- */

function handleHostGetData(serverSecret) {
  const check = checkServerSecret(serverSecret);
  if (!check.valid) return { ok: false, error: check.error };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const warnings = [];
  const roster = readRoster(ss, warnings);
  const rosterTeamByName = {};
  roster.maroon.forEach((n) => (rosterTeamByName[n.toLowerCase()] = "maroon"));
  roster.white.forEach((n) => (rosterTeamByName[n.toLowerCase()] = "white"));

  const individualLeaderboard = readIndividualLeaderboard(ss, rosterTeamByName, warnings);
  const scorecards = readScorecards(ss, rosterTeamByName, warnings);
  const pairings = readPairings(ss);
  const roundState = readRoundState(ss);

  return {
    ok: true,
    roster: roster,
    individualLeaderboard: individualLeaderboard,
    scorecards: scorecards,
    pairings: pairings,
    roundState: roundState,
    warnings: warnings,
  };
}

function handleHostSubmitHole(serverSecret, player, round, hole, score, putts, fir, gir) {
  const check = checkServerSecret(serverSecret);
  if (!check.valid) return { saved: false, error: check.error };

  const playerName = String(player || "").trim();
  const roundNum = Number(round);
  if (!playerName) return { saved: false, error: "Player is required." };
  if (!roundNum || roundNum < 1) return { saved: false, error: "Round is required." };

  return writeHoleScore(playerName, roundNum, hole, score, putts, fir, gir);
}

function handleHostGetPlayerRound(serverSecret, player, round) {
  const check = checkServerSecret(serverSecret);
  if (!check.valid) return { ok: false, error: check.error };

  const playerName = String(player || "").trim();
  const roundNum = Number(round);
  if (!playerName) return { ok: false, error: "Player is required." };
  if (!roundNum || roundNum < 1) return { ok: false, error: "Round is required." };

  const holes = readPlayerRoundHoles(playerName, roundNum);
  if (!holes) return { ok: false, error: "Could not find " + playerName + "'s scorecard block." };

  return { ok: true, player: playerName, round: roundNum, holes: holes };
}

/* ---------- One-time 2027 season rebuild ---------- */

// Round number -> { course, holes: [{ yards, par }, ...] (18 entries) }.
// Placeholder data carried over from the 2026 trip — replace with real 2027
// numbers once known. Rounds 2 and 6 are Alt Shot (no individual scorecard).
const SEASON_REBUILD_ROUNDS = {
  1: {
    course: "Cove",
    holes: [
      [388, 4], [355, 4], [382, 4], [162, 3], [517, 5], [140, 3], [338, 4], [515, 5], [398, 4],
      [446, 4], [398, 4], [343, 4], [197, 3], [483, 5], [163, 4], [354, 4], [398, 4], [501, 5],
    ],
  },
  3: {
    course: "Classic",
    holes: [
      [315, 4], [478, 5], [406, 4], [196, 3], [508, 5], [228, 3], [341, 4], [365, 4], [405, 5],
      [340, 4], [167, 3], [548, 5], [391, 4], [405, 4], [357, 4], [415, 4], [173, 3], [499, 5],
    ],
  },
  4: {
    course: "Pete Dye #1",
    holes: [
      [352, 4], [396, 4], [215, 3], [521, 5], [453, 4], [186, 3], [457, 4], [381, 4], [563, 5],
      [465, 4], [176, 3], [367, 4], [451, 4], [521, 5], [353, 4], [529, 5], [167, 3], [398, 4],
    ],
  },
  5: {
    course: "Pete Dye #2",
    holes: [
      [352, 4], [396, 4], [215, 3], [521, 5], [453, 4], [186, 3], [457, 4], [381, 4], [563, 5],
      [465, 4], [176, 3], [367, 4], [451, 4], [521, 5], [353, 4], [529, 5], [167, 3], [398, 4],
    ],
  },
  7: {
    course: "Tournament",
    holes: [
      [450, 4], [520, 5], [475, 4], [418, 4], [185, 3], [393, 4], [393, 4], [185, 3], [538, 5],
      [382, 4], [554, 5], [438, 4], [448, 4], [191, 3], [405, 4], [437, 4], [192, 3], [646, 5],
    ],
  },
  8: {
    course: "Palmer #1 (PLACEHOLDER — replace with real 2027 data)",
    holes: new Array(18).fill([9999, 4]),
  },
};

function rebuildSheetForSeason() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "Rebuild Sheet for 2027",
    "This deletes Day 1-4 and Copy Corner, rebuilds Player Data Pull from scratch, and adds point columns to Pairings. " +
      "It makes a full backup copy first. Do NOT run this once real rounds have started — it will erase entered scores. Continue?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backupName = ss.getName() + " — backup before rebuild " + new Date().toISOString();
  DriveApp.getFileById(ss.getId()).makeCopy(backupName);

  deleteSheetIfExists(ss, "Day 1");
  deleteSheetIfExists(ss, "Day 2");
  deleteSheetIfExists(ss, "Day 3");
  deleteSheetIfExists(ss, "Day 4");
  deleteSheetIfExists(ss, "Copy Corner");

  addPairingsPointColumns(ss);
  rebuildPlayerDataPull(ss);
  fixLeaderboardTeamTotals(ss);
  clearObsoleteGraphsDayBlock(ss);

  ui.alert("Rebuild complete. Backup saved as: " + backupName);
}

function deleteSheetIfExists(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (sheet) ss.deleteSheet(sheet);
}

function addPairingsPointColumns(ss) {
  let sheet = ss.getSheetByName("Pairings");
  if (!sheet) {
    sheet = ss.insertSheet("Pairings");
    sheet.getRange(1, 1, 1, 9).setValues([
      ["Round", "Session", "Format", "Maroon1", "Maroon2", "White1", "White2", "MaroonPoints", "WhitePoints"],
    ]);
    return;
  }
  const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 9)).getValues()[0];
  if (header[7] !== "MaroonPoints") sheet.getRange(1, 8).setValue("MaroonPoints");
  if (header[8] !== "WhitePoints") sheet.getRange(1, 9).setValue("WhitePoints");
}

function rebuildPlayerDataPull(ss) {
  let sheet = ss.getSheetByName("Player Data Pull");
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet("Player Data Pull");
  sheet.hideSheet();

  const roster = readRoster(ss, []);
  const players = [...roster.maroon, ...roster.white];
  const activeRounds = Object.keys(SEASON_REBUILD_ROUNDS)
    .map(Number)
    .sort((a, b) => a - b);

  const rowsPerBlock = 10; // anchor, Hole, Yards, Par, Played, Score, Putts, FIR, GIR, Diff
  let blockRow = 0; // 0-indexed, matches Apps Script row math used elsewhere in this file

  for (const player of players) {
    const anchorRow = blockRow + 1; // 1-indexed for getRange
    sheet.getRange(anchorRow, PLAYER_DATA_PULL_NAME_COL + 1).setValue(player);
    sheet.getRange(anchorRow, PLAYER_DATA_PULL_LABEL_COL + 1).setValue(player + " Round 1 Scorecard");

    for (const round of activeRounds) {
      const roundData = SEASON_REBUILD_ROUNDS[round];
      const base = 6 + GROUP_STRIDE * (round - 1);
      const holeRow = anchorRow + 1;
      const yardsRow = anchorRow + 2;
      const parRow = anchorRow + 3;
      const playedRow = anchorRow + 4;
      const scoreRow = anchorRow + 5;
      const puttsRow = anchorRow + 6;
      const firRow = anchorRow + 7;
      const girRow = anchorRow + 8;
      const diffRow = anchorRow + 9;

      const holeNums = [];
      const yards = [];
      const pars = [];
      const played = [];
      const fir = [];
      const gir = [];
      for (let h = 0; h < 18; h++) {
        holeNums.push(h + 1);
        yards.push(roundData.holes[h][0]);
        pars.push(roundData.holes[h][1]);
        played.push(0);
        fir.push(roundData.holes[h][1] === 3 ? "X" : 0);
        gir.push(0);
      }

      const startCol = base + 1 + 1; // 1-indexed column for hole 1
      sheet.getRange(holeRow, startCol, 1, 18).setValues([holeNums]);
      sheet.getRange(yardsRow, startCol, 1, 18).setValues([yards]);
      sheet.getRange(parRow, startCol, 1, 18).setValues([pars]);
      sheet.getRange(playedRow, startCol, 1, 18).setValues([played]);
      sheet.getRange(scoreRow, startCol, 1, 18).setValues([played]); // blank scores = 0 placeholder
      sheet.getRange(puttsRow, startCol, 1, 18).setValues([played]); // blank putts = 0 placeholder
      sheet.getRange(firRow, startCol, 1, 18).setValues([fir]);
      sheet.getRange(girRow, startCol, 1, 18).setValues([gir]);
      sheet.getRange(diffRow, startCol, 1, 18).setValues([played]); // blank diff = 0 placeholder
    }

    blockRow += rowsPerBlock + 1; // +1 row of spacing between player blocks
  }
}

function fixLeaderboardTeamTotals(ss) {
  const sheet = ss.getSheetByName("Leaderboard");
  if (!sheet) return;
  // O18 / U18 are the "Maroon" / "White" total-points cells next to the
  // Team Point Breakdown header (row 16: O="Maroon", U="White").
  sheet.getRange("O18").setFormula("=SUM(Pairings!H2:H1000)");
  sheet.getRange("U18").setFormula("=SUM(Pairings!I2:I1000)");
}

function clearObsoleteGraphsDayBlock(ss) {
  const sheet = ss.getSheetByName("GRAPHS Data Organization");
  if (!sheet) return;
  // D152:Q313 was a per-match results pull from the now-deleted Day tabs.
  // Match-by-match detail now lives directly on Pairings instead.
  sheet.getRange("D152:Q313").clearContent();
}
