# Native Live Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Supabase schema and the pure TypeScript scoring/orchestration logic that the whole native live platform is built on — no UI, no routes, no Realtime wiring yet. Just a tested data layer that can hold a live tournament's state and answer "what's the leaderboard," "is this match live," and "what's the match score" correctly.

**Architecture:** Four new Supabase tables hold live-tournament data, keyed by `player_slug` (the site's existing canonical player identifier — not the bare first-name key MM-Scorekeeper's Python backend used, which is exactly the class of bug that bit Phase 1). Two new TypeScript modules (`lib/live/scoring.ts`, `lib/live/orchestration.ts`) port MM-Scorekeeper's `scoring.py`/`orchestration.py` rules faithfully — same math, same state-transition logic, translated to TypeScript, operating on plain in-memory data (no DB calls inside these functions, mirroring how the Python originals work). A later phase wires these to real Supabase reads/writes and Realtime; this phase only proves the rules themselves are right, with tests translated from the Python test suite.

**Tech Stack:** Supabase Postgres (SQL migration in `supabase/schema.sql`), TypeScript, `node:test` via `tsx` (matching `lib/**/*.test.ts` convention already in this repo).

**Spec:** `docs/superpowers/specs/2026-08-28-native-live-platform-design.md`, `docs/superpowers/specs/2026-08-28-site-plan-design.md`

## Global Constraints

- No routes, no UI, no Realtime subscriptions in this phase — pure schema + pure logic only. Wiring comes in a later phase's plan.
- Every live-tournament table keys players by `player_slug` (references `player_slots(player_slug)`), never a bare first name or full name — this is a deliberate fix versus MM-Scorekeeper's original design, not an oversight.
- `lib/live/scoring.ts` and `lib/live/orchestration.ts` functions take plain data as arguments and return plain data — no Supabase client, no I/O, inside either file. This matches Python's `scoring.py`/`orchestration.py`, which only ever operate on an in-memory `Tournament` object.
- Match `supabase/schema.sql`'s existing house style exactly: lowercase snake_case, `create table if not exists`, RLS enabled on every new table with policy comments explaining the access rule, safe to re-run.
- `ScoringCode`/scoring-codes are NOT ported — they existed only to support MM-Scorekeeper's old code-based player access, which Supabase auth already replaces (a player's session *is* their identity now, no per-slot access code needed).
- Run `npm test && npx tsc --noEmit && npm run lint && npm run build` clean before considering any task done.

---

### Task 1: Supabase schema for live tournament data

**Files:**
- Modify: `supabase/schema.sql` (append — do not touch anything above the MM Coins section)

**Interfaces:**
- Produces (consumed by Task 2's types): four tables —
  - `live_courses(id uuid pk, name text, holes jsonb, created_at)` — `holes` is a JSON array of `{"number": int, "par": int, "yards": int}`.
  - `live_match_boxes(id uuid pk, tournament_year int, day int, session text, box_number int, format text, tee_time timestamptz, maroon_players text[], white_players text[], state text, started boolean, created_at)`.
  - `live_hole_scores(id uuid pk, player_slug text fk -> player_slots, round int, hole int, score int, putts int, fir boolean, gir boolean, host_edited boolean, confirmed_by text fk -> player_slots nullable, updated_at)`, unique on `(player_slug, round, hole)`.
  - `live_round_state(round int pk, started boolean, course_id uuid fk -> live_courses nullable)`.

- [ ] **Step 1: Append the schema**

Add this to the end of `supabase/schema.sql`:

```sql
-- === Native Live Platform ================================================
-- Live tournament data (current/upcoming year only — past years stay as
-- static lib/data/*.ts files, never written here). Every player reference
-- uses player_slug, the same canonical identifier profiles/player_slots
-- already use — never a bare first name.

create table if not exists live_courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holes jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists live_match_boxes (
  id uuid primary key default gen_random_uuid(),
  tournament_year integer not null,
  day integer not null check (day between 1 and 4),
  session text not null check (session in ('Morning', 'Afternoon')),
  box_number integer not null check (box_number between 1 and 3),
  format text not null check (format in ('Fourball', 'Scramble', 'Alternate Shot', 'Singles')),
  tee_time timestamptz not null,
  maroon_players text[] not null,
  white_players text[] not null,
  state text not null default 'Scheduled' check (state in ('Scheduled', 'Armed', 'Live', 'Final')),
  started boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists live_match_boxes_year_day_session_idx on live_match_boxes (tournament_year, day, session);

create table if not exists live_hole_scores (
  id uuid primary key default gen_random_uuid(),
  player_slug text not null references player_slots(player_slug),
  round integer not null,
  hole integer not null check (hole between 1 and 18),
  score integer,
  putts integer,
  fir boolean,
  gir boolean,
  host_edited boolean not null default false,
  -- Set once the player's round partner confirms this entry matches their
  -- own count. Null means "entered, not yet confirmed" — the confirmation
  -- flow itself is a later phase, this column just makes room for it now.
  confirmed_by text references player_slots(player_slug),
  updated_at timestamptz not null default now(),
  unique (player_slug, round, hole)
);
create index if not exists live_hole_scores_round_idx on live_hole_scores (round);

create table if not exists live_round_state (
  round integer primary key,
  started boolean not null default false,
  course_id uuid references live_courses(id)
);

alter table live_courses enable row level security;
alter table live_match_boxes enable row level security;
alter table live_hole_scores enable row level security;
alter table live_round_state enable row level security;

-- All four are readable by any signed-in user (players and fans alike see
-- live tournament state) — nothing here is sensitive. Writes happen
-- server-side with the service-role key (bypasses RLS), same pattern as
-- profiles — there is deliberately no insert/update policy on any of these.
drop policy if exists live_courses_select_all on live_courses;
create policy live_courses_select_all on live_courses for select using (auth.uid() is not null);

drop policy if exists live_match_boxes_select_all on live_match_boxes;
create policy live_match_boxes_select_all on live_match_boxes for select using (auth.uid() is not null);

drop policy if exists live_hole_scores_select_all on live_hole_scores;
create policy live_hole_scores_select_all on live_hole_scores for select using (auth.uid() is not null);

drop policy if exists live_round_state_select_all on live_round_state;
create policy live_round_state_select_all on live_round_state for select using (auth.uid() is not null);
```

- [ ] **Step 2: Run it against your Supabase project**

Open the Supabase SQL Editor (Dashboard → SQL Editor → New query), paste the
whole file (or just the new section if you've already run the rest), click
**Run**. Confirm no errors and that `live_courses`, `live_match_boxes`,
`live_hole_scores`, `live_round_state` appear in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(live): add Supabase schema for native live tournament data"
```

---

### Task 2: TypeScript types for live tournament data

**Files:**
- Create: `lib/live/types.ts`

**Interfaces:**
- Produces (consumed by Tasks 3 and 4): `Team`, `Session`, `MatchFormat`, `MatchState` (string union types matching the schema's `check` constraints exactly), `LiveHole`, `LiveCourse`, `LiveHoleScore`, `LiveMatchBox`, `LiveRoundState`, and `LiveTournamentSnapshot` — the in-memory shape Tasks 3/4's functions operate on (mirrors Python's `Tournament` dataclass, trimmed to what this phase needs).

- [ ] **Step 1: Write the file**

```typescript
// lib/live/types.ts
export type Team = "maroon" | "white";
export type Session = "Morning" | "Afternoon";
export type MatchFormat = "Fourball" | "Scramble" | "Alternate Shot" | "Singles";
export type MatchState = "Scheduled" | "Armed" | "Live" | "Final";

export interface LiveHole {
  number: number;
  par: number;
  yards: number;
}

export interface LiveCourse {
  id: string;
  name: string;
  holes: LiveHole[];
}

export interface LiveHoleScore {
  player: string; // player_slug
  round: number;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  hostEdited: boolean;
}

export interface LiveMatchBox {
  id: string | null;
  tournamentYear: number;
  day: number;
  session: Session;
  boxNumber: number;
  format: MatchFormat;
  teeTime: Date;
  maroonPlayers: string[]; // player_slug[]
  whitePlayers: string[]; // player_slug[]
  state: MatchState;
  started: boolean;
}

export interface LiveRoundState {
  round: number;
  started: boolean;
  courseId: string | null;
}

/**
 * The in-memory shape scoring.ts/orchestration.ts operate on — mirrors
 * Python's Tournament dataclass, trimmed to what this phase needs. Building
 * one of these from real Supabase rows is a later phase's job (this phase
 * only proves the rules that operate on it are correct).
 */
export interface LiveTournamentSnapshot {
  players: Record<string, { team: Team }>; // keyed by player_slug
  courses: Record<string, LiveCourse>; // keyed by course id
  roundCourses: Record<number, string>; // round -> course id
  scores: Map<string, LiveHoleScore>; // keyed by `${player}:${round}:${hole}`
  matchBoxes: LiveMatchBox[];
}

export function scoreKey(player: string, round: number, hole: number): string {
  return `${player}:${round}:${hole}`;
}

export function scoreFor(snapshot: LiveTournamentSnapshot, player: string, round: number, hole: number): LiveHoleScore {
  const key = scoreKey(player, round, hole);
  const existing = snapshot.scores.get(key);
  if (existing) return existing;
  const blank: LiveHoleScore = { player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false };
  snapshot.scores.set(key, blank);
  return blank;
}

export function courseForRound(snapshot: LiveTournamentSnapshot, round: number): LiveCourse | null {
  const courseId = snapshot.roundCourses[round];
  if (courseId && snapshot.courses[courseId]) return snapshot.courses[courseId];
  const first = Object.values(snapshot.courses)[0];
  return first ?? null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no test to run yet — this file is pure types + two small
helpers exercised indirectly by Tasks 3/4's tests).

- [ ] **Step 3: Commit**

```bash
git add lib/live/types.ts
git commit -m "feat(live): add TypeScript types for live tournament data"
```

---

### Task 3: Scoring logic port

**Files:**
- Create: `lib/live/scoring.ts`
- Test: `lib/live/scoring.test.ts`

**Interfaces:**
- Consumes: everything from `lib/live/types.ts` (Task 2).
- Produces (consumed by Task 4 and later phases): `normalizeBool`,
  `updateScore`, `playerRoundScores`, `summarizePlayer` (returns a
  `PlayerSummary`), `leaderboard`, `teamTotals`.

- [ ] **Step 1: Write the failing tests**

These translate `backend/tests/test_scoring.py` faithfully, using the same
seed course MM-Scorekeeper's tests use (`seed_2027.py`'s `COURSE` — hole 1 is
par 4, hole 4 is par 3):

```typescript
// lib/live/scoring.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LiveTournamentSnapshot } from "./types.ts";
import { leaderboard, summarizePlayer, updateScore } from "./scoring.ts";

const SEED_HOLES = [
  { number: 1, par: 4, yards: 388 },
  { number: 2, par: 4, yards: 355 },
  { number: 3, par: 4, yards: 382 },
  { number: 4, par: 3, yards: 162 },
  { number: 5, par: 5, yards: 517 },
];

function seedSnapshot(): LiveTournamentSnapshot {
  return {
    players: { cade: { team: "maroon" }, cam: { team: "white" } },
    courses: { c1: { id: "c1", name: "2027 Maroon Masters", holes: SEED_HOLES } },
    roundCourses: { 1: "c1" },
    scores: new Map(),
    matchBoxes: [],
  };
}

test("leaderboard uses score minus par", () => {
  const snapshot = seedSnapshot();
  updateScore(snapshot, "cade", 1, 1, 3, 1, true, true);
  updateScore(snapshot, "cam", 1, 1, 5, 2, false, false);

  const leaders = leaderboard(snapshot);

  assert.equal(leaders[0].player, "cade");
  assert.equal(leaders[0].toPar, -1);
  assert.equal(leaders[leaders.length - 1].player, "cam");
  assert.equal(leaders[leaders.length - 1].toPar, 1);
});

test("par-three FIR is not counted", () => {
  const snapshot = seedSnapshot();
  updateScore(snapshot, "cade", 1, 4, 3, 2, true, true);

  const summary = summarizePlayer(snapshot, "cade");

  assert.equal(summary.firTotal, 0);
  assert.equal(summary.girTotal, 1);
  assert.equal(summary.girHit, 1);
});

test("updateScore is idempotent per player/round/hole", () => {
  const snapshot = seedSnapshot();
  updateScore(snapshot, "cade", 1, 1, 5, 2, true, true);
  updateScore(snapshot, "cade", 1, 1, 3, 1, true, true);

  const summary = summarizePlayer(snapshot, "cade");

  assert.equal(summary.gross, 3, "second call for the same hole should overwrite, not add a second entry");
});

test("summarizePlayer throws for an unknown player", () => {
  const snapshot = seedSnapshot();
  assert.throws(() => summarizePlayer(snapshot, "nobody"), /Unknown player/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- lib/live/scoring.test.ts`
Expected: FAIL (`Cannot find module './scoring.ts'`)

- [ ] **Step 3: Write the implementation**

Faithful port of `backend/maroon_masters/scoring.py`:

```typescript
// lib/live/scoring.ts
import { courseForRound, scoreFor, type LiveHoleScore, type LiveTournamentSnapshot, type Team } from "./types.ts";

export interface PlayerSummary {
  player: string;
  team: Team;
  gross: number;
  par: number;
  toPar: number;
  played: number;
  putts: number;
  firHit: number;
  firTotal: number;
  girHit: number;
  girTotal: number;
  birdieOrBetter: number;
  doubleOrWorse: number;
}

function holeByNumber(holes: { number: number; par: number; yards: number }[]): Map<number, { number: number; par: number; yards: number }> {
  return new Map(holes.map((hole) => [hole.number, hole]));
}

export function normalizeBool(value: boolean | number | string | null | undefined): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const text = String(value).trim().toLowerCase();
  if (text === "x" || text === "na" || text === "n/a") return null;
  return text === "1" || text === "true" || text === "yes" || text === "y";
}

export function updateScore(
  snapshot: LiveTournamentSnapshot,
  player: string,
  round: number,
  hole: number,
  score: number,
  putts: number,
  fir: boolean | number | string | null | undefined,
  gir: boolean | number | string | null | undefined
): LiveHoleScore {
  const course = courseForRound(snapshot, round);
  const holeInfo = course ? holeByNumber(course.holes).get(hole) : undefined;
  const entry = scoreFor(snapshot, player, round, hole);
  entry.score = score;
  entry.putts = putts;
  entry.fir = holeInfo?.par === 3 ? null : normalizeBool(fir);
  entry.gir = normalizeBool(gir) ?? false;
  return entry;
}

export function playerRoundScores(snapshot: LiveTournamentSnapshot, player: string, round: number): LiveHoleScore[] {
  const course = courseForRound(snapshot, round);
  if (!course) return [];
  return course.holes.map((hole) => scoreFor(snapshot, player, round, hole.number));
}

export function summarizePlayer(snapshot: LiveTournamentSnapshot, player: string, rounds?: number[]): PlayerSummary {
  const playerInfo = snapshot.players[player];
  if (!playerInfo) throw new Error(`Unknown player: ${player}`);

  const roundFilter = rounds ? new Set(rounds) : null;
  const played: LiveHoleScore[] = [];
  for (const score of snapshot.scores.values()) {
    if (score.player !== player) continue;
    if (score.score === null || score.score <= 0) continue;
    if (roundFilter && !roundFilter.has(score.round)) continue;
    played.push(score);
  }

  const parFor = (score: LiveHoleScore): number => {
    const course = courseForRound(snapshot, score.round);
    const holeInfo = course ? holeByNumber(course.holes).get(score.hole) : undefined;
    return holeInfo?.par ?? 0;
  };

  const gross = played.reduce((sum, score) => sum + (score.score ?? 0), 0);
  const par = played.reduce((sum, score) => sum + parFor(score), 0);
  const putts = played.reduce((sum, score) => sum + (score.putts ?? 0), 0);
  const firScores = played.filter((score) => parFor(score) !== 3);
  const girScores = played;

  return {
    player,
    team: playerInfo.team,
    gross,
    par,
    toPar: gross - par,
    played: played.length,
    putts,
    firHit: firScores.filter((score) => score.fir === true).length,
    firTotal: firScores.length,
    girHit: girScores.filter((score) => score.gir === true).length,
    girTotal: girScores.length,
    birdieOrBetter: played.filter((score) => (score.score ?? 0) <= parFor(score) - 1).length,
    doubleOrWorse: played.filter((score) => (score.score ?? 0) >= parFor(score) + 2).length,
  };
}

export function leaderboard(snapshot: LiveTournamentSnapshot, rounds?: number[]): PlayerSummary[] {
  const summaries = Object.keys(snapshot.players).map((player) => summarizePlayer(snapshot, player, rounds));
  return summaries.sort((a, b) => a.toPar - b.toPar || b.played - a.played || a.gross - b.gross || a.player.localeCompare(b.player));
}

export function teamTotals(snapshot: LiveTournamentSnapshot): Record<Team, number> {
  const totals: Record<Team, number> = { maroon: 0, white: 0 };
  for (const summary of leaderboard(snapshot)) {
    totals[summary.team] += summary.toPar;
  }
  return totals;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- lib/live/scoring.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add lib/live/scoring.ts lib/live/scoring.test.ts
git commit -m "feat(live): port scoring.py to TypeScript"
```

---

### Task 4: Orchestration logic port

**Files:**
- Create: `lib/live/orchestration.ts`
- Test: `lib/live/orchestration.test.ts`

**Interfaces:**
- Consumes: `lib/live/types.ts` (Task 2), `updateScore` from `lib/live/scoring.ts` (Task 3, test-only).
- Produces (consumed by later phases): `roundForSession`, `validateMatchBox`,
  `sessionIsComplete`, `effectiveMatchState`, `matchBoxStartedThru`,
  `thruLabel`, `holeComplete`, `matchBoxResult`, `matchBoxPayload`.

- [ ] **Step 1: Write the failing tests**

Translated from `backend/tests/test_orchestration.py`:

```typescript
// lib/live/orchestration.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LiveMatchBox, LiveTournamentSnapshot } from "./types.ts";
import { updateScore } from "./scoring.ts";
import { effectiveMatchState, sessionIsComplete, thruLabel } from "./orchestration.ts";

const SEED_HOLES = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: i === 3 || i === 5 || i === 12 ? 3 : i === 4 || i === 7 || i === 13 || i === 17 ? 5 : 4, yards: 400 }));

function seedSnapshot(): LiveTournamentSnapshot {
  return {
    players: Object.fromEntries(
      ["cam", "drew", "cade", "collin", "hugo", "luke", "dalton", "jackson", "nate", "pete", "kyle", "quez"].map((p, i) => [
        p,
        { team: i % 2 === 0 ? "maroon" : "white" },
      ])
    ),
    courses: { c1: { id: "c1", name: "2027 Maroon Masters", holes: SEED_HOLES } },
    roundCourses: { 1: "c1" },
    scores: new Map(),
    matchBoxes: [],
  };
}

function box(day: number, boxNumber: number, maroon: string[], white: string[]): LiveMatchBox {
  return {
    id: null,
    tournamentYear: 2027,
    day,
    session: "Morning",
    boxNumber,
    format: "Fourball",
    teeTime: new Date("2027-01-06T09:30:00-06:00"),
    maroonPlayers: maroon,
    whitePlayers: white,
    state: "Scheduled",
    started: false,
  };
}

test("session complete requires three boxes and all twelve players", () => {
  const snapshot = seedSnapshot();
  snapshot.matchBoxes = [
    box(1, 1, ["cam", "drew"], ["cade", "collin"]),
    box(1, 2, ["hugo", "luke"], ["dalton", "jackson"]),
    box(1, 3, ["nate", "pete"], ["kyle", "quez"]),
  ];

  assert.equal(sessionIsComplete(snapshot, 1, "Morning"), true);
});

test("match state moves from scheduled to armed to live", () => {
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);

  assert.equal(effectiveMatchState(matchBox, new Date("2027-01-06T10:00:00-06:00")), "Scheduled");

  matchBox.started = true;
  assert.equal(effectiveMatchState(matchBox, new Date("2027-01-06T09:00:00-06:00")), "Armed");
  assert.equal(effectiveMatchState(matchBox, new Date("2027-01-06T09:30:00-06:00")), "Live");
});

test("thru label never displays Thru 18", () => {
  const snapshot = seedSnapshot();
  const matchBox = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  matchBox.started = true;
  const round = 1;
  const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];

  assert.equal(thruLabel(snapshot, matchBox), "Thru");

  for (const player of players) updateScore(snapshot, player, round, 1, 4, 2, true, true);
  assert.equal(thruLabel(snapshot, matchBox), "Thru 1");

  for (let hole = 2; hole <= 18; hole++) {
    for (const player of players) updateScore(snapshot, player, round, hole, 4, 2, true, true);
  }
  assert.equal(thruLabel(snapshot, matchBox), "Final");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- lib/live/orchestration.test.ts`
Expected: FAIL (`Cannot find module './orchestration.ts'`)

- [ ] **Step 3: Write the implementation**

Faithful port of `backend/maroon_masters/orchestration.py`. `MATCH_BOXES_PER_SESSION`
and `SESSION_PLAYER_COUNT` are the same constants (3 and 12); `ScoringCode`/
`generateMatchCodes` are deliberately not ported (see Global Constraints).

```typescript
// lib/live/orchestration.ts
import { scoreFor, type LiveMatchBox, type LiveTournamentSnapshot, type MatchState, type Session, type Team } from "./types.ts";

const MATCH_BOXES_PER_SESSION = 3;
const SESSION_PLAYER_COUNT = 12;

export function roundForSession(day: number, session: Session): number {
  return (day - 1) * 2 + (session === "Morning" ? 1 : 2);
}

export function matchBoxRound(matchBox: LiveMatchBox): number {
  return roundForSession(matchBox.day, matchBox.session);
}

export function validateMatchBox(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): string[] {
  const errors: string[] = [];
  if (matchBox.day < 1 || matchBox.day > 4) errors.push("Day must be between 1 and 4.");
  if (matchBox.boxNumber < 1 || matchBox.boxNumber > MATCH_BOXES_PER_SESSION) errors.push("Match box must be 1, 2, or 3.");
  if (matchBox.maroonPlayers.length !== 2) errors.push("Pick exactly two Maroon players.");
  if (matchBox.whitePlayers.length !== 2) errors.push("Pick exactly two White players.");

  for (const player of matchBox.maroonPlayers) {
    if (snapshot.players[player]?.team !== "maroon") errors.push(`${player} is not on Team Maroon.`);
  }
  for (const player of matchBox.whitePlayers) {
    if (snapshot.players[player]?.team !== "white") errors.push(`${player} is not on Team White.`);
  }

  const sessionBoxes = snapshot.matchBoxes.filter(
    (box) => box.day === matchBox.day && box.session === matchBox.session && box.boxNumber !== matchBox.boxNumber
  );
  const used = new Set(sessionBoxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]));
  const duplicates = [...matchBox.maroonPlayers, ...matchBox.whitePlayers].filter((player) => used.has(player));
  if (duplicates.length > 0) errors.push(`Players already assigned in this session: ${[...new Set(duplicates)].sort().join(", ")}.`);

  return errors;
}

export function sessionIsComplete(snapshot: LiveTournamentSnapshot, day: number, session: Session): boolean {
  const boxes = snapshot.matchBoxes.filter((box) => box.day === day && box.session === session);
  if (boxes.length !== MATCH_BOXES_PER_SESSION) return false;
  const players = boxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]);
  return players.length === SESSION_PLAYER_COUNT && new Set(players).size === SESSION_PLAYER_COUNT;
}

export function effectiveMatchState(matchBox: LiveMatchBox, now?: Date, snapshotForThru?: LiveTournamentSnapshot): MatchState {
  if (matchBox.state === "Final") return "Final";
  if (snapshotForThru && matchBoxStartedThru(snapshotForThru, matchBox) === 18) return "Final";
  if (!matchBox.started) return "Scheduled";

  const current = now ?? new Date();
  return current >= matchBox.teeTime ? "Live" : "Armed";
}

export function matchBoxStartedThru(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): number {
  let completed = 0;
  for (let hole = 1; hole <= 18; hole++) {
    if (!holeComplete(snapshot, matchBox, hole)) break;
    completed = hole;
  }
  return completed;
}

export function thruLabel(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): string {
  const thru = matchBoxStartedThru(snapshot, matchBox);
  if (thru === 0) return "Thru";
  if (thru >= 18) return "Final";
  return `Thru ${thru}`;
}

export function holeComplete(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox, hole: number): boolean {
  if (matchBox.format === "Alternate Shot") return false;
  const round = matchBoxRound(matchBox);
  const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];
  return players.every((player) => {
    const score = scoreFor(snapshot, player, round, hole);
    return score.score !== null && score.score > 0;
  });
}

export interface MatchBoxResult {
  maroonPts: number;
  whitePts: number;
  leader: Team | "tie";
  margin: number;
  holesRemaining: number;
}

export function matchBoxResult(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): MatchBoxResult {
  if (matchBox.format === "Alternate Shot") {
    return { maroonPts: 0, whitePts: 0, leader: "tie", margin: 0, holesRemaining: 18 };
  }

  const round = matchBoxRound(matchBox);
  let maroonHoles = 0;
  let whiteHoles = 0;
  let completed = 0;

  for (let hole = 1; hole <= 18; hole++) {
    if (!holeComplete(snapshot, matchBox, hole)) break;
    completed = hole;
    const maroonBest = Math.min(...matchBox.maroonPlayers.map((player) => scoreFor(snapshot, player, round, hole).score ?? 0));
    const whiteBest = Math.min(...matchBox.whitePlayers.map((player) => scoreFor(snapshot, player, round, hole).score ?? 0));
    if (maroonBest < whiteBest) maroonHoles++;
    else if (whiteBest < maroonBest) whiteHoles++;
  }

  const holesRemaining = 18 - completed;
  const margin = Math.abs(maroonHoles - whiteHoles);
  const leader: Team | "tie" = maroonHoles > whiteHoles ? "maroon" : whiteHoles > maroonHoles ? "white" : "tie";

  const matchClosed = completed === 18 || margin > holesRemaining;
  let maroonPts = 0;
  let whitePts = 0;
  if (matchClosed) {
    if (maroonHoles > whiteHoles) maroonPts = 1;
    else if (whiteHoles > maroonHoles) whitePts = 1;
    else {
      maroonPts = 0.5;
      whitePts = 0.5;
    }
  }

  return { maroonPts, whitePts, leader, margin, holesRemaining };
}

export function matchBoxPayload(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox, now?: Date): Record<string, unknown> {
  const state = effectiveMatchState(matchBox, now, snapshot);
  const result = matchBoxResult(snapshot, matchBox);
  return {
    id: matchBox.id,
    year: matchBox.tournamentYear,
    day: matchBox.day,
    round: matchBoxRound(matchBox),
    session: matchBox.session,
    boxNumber: matchBox.boxNumber,
    format: matchBox.format,
    teeTime: matchBox.teeTime.toISOString(),
    state,
    thru: state === "Scheduled" ? "" : thruLabel(snapshot, matchBox),
    maroonPlayers: matchBox.maroonPlayers,
    whitePlayers: matchBox.whitePlayers,
    ...result,
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- lib/live/orchestration.test.ts`
Expected: 3 passed

- [ ] **Step 5: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add lib/live/orchestration.ts lib/live/orchestration.test.ts
git commit -m "feat(live): port orchestration.py to TypeScript"
```

---

## Definition of done for this phase

- `live_courses`, `live_match_boxes`, `live_hole_scores`, `live_round_state`
  exist in Supabase, RLS-enabled, keyed by `player_slug` throughout.
- `lib/live/types.ts`, `lib/live/scoring.ts`, `lib/live/orchestration.ts`
  exist, fully tested, with behavior verified against the same test cases
  MM-Scorekeeper's Python originals used.
- `npm test && npx tsc --noEmit && npm run lint && npm run build` all clean.
- Nothing user-facing changed — no routes, no pages, no Realtime — this is
  the foundation the next phase (Tiger Center: Pairings & Rounds, per the
  site plan's suggested build order) builds the first real screen on top of.
