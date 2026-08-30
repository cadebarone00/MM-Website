# Tiger Center Matchups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Tiger Center's third control, **Matchups** — for each round
whose course/format is locked, assign real players into match boxes (2
Maroon + 2 White per box for Fourball/Foursome, 1-vs-1 for Singles) with tee
times, and lock/unlock that round's Matchups independently of its
Courses & Format lock. Edit Scores and the live round cycle (Start Round,
player scoring, official settlement) are a separate later plan per the
spec's phasing.

**Architecture:** Extends `lib/live/` with a round-based match box model
(see "Schema decision" below), following the exact host-only Route Handler
pattern the Courses & Format phase established
(`requireHost`/`createSupabaseServiceRoleClient`). No Realtime subscriptions
in this phase — same reasoning as the last plan: these are Tiger-only setup
screens, not something that needs to be instant-live for other viewers yet.

**Tech Stack:** Next.js 16 App Router (Route Handlers, Server Components),
TypeScript, Supabase (`@supabase/ssr`), `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-29-tiger-center-operations-design.md`
(see "Matchups" and "Terminology" sections), `docs/superpowers/specs/2026-08-28-native-live-platform-design.md`

## Schema decision (resolved before writing this plan)

The shipped `live_match_boxes` table (from the native-live-platform build)
is keyed on a 4-day x 2-session x 3-box grid ported from MM-Scorekeeper's
original Python model — `day between 1 and 4`, `session in ('Morning',
'Afternoon')`, `box_number between 1 and 3`. That grid cannot represent the
Tiger Center Operations spec's flexible model, which Courses & Format
already ships: a flat `round_count` of 6-10 (`live_round_state.round`, no
day/session pairing), and Singles format needs 6 match boxes (12 players / 2
per box), not 3. Confirmed resolution: **migrate `live_match_boxes` onto the
flat round model** — add a `round` column referencing `live_round_state`,
drop `day`/`session`/`tournament_year`, and raise the `box_number` cap to 6.
Task 1 below is that migration.

## Global Constraints

- Every Route Handler in this plan is host-only: resolve identity via
  `lib/portal/requireHost.ts` (do not write a new inline `requireHost`).
- All writes go through `createSupabaseServiceRoleClient()` (bypasses RLS) —
  never trust a client-supplied player/round/box value without validating it
  against real data server-side.
- A match box's `format` is never chosen independently — it's always copied
  from `live_round_state.format` at creation time (the spec's rule, already
  noted in the previous plan: "Courses & Format is the one place a human
  ever picks it").
- Match existing code style: Tailwind utility classes matching
  `components/portal/tiger/CoursesFormatPanel.tsx`'s look (font-serif
  headers, font-sans body, maroon-700 accents, font-condensed uppercase
  small text for buttons/labels).
- Run `npm test && npx tsc --noEmit && npm run lint && npm run build` clean
  before considering any task done.

---

### Task 1: Schema migration — flatten `live_match_boxes` to the round model

**Files:**
- Modify: `supabase/schema.sql` (append after the "Tiger Center: Setup" section)

**Interfaces:**
- Produces (consumed by Task 2's types and every later task): `live_match_boxes.round integer not null references live_round_state(round)`,
  `box_number` cap raised to 6, `day`/`session`/`tournament_year` columns
  gone.

- [ ] **Step 1: Append the migration**

```sql
-- === Tiger Center: Matchups ==============================================
-- Flattens live_match_boxes off the original 4-day/2-session/3-box grid
-- (ported from MM-Scorekeeper's Python model in the Native Live Platform
-- section above) onto the flexible round model Tiger Center Setup already
-- shipped (round_count 6-10, one flat live_round_state row per round) — the
-- old grid can only reach round 8 (4 days x 2 sessions) and caps at 3
-- boxes, which doesn't fit Singles' 6 boxes (12 players / 2 per box). See
-- the Tiger Center Operations spec's Matchups section.

alter table live_match_boxes add column if not exists round integer references live_round_state(round);

-- No real tournament has used this table yet (Matchups didn't exist until
-- this plan) — delete instead of guessing a day/session -> round backfill
-- mapping for any row that predates the round column.
delete from live_match_boxes where round is null;
alter table live_match_boxes alter column round set not null;

-- Dropping a column automatically drops any table constraint that
-- references it (check or unique) — no CASCADE needed, and this takes the
-- old (tournament_year, day, session, box_number) unique constraint and the
-- day/session check constraints with it.
alter table live_match_boxes drop column if exists day;
alter table live_match_boxes drop column if exists session;
alter table live_match_boxes drop column if exists tournament_year;

drop index if exists live_match_boxes_year_day_session_idx;
create index if not exists live_match_boxes_round_idx on live_match_boxes (round);

alter table live_match_boxes drop constraint if exists live_match_boxes_round_box_number_key;
alter table live_match_boxes add constraint live_match_boxes_round_box_number_key unique (round, box_number);

-- Singles is 12 players / 2 per box = 6 boxes; Fourball/Foursome stays 3.
alter table live_match_boxes drop constraint if exists live_match_boxes_box_number_check;
alter table live_match_boxes add constraint live_match_boxes_box_number_check check (box_number between 1 and 6);
```

- [ ] **Step 2: Run it against your Supabase project**

This step is for the operator, not the implementer — same as the previous
two plans' schema tasks. Note in your report that Step 2 is a manual step;
do not attempt it (no DB credentials are configured in this environment).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(tiger): flatten live_match_boxes onto the round model"
```

---

### Task 2: Round-based match box model — types, orchestration, tests

**Files:**
- Modify: `lib/live/types.ts` (`LiveMatchBox`, drop `Session`)
- Modify: `lib/live/orchestration.ts`
- Modify: `lib/live/orchestration.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Tasks 3-5): `LiveMatchBox` with a `round: number`
  field instead of `tournamentYear`/`day`/`session`; `boxesPerRound(format):
  number`, `playersPerTeamPerBox(format): number`, `roundIsComplete(snapshot,
  round, format): boolean` (replaces `sessionIsComplete`); `validateMatchBox`
  now format-aware (Singles = 1 player/side, 6 boxes; Fourball/Foursome = 2
  players/side, 3 boxes).

This task changes `types.ts` and `orchestration.ts` together in one task
(rather than splitting them like the previous plan's Task 2) because
`orchestration.ts` references every field being removed from `LiveMatchBox`
— splitting them would leave the repo non-compiling between commits.

- [ ] **Step 1: Update `LiveMatchBox` and drop `Session`**

```typescript
// lib/live/types.ts
// was: export type Session = "Morning" | "Afternoon";
// (Session is deleted — day/session no longer exist anywhere in this model)

// was:
// export interface LiveMatchBox {
//   id: string | null;
//   tournamentYear: number;
//   day: number;
//   session: Session;
//   boxNumber: number;
//   format: MatchFormat;
//   teeTime: Date;
//   maroonPlayers: string[];
//   whitePlayers: string[];
//   state: MatchState;
//   started: boolean;
// }
export interface LiveMatchBox {
  id: string | null;
  round: number;
  boxNumber: number;
  format: MatchFormat;
  teeTime: Date;
  maroonPlayers: string[]; // player_slug[]
  whitePlayers: string[]; // player_slug[]
  state: MatchState;
  started: boolean;
}
```

- [ ] **Step 2: Rewrite the failing/changing parts of `orchestration.test.ts`**

```typescript
// lib/live/orchestration.test.ts
// Update imports:
import { effectiveMatchState, matchBoxResult, roundIsComplete, thruLabel, validateMatchBox } from "./orchestration.ts";

// Update the box() helper — round replaces day, format is now a parameter
// (defaults to "Fourball" so every existing call site keeps working):
function box(round: number, boxNumber: number, maroon: string[], white: string[], format: LiveMatchBox["format"] = "Fourball"): LiveMatchBox {
  return {
    id: null,
    round,
    boxNumber,
    format,
    teeTime: new Date("2027-01-06T09:30:00-06:00"),
    maroonPlayers: maroon,
    whitePlayers: white,
    state: "Scheduled",
    started: false,
  };
}

// Replace the "session complete requires three boxes and all twelve
// players" test with round-based coverage:
test("roundIsComplete requires the right box count and full, non-overlapping roster for the format", () => {
  const snapshot = seedSnapshot();
  assert.equal(roundIsComplete(snapshot, 1, "Fourball"), false);

  snapshot.matchBoxes = [
    box(1, 1, ["cam", "drew"], ["cade", "collin"]),
    box(1, 2, ["hugo", "luke"], ["dalton", "jackson"]),
    box(1, 3, ["nate", "pete"], ["kyle", "quez"]),
  ];
  assert.equal(roundIsComplete(snapshot, 1, "Fourball"), true);
  // Same players, but Singles needs 6 boxes of 1v1, not 3 boxes of 2v2 —
  // right roster, wrong box count for this format.
  assert.equal(roundIsComplete(snapshot, 1, "Singles"), false);
});

test("validateMatchBox requires 2 players per side for Fourball/Foursome and 1 for Singles", () => {
  const snapshot = seedSnapshot();
  const shortHanded: LiveMatchBox = { id: null, round: 1, boxNumber: 1, format: "Fourball", teeTime: new Date("2027-01-06T09:30:00-06:00"), maroonPlayers: ["cam"], whitePlayers: ["cade", "collin"], state: "Scheduled", started: false };
  assert.deepEqual(validateMatchBox(snapshot, shortHanded), ["Pick exactly 2 Maroon players."]);

  const singlesBox: LiveMatchBox = { id: null, round: 1, boxNumber: 1, format: "Singles", teeTime: new Date("2027-01-06T09:30:00-06:00"), maroonPlayers: ["cam"], whitePlayers: ["cade"], state: "Scheduled", started: false };
  assert.deepEqual(validateMatchBox(snapshot, singlesBox), []);
});

test("validateMatchBox caps box number at the format's box count", () => {
  const snapshot = seedSnapshot();
  const outOfRange: LiveMatchBox = { id: null, round: 1, boxNumber: 4, format: "Fourball", teeTime: new Date("2027-01-06T09:30:00-06:00"), maroonPlayers: ["cam", "drew"], whitePlayers: ["cade", "collin"], state: "Scheduled", started: false };
  assert.deepEqual(validateMatchBox(snapshot, outOfRange), ["Match box must be between 1 and 3 for Fourball."]);

  const inRangeForSingles: LiveMatchBox = { ...outOfRange, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["cade"] };
  assert.deepEqual(validateMatchBox(snapshot, inRangeForSingles), []);
});

test("validateMatchBox rejects a player already assigned elsewhere in the round", () => {
  const snapshot = seedSnapshot();
  snapshot.matchBoxes = [box(1, 1, ["cam", "drew"], ["cade", "collin"])];
  const conflicting: LiveMatchBox = { id: null, round: 1, boxNumber: 2, format: "Fourball", teeTime: new Date("2027-01-06T09:30:00-06:00"), maroonPlayers: ["cam", "hugo"], whitePlayers: ["dalton", "jackson"], state: "Scheduled", started: false };
  assert.deepEqual(validateMatchBox(snapshot, conflicting), ["Players already assigned in this round: cam."]);
});
```

Every other existing test in this file (`match state moves...`, `thru label
never displays Thru 18`, `matchBoxResult closes a match...`,
`matchBoxResult halves a fully-played tied match`,
`effectiveMatchState returns Final...`) keeps working unchanged — they call
`box(1, 1, [...], [...])` positionally, and `round` occupies the same first
argument position `day` used to.

- [ ] **Step 3: Run to verify the new/changed tests fail**

Run: `npm test -- lib/live/orchestration.test.ts`
Expected: FAIL (`roundIsComplete`/`validateMatchBox`'s new error messages
don't exist yet; TS errors on `LiveMatchBox.round` not existing on the old
`orchestration.ts`).

- [ ] **Step 4: Rewrite `orchestration.ts`**

```typescript
// lib/live/orchestration.ts
import { readScore, type LiveMatchBox, type LiveTournamentSnapshot, type MatchFormat, type MatchState, type Team } from "./types.ts";

const ROSTER_SIZE = 12; // 6 Maroon + 6 White — fixed roster size across formats

export function boxesPerRound(format: MatchFormat): number {
  return format === "Singles" ? 6 : 3;
}

export function playersPerTeamPerBox(format: MatchFormat): number {
  return format === "Singles" ? 1 : 2;
}

export function validateMatchBox(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): string[] {
  const errors: string[] = [];
  const maxBoxes = boxesPerRound(matchBox.format);
  if (matchBox.boxNumber < 1 || matchBox.boxNumber > maxBoxes) {
    errors.push(`Match box must be between 1 and ${maxBoxes} for ${matchBox.format}.`);
  }

  const perTeam = playersPerTeamPerBox(matchBox.format);
  if (matchBox.maroonPlayers.length !== perTeam) errors.push(`Pick exactly ${perTeam} Maroon player${perTeam === 1 ? "" : "s"}.`);
  if (matchBox.whitePlayers.length !== perTeam) errors.push(`Pick exactly ${perTeam} White player${perTeam === 1 ? "" : "s"}.`);

  for (const player of matchBox.maroonPlayers) {
    if (snapshot.players[player]?.team !== "maroon") errors.push(`${player} is not on Team Maroon.`);
  }
  for (const player of matchBox.whitePlayers) {
    if (snapshot.players[player]?.team !== "white") errors.push(`${player} is not on Team White.`);
  }

  const roundBoxes = snapshot.matchBoxes.filter((box) => box.round === matchBox.round && box.boxNumber !== matchBox.boxNumber);
  const used = new Set(roundBoxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]));
  const duplicates = [...matchBox.maroonPlayers, ...matchBox.whitePlayers].filter((player) => used.has(player));
  if (duplicates.length > 0) errors.push(`Players already assigned in this round: ${[...new Set(duplicates)].sort().join(", ")}.`);

  return errors;
}

export function roundIsComplete(snapshot: LiveTournamentSnapshot, round: number, format: MatchFormat): boolean {
  const boxes = snapshot.matchBoxes.filter((box) => box.round === round);
  if (boxes.length !== boxesPerRound(format)) return false;
  const players = boxes.flatMap((box) => [...box.maroonPlayers, ...box.whitePlayers]);
  return players.length === ROSTER_SIZE && new Set(players).size === ROSTER_SIZE;
}

export function effectiveMatchState(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox, now?: Date): MatchState {
  if (matchBox.state === "Final") return "Final";
  if (matchBoxStartedThru(snapshot, matchBox) === 18) return "Final";
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
  if ((matchBox.format as string) === "Foursome") return false;
  const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];
  return players.every((player) => {
    const score = readScore(snapshot, player, matchBox.round, hole);
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
  if ((matchBox.format as string) === "Foursome") {
    return { maroonPts: 0, whitePts: 0, leader: "tie", margin: 0, holesRemaining: 18 };
  }

  const round = matchBox.round;
  let maroonHoles = 0;
  let whiteHoles = 0;
  let completed = 0;

  for (let hole = 1; hole <= 18; hole++) {
    if (!holeComplete(snapshot, matchBox, hole)) break;
    completed = hole;
    const maroonBest = Math.min(...matchBox.maroonPlayers.map((player) => readScore(snapshot, player, round, hole).score ?? 0));
    const whiteBest = Math.min(...matchBox.whitePlayers.map((player) => readScore(snapshot, player, round, hole).score ?? 0));
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
  const state = effectiveMatchState(snapshot, matchBox, now);
  const result = matchBoxResult(snapshot, matchBox);
  return {
    id: matchBox.id,
    round: matchBox.round,
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

- [ ] **Step 5: Run to verify tests pass**

Run: `npm test -- lib/live/orchestration.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/live/types.ts lib/live/orchestration.ts lib/live/orchestration.test.ts
git commit -m "feat(tiger): move match boxes onto the round model, format-aware validation"
```

---

### Task 3: Match Box Route Handlers

**Files:**
- Create: `app/api/portal/tiger/matchboxes/route.ts`
- Create: `app/api/portal/tiger/matchboxes/remove/route.ts`
- Test: `app/api/portal/tiger/matchboxes/route.test.ts`
- Test: `app/api/portal/tiger/matchboxes/remove/route.test.ts`

**Interfaces:**
- Consumes: `requireHost`, `LiveMatchBox`/`LiveTournamentSnapshot`/`MatchFormat`/`Team`
  (Task 2's `lib/live/types.ts`), `validateMatchBox` (Task 2's
  `lib/live/orchestration.ts`).
- Produces (consumed by Task 5's UI):
  - `GET /api/portal/tiger/matchboxes` (optional `?round=N`) → `{ ok: true,
    matchBoxes: LiveMatchBox[] } | { ok: false, error: string }`.
  - `POST /api/portal/tiger/matchboxes` with `{ round: number, boxNumber:
    number, teeTime: string /* ISO */, maroonPlayers: string[], whitePlayers:
    string[] }` → `{ ok: true, id: string } | { ok: false, error: string }`
    — upserts one match box (creates or updates by `round`+`boxNumber`).
    `format` is never taken from the client — it's read from
    `live_round_state.format` server-side.
  - `POST /api/portal/tiger/matchboxes/remove` with `{ id: string }` → `{ ok:
    true } | { ok: false, error: string }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/portal/tiger/matchboxes/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// requireHost() calls createSupabaseServerClient(), which needs a real
// request lifecycle — same documented limitation as every other Tiger
// Center route test. This covers the one pure piece: an unauthenticated
// request never reaches Supabase. Format-aware validation logic itself is
// covered directly against pure functions in lib/live/orchestration.test.ts.
test("POST /api/portal/tiger/matchboxes rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/portal/tiger/matchboxes", {
    method: "POST",
    body: JSON.stringify({ round: 1, boxNumber: 1, teeTime: "2027-01-06T09:30:00-06:00", maroonPlayers: ["cam", "drew"], whitePlayers: ["cade", "collin"] }),
  });

  await assert.rejects(() => POST(request));
  assert.equal(fetchCalled, false, "must not touch Supabase without a resolved host session");
  globalThis.fetch = originalFetch;
});
```

```typescript
// app/api/portal/tiger/matchboxes/remove/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/matchboxes/remove rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/matchboxes/remove", {
    method: "POST",
    body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- app/api/portal/tiger/matchboxes`
Expected: FAIL (`Cannot find module './route.ts'`)

- [ ] **Step 3: Write `app/api/portal/tiger/matchboxes/route.ts`**

```typescript
// app/api/portal/tiger/matchboxes/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { validateMatchBox } from "@/lib/live/orchestration";
import type { LiveMatchBox, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

interface MatchBoxRow {
  id: string;
  round: number;
  box_number: number;
  format: string;
  tee_time: string;
  maroon_players: string[];
  white_players: string[];
  state: string;
  started: boolean;
}

function rowToMatchBox(row: MatchBoxRow): LiveMatchBox {
  return {
    id: row.id,
    round: row.round,
    boxNumber: row.box_number,
    format: row.format as MatchFormat,
    teeTime: new Date(row.tee_time),
    maroonPlayers: row.maroon_players,
    whitePlayers: row.white_players,
    state: row.state as MatchState,
    started: row.started,
  };
}

const MATCH_BOX_COLUMNS = "id, round, box_number, format, tee_time, maroon_players, white_players, state, started";

export async function GET(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const roundParam = url.searchParams.get("round");

  const service = createSupabaseServiceRoleClient();
  let query = service.from("live_match_boxes").select(MATCH_BOX_COLUMNS).order("round").order("box_number");
  if (roundParam) query = query.eq("round", Number(roundParam));

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the match boxes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matchBoxes: (data ?? []).map(rowToMatchBox) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, boxNumber, teeTime, maroonPlayers, whitePlayers } = await request.json();
  if (
    typeof round !== "number" ||
    typeof boxNumber !== "number" ||
    typeof teeTime !== "string" ||
    !Array.isArray(maroonPlayers) ||
    !Array.isArray(whitePlayers)
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: roundRow } = await service.from("live_round_state").select("format, course_locked, matchups_locked").eq("round", round).single();
  if (!roundRow?.course_locked || !roundRow.format) {
    return NextResponse.json({ ok: false, error: "Lock this round's course and format before building matchups." }, { status: 400 });
  }
  if (roundRow.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this round's matchups before editing." }, { status: 400 });
  }
  const format = roundRow.format as MatchFormat;

  const { data: rosterRows } = await service.from("live_roster").select("player_slug, team");
  const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

  const { data: existingRows } = await service.from("live_match_boxes").select(MATCH_BOX_COLUMNS).eq("round", round);
  const existingBoxes = (existingRows as MatchBoxRow[] | null ?? []).map(rowToMatchBox).filter((box) => box.boxNumber !== boxNumber);

  const candidate: LiveMatchBox = {
    id: null,
    round,
    boxNumber,
    format,
    teeTime: new Date(teeTime),
    maroonPlayers,
    whitePlayers,
    state: "Scheduled",
    started: false,
  };

  const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes: [...existingBoxes, candidate] };
  const errors = validateMatchBox(snapshot, candidate);
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });
  }

  const { data: currentBox } = await service.from("live_match_boxes").select("id").eq("round", round).eq("box_number", boxNumber).maybeSingle();
  if (currentBox) {
    const { error } = await service
      .from("live_match_boxes")
      .update({ format, tee_time: teeTime, maroon_players: maroonPlayers, white_players: whitePlayers })
      .eq("id", currentBox.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not save that match box." }, { status: 500 });
    return NextResponse.json({ ok: true, id: currentBox.id });
  }

  const { data: inserted, error } = await service
    .from("live_match_boxes")
    .insert({ round, box_number: boxNumber, format, tee_time: teeTime, maroon_players: maroonPlayers, white_players: whitePlayers })
    .select("id")
    .single();
  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: "Could not save that match box." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
```

- [ ] **Step 4: Write `app/api/portal/tiger/matchboxes/remove/route.ts`**

```typescript
// app/api/portal/tiger/matchboxes/remove/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { id } = await request.json();
  if (typeof id !== "string") {
    return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: box } = await service.from("live_match_boxes").select("round").eq("id", id).single();
  if (!box) {
    return NextResponse.json({ ok: false, error: "Match box not found." }, { status: 404 });
  }

  const { data: roundRow } = await service.from("live_round_state").select("matchups_locked").eq("round", box.round).single();
  if (roundRow?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this round's matchups before removing a match box." }, { status: 400 });
  }

  const { error } = await service.from("live_match_boxes").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that match box." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run to verify tests pass**

Run: `npm test -- app/api/portal/tiger/matchboxes`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/portal/tiger/matchboxes
git commit -m "feat(tiger): add match box Route Handlers (list + upsert + remove)"
```

---

### Task 4: Wire up the Matchups lock

**Files:**
- Modify: `app/api/portal/tiger/rounds/lock/route.ts`
- Test: `app/api/portal/tiger/rounds/lock/route.test.ts`

**Interfaces:**
- Consumes: `roundIsComplete` (Task 2's `lib/live/orchestration.ts`),
  `LiveMatchBox`/`LiveTournamentSnapshot`/`MatchFormat`/`MatchState` (Task
  2's `lib/live/types.ts`).
- Produces (consumed by Task 5's UI): `POST /api/portal/tiger/rounds/lock`
  with `{ round: number, lock: "matchups", value: boolean }` now actually
  works instead of always rejecting — locking requires the round's course to
  already be locked and every match box for that round to be filled
  (`roundIsComplete`); unlocking always succeeds. Unlocking `lock: "course"`
  now also clears that round's `matchups_locked` (a round's matchups are
  only ever valid against a locked format — if the format gets reopened,
  matchups built against it can't stay "locked and public").

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/portal/tiger/rounds/lock/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/rounds/lock rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/rounds/lock", {
    method: "POST",
    body: JSON.stringify({ round: 1, lock: "matchups", value: true }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app/api/portal/tiger/rounds/lock/route.test.ts`
Expected: FAIL (`Cannot find module './route.ts'` — no test file existed for
this route before; confirm the route itself still exists from the previous
plan before assuming this is a real failure).

- [ ] **Step 3: Rewrite `app/api/portal/tiger/rounds/lock/route.ts`**

```typescript
// app/api/portal/tiger/rounds/lock/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { roundIsComplete } from "@/lib/live/orchestration";
import type { LiveMatchBox, LiveTournamentSnapshot, MatchFormat, MatchState } from "@/lib/live/types";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, lock, value } = await request.json();
  if (typeof round !== "number" || (lock !== "course" && lock !== "matchups") || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (lock === "course") {
    if (value) {
      const { data: current } = await service.from("live_round_state").select("date, course_id, format").eq("round", round).single();
      if (!current?.date || !current?.course_id || !current?.format) {
        return NextResponse.json({ ok: false, error: "Set a date, course, and format before locking this round." }, { status: 400 });
      }
    } else {
      // Unlocking course/format invalidates any matchups built against it —
      // a matchups-locked round can't be left pointing at an unlocked format.
      await service.from("live_round_state").update({ matchups_locked: false }).eq("round", round);
    }
    const { error } = await service.from("live_round_state").update({ course_locked: value }).eq("round", round);
    if (error) {
      return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // lock === "matchups"
  if (value) {
    const { data: current } = await service.from("live_round_state").select("course_locked, format").eq("round", round).single();
    if (!current?.course_locked || !current.format) {
      return NextResponse.json({ ok: false, error: "Lock this round's course and format before locking matchups." }, { status: 400 });
    }

    const { data: boxRows } = await service
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("round", round);
    const matchBoxes: LiveMatchBox[] = (boxRows ?? []).map((row) => ({
      id: row.id,
      round: row.round,
      boxNumber: row.box_number,
      format: row.format as MatchFormat,
      teeTime: new Date(row.tee_time),
      maroonPlayers: row.maroon_players,
      whitePlayers: row.white_players,
      state: row.state as MatchState,
      started: row.started,
    }));
    const snapshot: LiveTournamentSnapshot = { players: {}, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes };
    if (!roundIsComplete(snapshot, round, current.format as MatchFormat)) {
      return NextResponse.json({ ok: false, error: "Every match box for this round needs to be filled before locking matchups." }, { status: 400 });
    }
  }

  const { error } = await service.from("live_round_state").update({ matchups_locked: value }).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify the test passes**

Run: `npm test -- app/api/portal/tiger/rounds/lock/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/rounds/lock/route.ts app/api/portal/tiger/rounds/lock/route.test.ts
git commit -m "feat(tiger): implement the Matchups lock (requires a complete round)"
```

---

### Task 5: Matchups UI

**Files:**
- Create: `app/portal/admin/matchups/page.tsx`
- Create: `components/portal/tiger/MatchupsPanel.tsx`

**Interfaces:**
- Consumes: every route from Tasks 3 and 4, `boxesPerRound`/`playersPerTeamPerBox`
  (Task 2's `lib/live/orchestration.ts`), `playerProfiles` (`lib/data/players`).
- Produces (consumed by Task 6): the page Task 6's Tiger Center landing page
  links its "Matchups" button to.

- [ ] **Step 1: Write `app/portal/admin/matchups/page.tsx`**

```typescript
// app/portal/admin/matchups/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { playerProfiles } from "@/lib/data/players";
import { MatchupsPanel, type RosterPlayer } from "@/components/portal/tiger/MatchupsPanel";
import type { LiveMatchBox, LiveRoundState, MatchFormat, MatchState } from "@/lib/live/types";

export default async function MatchupsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const [{ data: roundRows }, { data: boxRows }, { data: rosterRows }] = await Promise.all([
    service.from("live_round_state").select("round, started, course_id, date, format, course_locked, matchups_locked").order("round"),
    service.from("live_match_boxes").select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started").order("round").order("box_number"),
    service.from("live_roster").select("player_slug, team"),
  ]);

  const rounds: LiveRoundState[] = (roundRows ?? []).map((r) => ({
    round: r.round,
    started: r.started,
    courseId: r.course_id,
    date: r.date,
    format: r.format as MatchFormat | null,
    courseLocked: r.course_locked,
    matchupsLocked: r.matchups_locked,
  }));

  const matchBoxes: LiveMatchBox[] = (boxRows ?? []).map((b) => ({
    id: b.id,
    round: b.round,
    boxNumber: b.box_number,
    format: b.format as MatchFormat,
    teeTime: new Date(b.tee_time),
    maroonPlayers: b.maroon_players,
    whitePlayers: b.white_players,
    state: b.state as MatchState,
    started: b.started,
  }));

  const nameBySlug = new Map(playerProfiles.map((p) => [p.slug, p.fullName]));
  const roster: RosterPlayer[] = (rosterRows ?? [])
    .filter((r) => nameBySlug.has(r.player_slug))
    .map((r) => ({ playerSlug: r.player_slug, fullName: nameBySlug.get(r.player_slug)!, team: r.team as "maroon" | "white" }));

  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Matchups</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">
        Assign players into match boxes for each round whose course and format are locked. Lock Matchups once a
        round is fully set to make it visible on the Website and Player Portals.
      </p>
      <MatchupsPanel rounds={rounds} initialMatchBoxes={matchBoxes} roster={roster} />
    </div>
  );
}
```

- [ ] **Step 2: Write `components/portal/tiger/MatchupsPanel.tsx`**

```typescript
// components/portal/tiger/MatchupsPanel.tsx
"use client";

import { useState } from "react";
import { boxesPerRound, playersPerTeamPerBox } from "@/lib/live/orchestration";
import type { LiveMatchBox, LiveRoundState, MatchFormat } from "@/lib/live/types";

export interface RosterPlayer {
  playerSlug: string;
  fullName: string;
  team: "maroon" | "white";
}

interface BoxDraft {
  id: string | null;
  boxNumber: number;
  teeTime: string; // "HH:MM", browser-local wall-clock time
  maroonPlayers: (string | null)[];
  whitePlayers: (string | null)[];
}

function blankBox(boxNumber: number, format: MatchFormat): BoxDraft {
  const perTeam = playersPerTeamPerBox(format);
  return { id: null, boxNumber, teeTime: "", maroonPlayers: Array(perTeam).fill(null), whitePlayers: Array(perTeam).fill(null) };
}

// Renders a saved tee time (an absolute instant) back into an
// <input type="time"> using LOCAL hours/minutes, matching how saveBox()
// below interprets the typed "HH:MM" as local time when building the
// instant it sends to the server. Using toISOString() here instead would
// shift the displayed time by the browser's UTC offset on every reload.
function timeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function availablePlayers(pool: RosterPlayer[], drafts: BoxDraft[], side: "maroonPlayers" | "whitePlayers", currentBoxNumber: number, currentValue: string | null): RosterPlayer[] {
  const usedElsewhere = new Set(
    drafts
      .filter((d) => d.boxNumber !== currentBoxNumber)
      .flatMap((d) => d[side])
      .filter((p): p is string => p !== null)
  );
  return pool.filter((p) => p.playerSlug === currentValue || !usedElsewhere.has(p.playerSlug));
}

export function MatchupsPanel({ rounds, initialMatchBoxes, roster }: { rounds: LiveRoundState[]; initialMatchBoxes: LiveMatchBox[]; roster: RosterPlayer[] }) {
  // Saved match boxes only ever change via a full page reload, right after
  // a successful save/remove/lock (see saveBox/removeBox/toggleMatchupsLock
  // below) — so in-progress edits never need to live alongside them. They're
  // kept separately here, as plain strings/arrays keyed by "round:boxNumber"
  // and layered onto the saved data in draftFor() on every render. A reload
  // naturally clears this map along with the rest of the component's state.
  const [overrides, setOverrides] = useState<Record<string, Partial<BoxDraft>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const maroonRoster = roster.filter((p) => p.team === "maroon");
  const whiteRoster = roster.filter((p) => p.team === "white");
  const readyRounds = rounds.filter((r): r is LiveRoundState & { format: MatchFormat } => r.courseLocked && r.format !== null);

  function draftKey(round: number, boxNumber: number): string {
    return `${round}:${boxNumber}`;
  }

  function draftFor(round: number, format: MatchFormat, boxNumber: number): BoxDraft {
    const saved = initialMatchBoxes.find((b) => b.round === round && b.boxNumber === boxNumber);
    const base: BoxDraft = saved
      ? { id: saved.id, boxNumber, teeTime: timeInputValue(saved.teeTime), maroonPlayers: saved.maroonPlayers, whitePlayers: saved.whitePlayers }
      : blankBox(boxNumber, format);
    return { ...base, ...overrides[draftKey(round, boxNumber)] };
  }

  function updateDraft(round: number, boxNumber: number, patch: Partial<BoxDraft>) {
    const key = draftKey(round, boxNumber);
    setOverrides((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  async function saveBox(round: LiveRoundState & { format: MatchFormat }, draft: BoxDraft) {
    const perTeam = playersPerTeamPerBox(round.format);
    const maroonPlayers = draft.maroonPlayers.filter((p): p is string => p !== null);
    const whitePlayers = draft.whitePlayers.filter((p): p is string => p !== null);
    if (maroonPlayers.length !== perTeam || whitePlayers.length !== perTeam || !draft.teeTime) {
      setError(`Box ${draft.boxNumber}: fill in ${perTeam} player${perTeam === 1 ? "" : "s"} per side and a tee time before saving.`);
      return;
    }
    const key = `${round.round}:${draft.boxNumber}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/matchboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round: round.round,
          boxNumber: draft.boxNumber,
          teeTime: new Date(`${round.date}T${draft.teeTime}:00`).toISOString(),
          maroonPlayers,
          whitePlayers,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } finally {
      setBusyKey(null);
    }
  }

  async function removeBox(id: string) {
    setError(null);
    const res = await fetch("/api/portal/tiger/matchboxes/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  async function toggleMatchupsLock(round: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/rounds/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round, lock: "matchups", value }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="mt-6 space-y-6">
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      {readyRounds.length === 0 && (
        <p className="font-sans text-sm text-ink-500">No rounds have their course and format locked yet — set that up in Courses & Format first.</p>
      )}

      {readyRounds.map((round) => {
        const drafts = Array.from({ length: boxesPerRound(round.format) }, (_, i) => draftFor(round.round, round.format, i + 1));
        return (
          <div key={round.round} className="rounded-lg border-2 border-stone-300 p-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-lg font-bold text-ink-900">
                Round {round.round} — {round.format}
              </span>
              <button
                type="button"
                onClick={() => toggleMatchupsLock(round.round, !round.matchupsLocked)}
                className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
              >
                {round.matchupsLocked ? "Unlock Matchups" : "Lock Matchups"}
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {drafts.map((draft) => (
                <div key={draft.boxNumber} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Box {draft.boxNumber}</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="time"
                        value={draft.teeTime}
                        disabled={round.matchupsLocked}
                        onChange={(e) => updateDraft(round.round, draft.boxNumber, { teeTime: e.target.value })}
                        className="border-2 border-stone-300 rounded-lg px-2 py-1 text-sm"
                      />
                      {draft.id && !round.matchupsLocked && (
                        <button
                          type="button"
                          onClick={() => removeBox(draft.id!)}
                          className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-600 underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700">Maroon</span>
                      {draft.maroonPlayers.map((value, i) => (
                        <select
                          key={i}
                          value={value ?? ""}
                          disabled={round.matchupsLocked}
                          onChange={(e) => {
                            const next = [...draft.maroonPlayers];
                            next[i] = e.target.value || null;
                            updateDraft(round.round, draft.boxNumber, { maroonPlayers: next });
                          }}
                          className="w-full border-2 border-stone-300 rounded-lg px-2 py-1 text-sm"
                        >
                          <option value="">Choose a player</option>
                          {availablePlayers(maroonRoster, drafts, "maroonPlayers", draft.boxNumber, value).map((p) => (
                            <option key={p.playerSlug} value={p.playerSlug}>
                              {p.fullName}
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-700">White</span>
                      {draft.whitePlayers.map((value, i) => (
                        <select
                          key={i}
                          value={value ?? ""}
                          disabled={round.matchupsLocked}
                          onChange={(e) => {
                            const next = [...draft.whitePlayers];
                            next[i] = e.target.value || null;
                            updateDraft(round.round, draft.boxNumber, { whitePlayers: next });
                          }}
                          className="w-full border-2 border-stone-300 rounded-lg px-2 py-1 text-sm"
                        >
                          <option value="">Choose a player</option>
                          {availablePlayers(whiteRoster, drafts, "whitePlayers", draft.boxNumber, value).map((p) => (
                            <option key={p.playerSlug} value={p.playerSlug}>
                              {p.fullName}
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                  </div>

                  {!round.matchupsLocked && (
                    <button
                      type="button"
                      disabled={busyKey === `${round.round}:${draft.boxNumber}`}
                      onClick={() => saveBox(round, draft)}
                      className="mt-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                    >
                      {busyKey === `${round.round}:${draft.boxNumber}` ? "Saving…" : "Save Box"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Manual walkthrough**

Run `npm run dev`, log in as Tiger. In Courses & Format, set round count to
6, assign a course/format/date to Round 1 (try `Fourball`), and lock it.
Visit `/portal/admin/matchups` — confirm Round 1 shows 3 empty boxes and
rounds without a course lock don't appear. Fill Box 1's tee time, 2 Maroon
players, 2 White players, Save — confirm it persists after reload and those
players no longer appear in Box 2/3's dropdowns. Fill and save all 3 boxes,
confirm "Lock Matchups" now succeeds (fields become disabled, Remove
disappears); confirm it's rejected with a clear error if you try locking
before every box is filled. Unlock, confirm fields re-enable. Set a
different round to `Singles`, lock its course/format, confirm its Matchups
view shows 6 boxes of 1 player per side instead of 3 boxes of 2.

- [ ] **Step 4: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add app/portal/admin/matchups components/portal/tiger/MatchupsPanel.tsx
git commit -m "feat(tiger): add Matchups UI"
```

---

### Task 6: Enable the Matchups tile

**Files:**
- Modify: `components/portal/tiger/TigerCenterNav.tsx`

**Interfaces:**
- Consumes: Task 5's `/portal/admin/matchups` page.
- Produces: nothing further downstream — this is the last task in this plan.

- [ ] **Step 1: Update the `BOXES` array**

```typescript
// components/portal/tiger/TigerCenterNav.tsx
// was: { label: "Matchups", href: "#", enabled: false },
const BOXES = [
  { label: "Players & Teams", href: "/portal/admin/players-teams", enabled: true },
  { label: "Courses & Format", href: "/portal/admin/courses-format", enabled: true },
  { label: "Matchups", href: "/portal/admin/matchups", enabled: true },
  { label: "Edit Scores", href: "#", enabled: false },
];
```

- [ ] **Step 2: Manual walkthrough**

Run `npm run dev`, log in as Tiger, visit `/portal/admin` — confirm the
Matchups tile is now clickable and leads to the working page, and Edit
Scores is still visibly "Coming soon."

- [ ] **Step 3: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add components/portal/tiger/TigerCenterNav.tsx
git commit -m "feat(tiger): enable the Matchups tile on the Tiger Center landing page"
```

---

## Definition of done for this phase

- `live_match_boxes` runs on the flat round model — no `day`/`session`/`tournament_year`
  columns, `box_number` allows up to 6 (Singles).
- `lib/live/orchestration.ts`'s match-box validation and round-completeness
  checks are format-aware (2 players/side x 3 boxes for Fourball/Foursome, 1
  player/side x 6 boxes for Singles).
- Tiger can, for any round with its course and format locked, assign real
  players into that round's match boxes with tee times, remove an unlocked
  box, and lock/unlock that round's Matchups independently of its
  Courses & Format lock — locking requires every box filled with a valid,
  non-duplicated roster.
- Unlocking a round's Courses & Format also unlocks its Matchups (can't
  leave stale matchups locked against a reopened format).
- **Edit Scores** and the live round cycle (Start Round, player scoring,
  official settlement) are still not built — out of scope for this plan.
- `npm test && npx tsc --noEmit && npm run lint && npm run build` all clean.
- Nothing about the public `/leaderboard`, `/teams`, `/history`, `/schedule`
  pages changed — this phase is entirely inside the Tiger Center.
