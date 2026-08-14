# Live Scoring Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the live, in-tournament scoring system — players enter hole-by-hole scores for themselves and their round partner, Tiger runs pairings/round start-reset/direct score edits — replacing the "coming in a later round" placeholders in `/portal`.

**Architecture:** `/portal` (Supabase-authenticated) gains a player scoring panel and a new `/portal/host` area. Both talk to the existing Google-Sheet-backed `appscript/write-scores.gs` through Next.js Server-side Route Handlers, authenticated by one shared server secret instead of the old player-code/host-password systems (which are removed). No new database — scores still land in the same Sheet that already powers the public `/leaderboard` via `live-feed.gs`.

**Tech Stack:** Next.js 16 App Router (Route Handlers, Server Components), TypeScript, Supabase (`@supabase/ssr`), Google Apps Script (`write-scores.gs`), `node:test` via `tsx` for unit tests.

**Spec:** `docs/superpowers/specs/2026-08-14-live-scoring-platform-design.md`

## Global Constraints

- Both player and host identity come from the existing Supabase session (`profiles.is_host`, `profiles.player_slug`) — nothing player-supplied is ever trusted as identity server-side.
- All calls to `write-scores.gs` happen server-side only (Route Handlers / Server Components), carrying `SCOREKEEPER_SERVER_SECRET` — this value must never reach the browser.
- No changes to `appscript/live-feed.gs`, `/api/live-feed`, `lib/data/live.ts`, `lib/data/liveFeedNormalize.ts`, or any public `/leaderboard`, `/teams`, `/schedule`, `/history` page.
- `appscript/write-scores.gs` has no automated test harness — every task touching it is verified with a documented manual checklist against a sandbox Sheet, not `npm test`.
- Match existing code style: Tailwind utility classes matching `components/scorecard/` and `components/portal/`, POST-only action routes under `app/api/portal/...` (see `app/api/portal/admin/unlink/route.ts`), `node:test`/`assert/strict` for unit tests under `lib/**/*.test.ts`.
- Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` before considering any task done that touches `.ts`/`.tsx` files.

---

### Task 1: Apps Script backend — replace code/host-password auth with a shared server secret

**Files:**
- Modify: `appscript/write-scores.gs` (full rewrite of the auth-related sections; scorecard/pairings/round-lifecycle logic unchanged)
- Modify: `appscript/README.md`

**Interfaces:**
- Produces (consumed by Task 2's `lib/scorekeeper/client.ts`): `doPost` actions, each taking `serverSecret` as their first auth field instead of `code`/`token`:
  - `{ type: "playerGetRounds", serverSecret, player }` → `{ valid: true, player, rounds: [{round, holes, partner, partnerHoles}] } | { valid: true, player, rounds: [], waiting } | { valid: false, error }`
  - `{ type: "playerSubmitHole", serverSecret, player, round, target: "self"|"partner", hole, score, putts, fir, gir }` → `{ saved: true, player, round, hole } | { saved: false, error }`
  - `{ type: "hostGetData", serverSecret }` → `{ ok: true, roster, individualLeaderboard, scorecards, pairings, roundState, warnings } | { ok: false, error }`
  - `{ type: "hostSubmitHole", serverSecret, player, round, hole, score, putts, fir, gir }` → same shape as `playerSubmitHole`'s response
  - `{ type: "hostGetPlayerRound", serverSecret, player, round }` → `{ ok: true, player, round, holes } | { ok: false, error }`
  - `{ type: "hostSetPairings", serverSecret, round, session, format, maroonPlayers, whitePlayers }` → `{ ok: true } | { ok: false, error }`
  - `{ type: "hostDeletePairing", serverSecret, row }` → `{ ok: true } | { ok: false, error }`
  - `{ type: "hostStartRound", serverSecret, round }` → `{ ok: true, round } | { ok: false, error }`
  - `{ type: "hostResetRound", serverSecret, round }` → `{ ok: true, round, playersCleared } | { ok: false, error }`
  - `{ type: "hostSendRawEmail", to, subject, body, secret }` — unchanged, not part of this task

- [ ] **Step 1: Rewrite `appscript/write-scores.gs`**

Replace the entire file with the content below. This removes `validateCode`/`submitHoleAs`, the `Player Codes` sheet + code-email flow, the `CADE_MASTER_CODE` backdoor, and `hostLogin`/`verifyHostToken`/the `Host Login` sheet — all replaced by one `checkServerSecret` guard. `readPlayerEmails`/`handleHostSendRawEmail` are untouched (unrelated to login). `rebuildPlayerDataPull` now sources its player list from `readRoster` instead of the now-removed `Player Codes` sheet.

```javascript
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
```

- [ ] **Step 2: Update `appscript/README.md`**

Replace the "Setting your host password" section with instructions for the new secret, and remove references to player codes/emails from "How the trip actually runs." Full replacement content:

```markdown
# Hooking up the live feed and the scoring tools (one-time setup)

This makes your Google Sheet talk to both the public website (reads scores) and the website's own scoring tools under `/portal/host` and `/portal` (writes scores). You only have to do this once — after it's set up, everything just works.

## What you're doing, in plain terms

You're going to paste two small scripts into your Google Sheet, as two separate files in the same project. One reads your Roster, Leaderboard, and Player Data Pull tabs and hands them to the website. The other handles score writes — pairings, rounds, and the host tools — trusting a shared secret that only the website's own server knows. Then you'll turn the whole project into one "Web App" — Google gives it a public web address that handles both jobs automatically.

## Steps

1. Open the **2027 Maroon Masters** Google Sheet (the real one, not the Excel file).
2. Click **Extensions** in the top menu → **Apps Script**. This opens a new tab with a code editor.
3. You'll see a file with some placeholder code already in it (probably named `Code.gs`). Select all of it and delete it.
4. Open `live-feed.gs` from this folder, copy everything in it, and paste it into that empty editor.
5. Click the **+** next to "Files" on the left → **Script** → name it `write-scores` (it'll save as `write-scores.gs`). Open `write-scores.gs` from this folder, copy everything in it, and paste it into that new file.
6. Click the **Save** icon (looks like a floppy disk) near the top.
7. Click the blue **Deploy** button (top right) → **New deployment**.
8. Click the gear icon ⚙️ next to "Select type" → choose **Web app**.
9. Fill in:
   - **Description**: anything, e.g. "live feed"
   - **Execute as**: Me (your account)
   - **Who has access**: **Anyone** — this needs to be public so the website can reach it without you logging in every time. Writes are still locked down by the shared secret inside the script itself, not by who can reach the URL.
10. Click **Deploy**.
11. Google will probably ask you to authorize it — click through that (it's your own script asking permission to read/edit your own sheet).
12. You'll get a URL that looks like `https://script.google.com/macros/s/AKfycb.../exec`. **Copy that whole URL and send it to me** — that's the one thing I need from you to finish wiring up the website.

## Setting the scoring server secret

The website's own server talks to this script using a shared secret — a password only the two of them know, not something anyone types into a screen.

1. Pick any long random-ish value (e.g. generate one at a site like 1password.com/password-generator, or just mash the keyboard for 30+ characters).
2. Close the Apps Script tab and go back to the actual Google Sheet. Reload the page. A new menu called **Maroon Masters** should appear in the menu bar next to Help.
3. Click **Maroon Masters → Set Scoring Server Secret**, paste in the value you picked.
4. Send me that same value — it goes into the website's `SCOREKEEPER_SERVER_SECRET` setting. Both sides have to match exactly.

## How the trip actually runs

1. **Pairings tab** (`/portal/host` → Pairings): before each round, set up that round's matches — pick players for Maroon and White in click order (1st click = Slot 1, 2nd click = Slot 2). Slot 1 vs Slot 1 and Slot 2 vs Slot 2 track each other's stats that round — that's automatic, you don't set it separately.
2. **Rounds tab** (`/portal/host` → Rounds): a round only accepts scores once you click **Start** for it. Until then, players see "waiting for the host to start Round N." If you need to wipe a round's entries and redo it, **Reset** clears just that round's scores — pairings are untouched.
3. Players log into `/portal` with their regular site account (same login as everywhere else on the site) and see two tabs: **My Score** and **[Partner]'s Score** — whoever their Pairings slot-counterpart is that round.

## New tabs you'll see appear on their own

You don't need to create these — the app manages them: **Pairings** (round groupings you set up from `/portal/host`), **Round State** (which rounds you've started). Leave them alone unless you're fixing a typo'd name.

## If you ever edit the scripts later

Any time you change the code in `live-feed.gs` or `write-scores.gs`: paste the updated code into the same Apps Script editor, save, then **Deploy → Manage deployments → click the pencil/edit icon on the existing deployment → Version: New version → Deploy**. This keeps the same URL, so you don't need to send anyone a new one.

## One thing to watch for on the sheet itself

If you ever build a new player's row by copying an existing player's whole block of rows in **Player Data Pull** (instead of typing it from scratch), make sure you also update that player's name everywhere it appears in that block — not just the visible name, but the little internal labels too (things like `KylePlayed`, `KyleScore` in the hidden helper column). If you copy Kyle's block to make a new player and forget to rename those, the website will show that new player's scores under Kyle's name instead. This happened once in the 2026 sheet and I had to untangle it by hand — easy to avoid by just double-checking the copied block's labels before moving on.
```

- [ ] **Step 3: Manual verification checklist (no automated test harness exists for Apps Script)**

Paste the updated `write-scores.gs`/`live-feed.gs` into a **sandbox copy** of the Sheet (File → Make a copy on the real Sheet first — never test against the live trip sheet), deploy as a Web App, run `Maroon Masters → Set Scoring Server Secret`, then verify with `curl` or Postman against the deployed `/exec` URL:
  1. `POST { "type": "hostGetData", "serverSecret": "wrong" }` → `{ ok: false, error: "Unauthorized." }`
  2. `POST { "type": "hostGetData", "serverSecret": "<real>" }` → `{ ok: true, roster, individualLeaderboard, scorecards, pairings, roundState, warnings }` (no `playerCodes` key)
  3. `POST { "type": "hostSetPairings", "serverSecret": "<real>", "round": 1, "session": "Morning", "format": "Fourball", "maroonPlayers": ["<p1>","<p2>"], "whitePlayers": ["<p3>","<p4>"] }` → `{ ok: true }`
  4. `POST { "type": "hostStartRound", "serverSecret": "<real>", "round": 1 }` → `{ ok: true, round: 1 }`
  5. `POST { "type": "playerGetRounds", "serverSecret": "<real>", "player": "<p1>" }` → `rounds` includes round 1 with `partner: "<p3>"`
  6. `POST { "type": "playerSubmitHole", "serverSecret": "<real>", "player": "<p1>", "round": 1, "target": "self", "hole": 1, "score": 4, "putts": 2, "fir": 1, "gir": 1 }` → `{ saved: true, ... }`; confirm `Player Data Pull` updated and `GET` (live feed) reflects it in `scorecards`
  7. `POST { "type": "playerSubmitHole", ..., "target": "partner", ... }` → writes to `<p3>`'s block
  8. `POST { "type": "hostResetRound", "serverSecret": "<real>", "round": 1 }` → clears round 1's entries, confirm via `hostGetPlayerRound`
  9. Confirm the old actions are gone: `POST { "type": "validateCode", "code": "ANY" }` and `POST { "type": "hostLogin", "username": "x", "password": "y" }` both return `{ error: "Unknown request type." }`
  10. Run `Maroon Masters → Rebuild Sheet (2027 setup)` on the sandbox copy, confirm `Player Data Pull` is rebuilt from the Roster tab's player list (not a `Player Codes` tab, which no longer exists)

Record the checklist result before marking this task done — this is the task's test cycle in place of `npm test`.

- [ ] **Step 4: Commit**

```bash
git add appscript/write-scores.gs appscript/README.md
git commit -m "feat(scoring): replace player-code/host-password auth with a shared server secret

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Scorekeeper client library

**Files:**
- Create: `lib/scorekeeper/types.ts`
- Create: `lib/scorekeeper/client.ts`
- Create: `lib/scorekeeper/client.test.ts`
- Modify: `.env.example` (add `SCOREKEEPER_SERVER_SECRET=`)

**Interfaces:**
- Consumes: `process.env.LIVE_FEED_URL`, `process.env.SCOREKEEPER_SERVER_SECRET`
- Produces (consumed by Tasks 3 and 5):
  - `type HoleEntry = { hole: number; par: number; yards: number; score: number; putts: number; fir: number | "X"; gir: number }`
  - `type PlayerRounds = { round: number; holes: HoleEntry[]; partner: string | null; partnerHoles: HoleEntry[] | null }`
  - `type Pairing = { row: number; round: number; session: string; format: string; maroonPlayers: string[]; whitePlayers: string[] }`
  - `type RoundState = { round: number; started: boolean }`
  - `getPlayerRounds(player: string): Promise<{ ok: true; rounds: PlayerRounds[]; waiting?: string } | { ok: false; error: string }>`
  - `submitHoleAsPlayer(player: string, round: number, target: "self" | "partner", hole: number, score: number, putts: number, fir: boolean, gir: boolean): Promise<{ ok: true } | { ok: false; error: string }>`
  - `getHostData(): Promise<{ ok: true; roster: { maroon: string[]; white: string[] }; pairings: Pairing[]; roundState: RoundState[] } | { ok: false; error: string }>`
  - `submitHoleAsHost(player: string, round: number, hole: number, score: number, putts: number, fir: boolean, gir: boolean): Promise<{ ok: true } | { ok: false; error: string }>`
  - `setPairings(round: number, session: string, format: string, maroonPlayers: string[], whitePlayers: string[]): Promise<{ ok: true } | { ok: false; error: string }>`
  - `deletePairing(row: number): Promise<{ ok: true } | { ok: false; error: string }>`
  - `startRound(round: number): Promise<{ ok: true } | { ok: false; error: string }>`
  - `resetRound(round: number): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Write `lib/scorekeeper/types.ts`**

```typescript
export interface HoleEntry {
  hole: number;
  par: number;
  yards: number;
  score: number;
  putts: number;
  fir: number | "X";
  gir: number;
}

export interface PlayerRounds {
  round: number;
  holes: HoleEntry[];
  partner: string | null;
  partnerHoles: HoleEntry[] | null;
}

export interface Pairing {
  row: number;
  round: number;
  session: string;
  format: string;
  maroonPlayers: string[];
  whitePlayers: string[];
}

export interface RoundState {
  round: number;
  started: boolean;
}

export type ScorekeeperResult<T> = { ok: true } & T | { ok: false; error: string };
```

- [ ] **Step 2: Write the failing test for `lib/scorekeeper/client.ts`**

```typescript
// lib/scorekeeper/client.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.LIVE_FEED_URL = "https://example.com/exec";
process.env.SCOREKEEPER_SERVER_SECRET = "test-secret";

const { getPlayerRounds, submitHoleAsPlayer, getHostData, startRound } = await import("./client.ts");

function mockFetchOnce(response: unknown) {
  (globalThis as { fetch: typeof fetch }).fetch = (async () =>
    new Response(JSON.stringify(response), { status: 200 })) as typeof fetch;
}

test("getPlayerRounds posts playerGetRounds with the server secret and player name, returns ok:true on valid:true", async () => {
  let capturedBody: unknown = null;
  (globalThis as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ valid: true, player: "Kyle Schnabel", rounds: [] }), { status: 200 });
  }) as typeof fetch;

  const result = await getPlayerRounds("Kyle Schnabel");

  assert.deepEqual(capturedBody, {
    type: "playerGetRounds",
    serverSecret: "test-secret",
    player: "Kyle Schnabel",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.rounds, []);
});

test("getPlayerRounds returns ok:false when the backend returns valid:false", async () => {
  mockFetchOnce({ valid: false, error: "Unauthorized." });
  const result = await getPlayerRounds("Kyle Schnabel");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "Unauthorized.");
});

test("getPlayerRounds returns ok:false when the network call throws", async () => {
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const result = await getPlayerRounds("Kyle Schnabel");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Could not reach/);
});

test("submitHoleAsPlayer posts fir/gir as booleans converted from the caller's boolean args", async () => {
  let capturedBody: unknown = null;
  (globalThis as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ saved: true, player: "Kyle Schnabel", round: 1, hole: 4 }), { status: 200 });
  }) as typeof fetch;

  const result = await submitHoleAsPlayer("Kyle Schnabel", 1, "self", 4, 5, 2, true, false);

  assert.deepEqual(capturedBody, {
    type: "playerSubmitHole",
    serverSecret: "test-secret",
    player: "Kyle Schnabel",
    round: 1,
    target: "self",
    hole: 4,
    score: 5,
    putts: 2,
    fir: true,
    gir: false,
  });
  assert.equal(result.ok, true);
});

test("submitHoleAsPlayer returns ok:false on saved:false", async () => {
  mockFetchOnce({ saved: false, error: "This round hasn't been started by the host yet." });
  const result = await submitHoleAsPlayer("Kyle Schnabel", 1, "self", 4, 5, 2, true, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "This round hasn't been started by the host yet.");
});

test("getHostData returns ok:false with a clear message when LIVE_FEED_URL is unset", async () => {
  const prev = process.env.LIVE_FEED_URL;
  delete process.env.LIVE_FEED_URL;
  const result = await getHostData();
  process.env.LIVE_FEED_URL = prev;
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /not configured/);
});

test("startRound posts hostStartRound with round as a number", async () => {
  let capturedBody: unknown = null;
  (globalThis as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true, round: 3 }), { status: 200 });
  }) as typeof fetch;

  await startRound(3);

  assert.deepEqual(capturedBody, { type: "hostStartRound", serverSecret: "test-secret", round: 3 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test lib/scorekeeper/client.test.ts`
Expected: FAIL — `client.ts` does not exist yet.

- [ ] **Step 4: Write `lib/scorekeeper/client.ts`**

```typescript
import type { HoleEntry, Pairing, PlayerRounds, RoundState, ScorekeeperResult } from "./types";

async function callScorekeeper(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = process.env.LIVE_FEED_URL;
  const secret = process.env.SCOREKEEPER_SERVER_SECRET;
  if (!url) throw new Error("not configured");
  if (!secret) throw new Error("not configured");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, serverSecret: secret }),
  });
  if (!res.ok) throw new Error(`Scoring backend responded with ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function safeCall(body: Record<string, unknown>): Promise<Record<string, unknown> | { __error: string }> {
  try {
    return await callScorekeeper(body);
  } catch (err) {
    const message = err instanceof Error && err.message === "not configured" ? "Scoring server is not configured yet." : "Could not reach the scoring system.";
    return { __error: message };
  }
}

export async function getPlayerRounds(player: string): Promise<ScorekeeperResult<{ rounds: PlayerRounds[]; waiting?: string }>> {
  const data = await safeCall({ type: "playerGetRounds", player });
  if ("__error" in data) return { ok: false, error: data.__error };
  if (data.valid !== true) return { ok: false, error: String(data.error ?? "Could not load your rounds.") };
  return { ok: true, rounds: (data.rounds as PlayerRounds[]) ?? [], waiting: typeof data.waiting === "string" ? data.waiting : undefined };
}

export async function submitHoleAsPlayer(
  player: string,
  round: number,
  target: "self" | "partner",
  hole: number,
  score: number,
  putts: number,
  fir: boolean,
  gir: boolean
): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "playerSubmitHole", player, round, target, hole, score, putts, fir, gir });
  if ("__error" in data) return { ok: false, error: data.__error };
  if (data.saved !== true) return { ok: false, error: String(data.error ?? "Could not save that hole.") };
  return { ok: true };
}

export async function getHostData(): Promise<
  ScorekeeperResult<{ roster: { maroon: string[]; white: string[] }; pairings: Pairing[]; roundState: RoundState[] }>
> {
  const data = await safeCall({ type: "hostGetData" });
  if ("__error" in data) return { ok: false, error: data.__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not load host data.") };
  return {
    ok: true,
    roster: (data.roster as { maroon: string[]; white: string[] }) ?? { maroon: [], white: [] },
    pairings: (data.pairings as Pairing[]) ?? [],
    roundState: (data.roundState as RoundState[]) ?? [],
  };
}

export async function getHostPlayerRound(player: string, round: number): Promise<ScorekeeperResult<{ holes: HoleEntry[] }>> {
  const data = await safeCall({ type: "hostGetPlayerRound", player, round });
  if ("__error" in data) return { ok: false, error: data.__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not load that scorecard.") };
  return { ok: true, holes: (data.holes as HoleEntry[]) ?? [] };
}

export async function submitHoleAsHost(
  player: string,
  round: number,
  hole: number,
  score: number,
  putts: number,
  fir: boolean,
  gir: boolean
): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostSubmitHole", player, round, hole, score, putts, fir, gir });
  if ("__error" in data) return { ok: false, error: data.__error };
  if (data.saved !== true) return { ok: false, error: String(data.error ?? "Could not save that hole.") };
  return { ok: true };
}

export async function setPairings(
  round: number,
  session: string,
  format: string,
  maroonPlayers: string[],
  whitePlayers: string[]
): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostSetPairings", round, session, format, maroonPlayers, whitePlayers });
  if ("__error" in data) return { ok: false, error: data.__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not save that pairing.") };
  return { ok: true };
}

export async function deletePairing(row: number): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostDeletePairing", row });
  if ("__error" in data) return { ok: false, error: data.__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not delete that pairing.") };
  return { ok: true };
}

export async function startRound(round: number): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostStartRound", round });
  if ("__error" in data) return { ok: false, error: data.__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not start that round.") };
  return { ok: true };
}

export async function resetRound(round: number): Promise<ScorekeeperResult<Record<string, never>>> {
  const data = await safeCall({ type: "hostResetRound", round });
  if ("__error" in data) return { ok: false, error: data.__error };
  if (data.ok !== true) return { ok: false, error: String(data.error ?? "Could not reset that round.") };
  return { ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test lib/scorekeeper/client.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Add the env var placeholder**

Add to `.env.example` (below the existing Supabase lines):

```
# Shared secret with appscript/write-scores.gs — see appscript/README.md
LIVE_FEED_URL=
SCOREKEEPER_SERVER_SECRET=
```

(Only add `LIVE_FEED_URL=` if it isn't already in `.env.example` — check the file first; it's used today by `/api/live-feed` so it may already be there.)

- [ ] **Step 7: Run the full check and commit**

```bash
npm test
npx tsc --noEmit
npm run lint
```

```bash
git add lib/scorekeeper .env.example
git commit -m "feat(scoring): add scorekeeper client library

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Player scoring API routes

**Files:**
- Create: `lib/portal/requirePlayer.ts`
- Create: `app/api/portal/score/round/route.ts`
- Create: `app/api/portal/score/submit-hole/route.ts`

**Interfaces:**
- Consumes: `getPlayerRounds`, `submitHoleAsPlayer` from `lib/scorekeeper/client.ts` (Task 2); `createSupabaseServerClient` from `lib/supabase/server.ts`; `getPlayerProfileBySlug` from `lib/data/players`
- Produces (consumed by Task 4's UI):
  - `GET /api/portal/score/round` → `{ ok: true; rounds: PlayerRounds[]; waiting?: string } | { ok: false; error: string }` (401 if not signed in / not a player)
  - `POST /api/portal/score/submit-hole` body `{ round: number; target: "self" | "partner"; hole: number; score: number; putts: number; fir: boolean; gir: boolean }` → `{ ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Write `lib/portal/requirePlayer.ts`**

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";

export interface PlayerSession {
  userId: string;
  playerSlug: string;
  playerFullName: string;
}

/**
 * Server-side guard for player-only actions (score entry). Returns null if
 * there's no session, the account isn't linked to a player slot, or the
 * slot doesn't match a known lib/data/players profile — callers should
 * treat null as "respond 401", never fall back to a client-supplied name.
 */
export async function requirePlayer(): Promise<PlayerSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("player_slug").eq("id", user.id).single();
  if (!profile?.player_slug) return null;

  const playerProfile = getPlayerProfileBySlug(profile.player_slug);
  if (!playerProfile) return null;

  return { userId: user.id, playerSlug: profile.player_slug, playerFullName: playerProfile.fullName };
}
```

- [ ] **Step 2: Write `app/api/portal/score/round/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getPlayerRounds } from "@/lib/scorekeeper/client";

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const result = await getPlayerRounds(player.playerFullName);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 3: Write `app/api/portal/score/submit-hole/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { submitHoleAsPlayer } from "@/lib/scorekeeper/client";

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, target, hole, score, putts, fir, gir } = await request.json();
  if (typeof round !== "number" || (target !== "self" && target !== "partner") || typeof hole !== "number" || typeof score !== "number") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const result = await submitHoleAsPlayer(player.playerFullName, round, target, hole, score, Number(putts) || 0, Boolean(fir), Boolean(gir));
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Run the check**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (No automated test here — Route Handlers that depend on `next/headers`/Supabase follow this repo's existing convention of build + manual walkthrough, same as `app/api/portal/admin/unlink/route.ts`; the manual walkthrough happens in Task 4 once there's UI to drive it.)

- [ ] **Step 5: Commit**

```bash
git add lib/portal/requirePlayer.ts app/api/portal/score
git commit -m "feat(scoring): add player scoring API routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Player scoring UI

**Files:**
- Create: `components/portal/ScoreEntryCard.tsx`
- Create: `components/portal/PlayerScoringPanel.tsx`
- Modify: `app/portal/page.tsx` (player branch)

**Interfaces:**
- Consumes: `GET /api/portal/score/round`, `POST /api/portal/score/submit-hole` (Task 3); `HoleEntry`, `PlayerRounds` types (Task 2, re-exported for client use)
- Produces: `<PlayerScoringPanel playerFullName={string} />` — self-contained, no props beyond display name (identity for API calls comes from the session server-side, not props)

- [ ] **Step 1: Write `components/portal/ScoreEntryCard.tsx`**

One player's one round, editable. Reuses the par-3-skips-FIR convention from `writeHoleScore`'s `isPar3` check.

```typescript
"use client";

import { useState } from "react";
import type { HoleEntry } from "@/lib/scorekeeper/types";

export interface ScoreEntryCardProps {
  label: string;
  holes: HoleEntry[];
  onSubmitHole: (hole: number, score: number, putts: number, fir: boolean, gir: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function ScoreEntryCard({ label, holes, onSubmitHole }: ScoreEntryCardProps) {
  const [draft, setDraft] = useState<Record<number, { score: string; putts: string; fir: boolean; gir: boolean }>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  function draftFor(hole: HoleEntry) {
    return draft[hole.hole] ?? { score: hole.score ? String(hole.score) : "", putts: hole.putts ? String(hole.putts) : "", fir: hole.fir === 1, gir: hole.gir === 1 };
  }

  function setField(holeNum: number, hole: HoleEntry, field: "score" | "putts" | "fir" | "gir", value: string | boolean) {
    setDraft((d) => ({ ...d, [holeNum]: { ...draftFor(hole), [field]: value } }));
  }

  async function save(hole: HoleEntry) {
    const d = draftFor(hole);
    const score = Number(d.score);
    if (!score || score < 1) {
      setErrors((e) => ({ ...e, [hole.hole]: "Enter a score first." }));
      return;
    }
    setSaving(hole.hole);
    setErrors((e) => ({ ...e, [hole.hole]: "" }));
    const result = await onSubmitHole(hole.hole, score, Number(d.putts) || 0, d.fir, d.gir);
    setSaving(null);
    if (!result.ok) setErrors((e) => ({ ...e, [hole.hole]: result.error }));
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <h3 className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</h3>
      <div className="mt-3 flex flex-col gap-2">
        {holes.map((hole) => {
          const isPar3 = hole.par === 3;
          const d = draftFor(hole);
          return (
            <div key={hole.hole} className="flex flex-wrap items-center gap-2 border-b border-ink-100 py-2 last:border-b-0">
              <span className="w-16 font-sans text-sm font-semibold text-ink-900">Hole {hole.hole}</span>
              <span className="w-12 font-sans text-xs text-ink-400">Par {hole.par}</span>
              <input
                type="number"
                min={1}
                placeholder="Score"
                value={d.score}
                onChange={(e) => setField(hole.hole, hole, "score", e.target.value)}
                className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
              />
              <input
                type="number"
                min={0}
                placeholder="Putts"
                value={d.putts}
                onChange={(e) => setField(hole.hole, hole, "putts", e.target.value)}
                className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
              />
              {!isPar3 && (
                <label className="flex items-center gap-1 font-sans text-xs text-ink-500">
                  <input type="checkbox" checked={d.fir} onChange={(e) => setField(hole.hole, hole, "fir", e.target.checked)} /> FIR
                </label>
              )}
              <label className="flex items-center gap-1 font-sans text-xs text-ink-500">
                <input type="checkbox" checked={d.gir} onChange={(e) => setField(hole.hole, hole, "gir", e.target.checked)} /> GIR
              </label>
              <button
                type="button"
                disabled={saving === hole.hole}
                onClick={() => save(hole)}
                className="rounded-sm bg-maroon-700 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
              >
                {saving === hole.hole ? "Saving…" : "Save"}
              </button>
              {errors[hole.hole] && <span className="w-full font-sans text-xs text-red-600">{errors[hole.hole]}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `components/portal/PlayerScoringPanel.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { ScoreEntryCard } from "./ScoreEntryCard";
import type { PlayerRounds } from "@/lib/scorekeeper/types";

export function PlayerScoringPanel() {
  const [rounds, setRounds] = useState<PlayerRounds[]>([]);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/portal/score/round", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }
      setRounds(data.rounds);
      setWaiting(data.waiting ?? null);
      setError(null);
    } catch {
      setError("Couldn't reach the scoring system.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  async function submitHole(round: number, target: "self" | "partner", hole: number, score: number, putts: number, fir: boolean, gir: boolean) {
    const res = await fetch("/api/portal/score/submit-hole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round, target, hole, score, putts, fir, gir }),
    });
    const data = await res.json();
    if (data.ok) load();
    return data;
  }

  if (loading) return <p className="font-sans text-sm text-ink-400">Loading your rounds…</p>;
  if (error) return <p className="font-sans text-sm text-red-600">{error}</p>;
  if (waiting) return <p className="font-sans text-sm text-ink-500">{waiting}</p>;
  if (rounds.length === 0) return <p className="font-sans text-sm text-ink-500">No round started yet.</p>;

  return (
    <div className="flex flex-col gap-6">
      {rounds.map((r) => (
        <div key={r.round}>
          <h2 className="font-serif text-lg font-bold text-ink-900">Round {r.round}</h2>
          <div className="mt-3 flex flex-col gap-4">
            <ScoreEntryCard
              label="My Score"
              holes={r.holes}
              onSubmitHole={(hole, score, putts, fir, gir) => submitHole(r.round, "self", hole, score, putts, fir, gir)}
            />
            {r.partner ? (
              <ScoreEntryCard
                label={`${r.partner}'s Score`}
                holes={r.partnerHoles ?? []}
                onSubmitHole={(hole, score, putts, fir, gir) => submitHole(r.round, "partner", hole, score, putts, fir, gir)}
              />
            ) : (
              <p className="font-sans text-sm text-ink-500">No partner assigned for this round yet.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire into `app/portal/page.tsx`**

Replace the player branch's placeholder line. Read the current file first (it was shown fully in the design/exploration phase — the target line is `<p className="font-sans text-sm text-ink-500">Scoring and pairings are coming in a later round.</p>` near the end of the player return block) and:

```typescript
import { PlayerScoringPanel } from "@/components/portal/PlayerScoringPanel";
```

```typescript
      <p className="font-sans text-sm text-ink-500">
        {team ? `Team ${team === "maroon" ? "Maroon" : "White"}` : "Team not yet assigned"} · @{profile.username}
      </p>
      <div className="w-full max-w-[640px] text-left">
        <PlayerScoringPanel />
      </div>
```

(Widen the outer container from `max-w-[480px]` to accommodate the scoring panel if it looks cramped during the manual walkthrough — use judgment during Step 4, this is a visual call not a hard requirement.)

- [ ] **Step 4: Manual walkthrough**

Run `npm run dev`. Sign in as a player account linked to `lib/data/players`. Confirm:
- With no round started (default sandbox state): "No round started yet." shows, no crash.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.

(Full round-trip against a real started round is verified once Task 6's host tools exist to start one — note that as a follow-up manual check after Task 6.)

- [ ] **Step 5: Commit**

```bash
git add components/portal/ScoreEntryCard.tsx components/portal/PlayerScoringPanel.tsx app/portal/page.tsx
git commit -m "feat(scoring): add player scoring UI to /portal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Host API routes

**Files:**
- Create: `lib/portal/requireHost.ts`
- Modify: `app/api/portal/admin/unlink/route.ts` (use the shared helper instead of its local copy)
- Create: `app/api/portal/host/data/route.ts`
- Create: `app/api/portal/host/pairings/route.ts`
- Create: `app/api/portal/host/pairings/delete/route.ts`
- Create: `app/api/portal/host/rounds/start/route.ts`
- Create: `app/api/portal/host/rounds/reset/route.ts`
- Create: `app/api/portal/host/score/route.ts`

**Interfaces:**
- Consumes: `getHostData`, `getHostPlayerRound`, `submitHoleAsHost`, `setPairings`, `deletePairing`, `startRound`, `resetRound` from `lib/scorekeeper/client.ts` (Task 2)
- Produces: `requireHost(): Promise<{ userId: string } | null>`; the routes below, all POST except `data` (GET), all returning the same `ScorekeeperResult` shapes Task 2 defines, 403 body `{ ok: false, error: "Not authorized." }` when `requireHost()` is null

- [ ] **Step 1: Write `lib/portal/requireHost.ts`**

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface HostSession {
  userId: string;
}

/** Server-side guard for host-only actions. Mirrors requirePlayer.ts. */
export async function requireHost(): Promise<HostSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) return null;

  return { userId: user.id };
}
```

- [ ] **Step 2: Refactor `app/api/portal/admin/unlink/route.ts` to use it**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { playerSlug } = await request.json();
  if (!playerSlug) {
    return NextResponse.json({ ok: false, error: "Missing playerSlug." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  // Unlink is a true undo: it also demotes the previously-linked account
  // back to an ordinary account (they stay logged in, they just lose
  // player/Portal access on their next session check). It must not delete
  // the account or touch anything besides player_slug.
  const { data: slot } = await service
    .from("player_slots")
    .select("claimed_by")
    .eq("player_slug", playerSlug)
    .single();

  if (slot?.claimed_by) {
    await service.from("profiles").update({ player_slug: null }).eq("id", slot.claimed_by);
  }

  await service.from("player_slots").update({ claimed_by: null, claimed_at: null }).eq("player_slug", playerSlug);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write `app/api/portal/host/data/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { getHostData } from "@/lib/scorekeeper/client";

export async function GET() {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const result = await getHostData();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 4: Write `app/api/portal/host/pairings/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { setPairings } from "@/lib/scorekeeper/client";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { round, session, format, maroonPlayers, whitePlayers } = await request.json();
  if (typeof round !== "number" || !session || !format || !Array.isArray(maroonPlayers) || !Array.isArray(whitePlayers)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const result = await setPairings(round, session, format, maroonPlayers, whitePlayers);
  return NextResponse.json(result);
}
```

- [ ] **Step 5: Write `app/api/portal/host/pairings/delete/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { deletePairing } from "@/lib/scorekeeper/client";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { row } = await request.json();
  if (typeof row !== "number") {
    return NextResponse.json({ ok: false, error: "Missing row." }, { status: 400 });
  }

  const result = await deletePairing(row);
  return NextResponse.json(result);
}
```

- [ ] **Step 6: Write `app/api/portal/host/rounds/start/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { startRound } from "@/lib/scorekeeper/client";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { round } = await request.json();
  if (typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const result = await startRound(round);
  return NextResponse.json(result);
}
```

- [ ] **Step 7: Write `app/api/portal/host/rounds/reset/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { resetRound } from "@/lib/scorekeeper/client";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { round } = await request.json();
  if (typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const result = await resetRound(round);
  return NextResponse.json(result);
}
```

- [ ] **Step 8: Write `app/api/portal/host/score/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { getHostPlayerRound, submitHoleAsHost } from "@/lib/scorekeeper/client";

export async function GET(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const player = searchParams.get("player");
  const round = Number(searchParams.get("round"));
  if (!player || !round) {
    return NextResponse.json({ ok: false, error: "Missing player or round." }, { status: 400 });
  }

  const result = await getHostPlayerRound(player, round);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { player, round, hole, score, putts, fir, gir } = await request.json();
  if (!player || typeof round !== "number" || typeof hole !== "number" || typeof score !== "number") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const result = await submitHoleAsHost(player, round, hole, score, Number(putts) || 0, Boolean(fir), Boolean(gir));
  return NextResponse.json(result);
}
```

- [ ] **Step 9: Run the check**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/portal/requireHost.ts app/api/portal/admin/unlink/route.ts app/api/portal/host
git commit -m "feat(scoring): add host API routes for pairings, rounds, and score editing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Host tools UI (`/portal/host`)

**Files:**
- Create: `components/portal/host/PairingsPanel.tsx`
- Create: `components/portal/host/RoundsPanel.tsx`
- Create: `components/portal/host/ScoreEditorPanel.tsx`
- Create: `app/portal/host/page.tsx`
- Modify: `app/portal/page.tsx` (host branch — add the link)

**Interfaces:**
- Consumes: `GET/POST /api/portal/host/*` (Task 5); `ScoreEntryCard` (Task 4, reused in "edit any player" mode)
- Produces: `/portal/host` page, redirect-gated the same way `/portal/admin` is

- [ ] **Step 1: Write `components/portal/host/PairingsPanel.tsx`**

```typescript
"use client";

import { useState } from "react";
import type { Pairing } from "@/lib/scorekeeper/types";

export function PairingsPanel({
  roster,
  pairings,
  onChanged,
}: {
  roster: { maroon: string[]; white: string[] };
  pairings: Pairing[];
  onChanged: () => void;
}) {
  const [round, setRound] = useState("1");
  const [session, setSession] = useState("Morning");
  const [format, setFormat] = useState("Fourball");
  const [maroonPicked, setMaroonPicked] = useState<string[]>([]);
  const [whitePicked, setWhitePicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggle(list: string[], setList: (v: string[]) => void, name: string) {
    if (list.includes(name)) {
      setList(list.filter((n) => n !== name));
    } else if (list.length < 2) {
      setList([...list, name]);
    }
  }

  async function submit() {
    setError(null);
    if (maroonPicked.length === 0 || whitePicked.length === 0) {
      setError("Pick at least one player from each team.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/portal/host/pairings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: Number(round), session, format, maroonPlayers: maroonPicked, whitePlayers: whitePicked }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setMaroonPicked([]);
    setWhitePicked([]);
    onChanged();
  }

  async function remove(row: number) {
    await fetch("/api/portal/host/pairings/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row }),
    });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-ink-100 bg-white p-4">
        <h3 className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">New Pairing</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            value={round}
            onChange={(e) => setRound(e.target.value)}
            className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
            placeholder="Round"
          />
          <input value={session} onChange={(e) => setSession(e.target.value)} className="w-28 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm" />
          <input value={format} onChange={(e) => setFormat(e.target.value)} className="w-28 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="font-sans text-xs font-semibold text-maroon-700">Maroon (click order = slot)</p>
            {roster.maroon.map((name) => (
              <label key={name} className="flex items-center gap-1 font-sans text-sm">
                <input type="checkbox" checked={maroonPicked.includes(name)} onChange={() => toggle(maroonPicked, setMaroonPicked, name)} /> {name}
              </label>
            ))}
          </div>
          <div>
            <p className="font-sans text-xs font-semibold text-ink-700">White (click order = slot)</p>
            {roster.white.map((name) => (
              <label key={name} className="flex items-center gap-1 font-sans text-sm">
                <input type="checkbox" checked={whitePicked.includes(name)} onChange={() => toggle(whitePicked, setWhitePicked, name)} /> {name}
              </label>
            ))}
          </div>
        </div>
        {error && <p className="mt-2 font-sans text-xs text-red-600">{error}</p>}
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="mt-3 rounded-sm bg-maroon-700 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add Pairing"}
        </button>
      </div>

      <div className="rounded-md border border-ink-100 bg-white p-4">
        <h3 className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Existing Pairings</h3>
        <table className="mt-3 w-full font-sans text-sm">
          <tbody>
            {pairings.map((p) => (
              <tr key={p.row} className="border-b border-ink-100">
                <td className="py-1">R{p.round}</td>
                <td className="py-1">{p.session}</td>
                <td className="py-1">{p.format}</td>
                <td className="py-1">{p.maroonPlayers.join(" & ")}</td>
                <td className="py-1">{p.whitePlayers.join(" & ")}</td>
                <td className="py-1 text-right">
                  <button type="button" onClick={() => remove(p.row)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `components/portal/host/RoundsPanel.tsx`**

```typescript
"use client";

import { useState } from "react";
import type { RoundState } from "@/lib/scorekeeper/types";

export function RoundsPanel({ roundState, onChanged }: { roundState: RoundState[]; onChanged: () => void }) {
  const [busyRound, setBusyRound] = useState<number | null>(null);
  const rounds = Array.from({ length: 8 }, (_, i) => i + 1);

  function isStarted(round: number) {
    return roundState.find((r) => r.round === round)?.started ?? false;
  }

  async function start(round: number) {
    setBusyRound(round);
    await fetch("/api/portal/host/rounds/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round }),
    });
    setBusyRound(null);
    onChanged();
  }

  async function reset(round: number) {
    if (!confirm(`Reset Round ${round}? This erases every entered score for this round.`)) return;
    setBusyRound(round);
    await fetch("/api/portal/host/rounds/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round }),
    });
    setBusyRound(null);
    onChanged();
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <h3 className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Rounds</h3>
      <div className="mt-3 flex flex-col gap-2">
        {rounds.map((round) => (
          <div key={round} className="flex items-center justify-between border-b border-ink-100 py-2 last:border-b-0">
            <span className="font-sans text-sm font-semibold text-ink-900">
              Round {round} {isStarted(round) ? "— started" : ""}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyRound === round || isStarted(round)}
                onClick={() => start(round)}
                className="rounded-sm bg-maroon-700 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
              >
                Start
              </button>
              <button
                type="button"
                disabled={busyRound === round || !isStarted(round)}
                onClick={() => reset(round)}
                className="rounded-sm border border-ink-200 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-700 disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/portal/host/ScoreEditorPanel.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { ScoreEntryCard } from "@/components/portal/ScoreEntryCard";
import type { HoleEntry } from "@/lib/scorekeeper/types";

export function ScoreEditorPanel({ roster }: { roster: { maroon: string[]; white: string[] } }) {
  const allPlayers = [...roster.maroon, ...roster.white];
  const [player, setPlayer] = useState(allPlayers[0] ?? "");
  const [round, setRound] = useState("1");
  const [holes, setHoles] = useState<HoleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!player || !round) return;
    setError(null);
    const res = await fetch(`/api/portal/host/score?player=${encodeURIComponent(player)}&round=${round}`, { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      setHoles([]);
      return;
    }
    setHoles(data.holes);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, round]);

  async function submitHole(hole: number, score: number, putts: number, fir: boolean, gir: boolean) {
    const res = await fetch("/api/portal/host/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, round: Number(round), hole, score, putts, fir, gir }),
    });
    const data = await res.json();
    if (data.ok) load();
    return data;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={player} onChange={(e) => setPlayer(e.target.value)} className="rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm">
          {allPlayers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={round}
          onChange={(e) => setRound(e.target.value)}
          className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
        />
      </div>
      {error && <p className="font-sans text-xs text-red-600">{error}</p>}
      {holes.length > 0 && <ScoreEntryCard label={`${player} — Round ${round}`} holes={holes} onSubmitHole={submitHole} />}
    </div>
  );
}
```

- [ ] **Step 4: Write `app/portal/host/page.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import type { Pairing, RoundState } from "@/lib/scorekeeper/types";
import { PairingsPanel } from "@/components/portal/host/PairingsPanel";
import { RoundsPanel } from "@/components/portal/host/RoundsPanel";
import { ScoreEditorPanel } from "@/components/portal/host/ScoreEditorPanel";

type Tab = "pairings" | "rounds" | "scores";

export default function PortalHostPage() {
  const [tab, setTab] = useState<Tab>("rounds");
  const [roster, setRoster] = useState<{ maroon: string[]; white: string[] }>({ maroon: [], white: [] });
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [roundState, setRoundState] = useState<RoundState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/portal/host/data", { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }
    setRoster(data.roster);
    setPairings(data.pairings);
    setRoundState(data.roundState);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="mx-auto max-w-[720px] px-4 py-12 font-sans text-sm text-ink-400">Loading…</p>;
  if (error) return <p className="mx-auto max-w-[720px] px-4 py-12 font-sans text-sm text-red-600">{error}</p>;

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Game Controls</h1>
      <div className="mt-4 flex gap-4 border-b border-ink-200">
        {(["rounds", "pairings", "scores"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`pb-2 font-condensed text-xs font-semibold uppercase tracking-wide ${
              tab === t ? "border-b-2 border-maroon-700 text-maroon-700" : "text-ink-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "rounds" && <RoundsPanel roundState={roundState} onChanged={load} />}
        {tab === "pairings" && <PairingsPanel roster={roster} pairings={pairings} onChanged={load} />}
        {tab === "scores" && <ScoreEditorPanel roster={roster} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the link from `app/portal/page.tsx`'s host branch**

In the `if (profile.is_host)` block, add a second link next to "Manage Player Usernames":

```typescript
        <Link
          href="/portal/host"
          className="mt-2 font-sans text-sm font-semibold text-maroon-700 underline underline-offset-2"
        >
          Game Controls
        </Link>
        <Link
          href="/portal/admin"
          className="mt-2 font-sans text-sm font-semibold text-maroon-700 underline underline-offset-2"
        >
          Manage Player Usernames
        </Link>
```

- [ ] **Step 6: Full manual walkthrough (this is the end-to-end test for Tasks 3–6 together)**

Run `npm run dev` against a Sheet with the Task 1 changes deployed (sandbox, not the live trip sheet) and `SCOREKEEPER_SERVER_SECRET`/`LIVE_FEED_URL` set locally:
1. Sign in as Tiger → `/portal` → "Game Controls" → `/portal/host`.
2. Rounds tab: Start Round 1 (button disables once started).
3. Pairings tab: add a pairing for Round 1 with two real players from each team; confirm it appears in the list; delete it and re-add to confirm delete works.
4. Scores tab: pick a player + Round 1, enter a score/putts/FIR/GIR for hole 1, Save; confirm no error and the value persists on reload.
5. Sign out, sign in as one of the two players in that pairing → `/portal` → confirm "My Score" shows the hole 1 entry made by the host, and "[Partner]'s Score" tab shows the partner's (likely empty) card.
6. As the player, submit hole 2 for "My Score" and hole 1 for "[Partner]'s Score"; confirm both save.
7. Back as Tiger, confirm the Scores tab reflects the player's own entries too (same Sheet, same read path).
8. Confirm `/leaderboard` (public site) picks up the entries once a live feed is configured against the same sandbox Sheet.
9. `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.

- [ ] **Step 7: Commit**

```bash
git add components/portal/host app/portal/host app/portal/page.tsx
git commit -m "feat(scoring): add /portal/host game-control tools

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Docs and final verification

**Files:**
- Modify: `project_specs.md`

**Interfaces:**
- None (documentation only)

- [ ] **Step 1: Update `project_specs.md`**

Move the current "This round's work" content into "Previously shipped rounds" (following the pattern already used for the accounts-foundation round), and set a new "This round's work" describing what was just built. Read the current file first, then apply:

```markdown
## Previously shipped rounds

... (existing bullets, unchanged) ...
- Kalshi-style layout redesign of the Wagers section — nav bar with
  back-button stack, 5 category pages (Team Futures, Player Futures, Matches,
  Fourballs, Props), a My Portfolio page, an entry loading splash, and an
  "MM Coins / Real Wagers" toggle (Real Wagers shows "Coming soon" — the real
  system is being built separately, see
  `docs/superpowers/specs/2026-08-05-wagers-phase3-real-money-design.md`).
  Visual/routing only — no changes to odds math, wallet, or wager placement
  logic. See `docs/superpowers/specs/2026-08-05-wagers-layout-redesign-design.md`.
- Live scoring platform: hole-by-hole player score entry (self + round
  partner) and Tiger's `/portal/host` game controls (pairings, round
  start/reset, direct score editing) — see
  `docs/superpowers/specs/2026-08-14-live-scoring-platform-design.md`. The
  old scorekeeper app's player-code and separate host-password auth are
  removed from `appscript/write-scores.gs`; both player and host identity
  now come from the same Supabase login used everywhere else on the site,
  bridged to the Sheet backend by one shared server secret. Shipped in
  code and passing `npm test`/`npx tsc --noEmit`/`npm run lint`/
  `npm run build`; a manual QA pass against a sandbox copy of the real
  Google Sheet (per Task 1's checklist in the implementation plan) is the
  one remaining step before this is used on the live 2027 trip.

## This round's work

(describe whatever comes next once assigned — leave this section for the
next task if none is defined yet)

## Out of scope for this round

N/A until the next round is scoped.
```

Adjust exact wording/placement to fit however the file has evolved by the time this task runs — the content above is what must be present, not necessarily verbatim boilerplate around it.

- [ ] **Step 2: Full verification suite**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all four clean. Also confirm Task 1's manual Apps Script checklist was actually run and passed (not just written) — this is the task the whole round hinges on, since it's the one piece with no automated coverage.

- [ ] **Step 3: Commit**

```bash
git add project_specs.md
git commit -m "docs: record live scoring platform round in project_specs.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
