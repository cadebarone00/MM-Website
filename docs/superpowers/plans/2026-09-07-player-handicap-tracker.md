# Player Handicap Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player log a personal (non-tournament) round from `/portal`, compute a real WHS handicap index from their archived rounds, and store hole-by-hole detail for future predictions work.

**Architecture:** Fully native to this repo's Supabase/Next.js stack (no Python/Neon dependency). New `handicap_rounds`/`handicap_round_holes` tables, a pure `lib/handicap/whs.ts` calculation module (no I/O, fully unit-testable), a thin `lib/handicap/data.ts` data-access layer reused by both Server Components and Route Handlers, and a 3-step client-side wizard (setup → 18 holes → review) reusing the Tiger Center course library's tee-set data.

**Tech Stack:** Next.js 16 App Router (Route Handlers + Server Components), TypeScript, Supabase (service-role client for all reads/writes), `node:test` via `tsx` for unit tests.

**Spec:** `docs/superpowers/specs/2026-09-07-player-handicap-tracker-design.md`

## Global Constraints

- Nothing client-supplied is ever trusted as identity — player identity always comes from `requirePlayer()` (resolves the Supabase session server-side), never a request body field.
- Course rating/slope/par are always looked up server-side from `live_courses` at submit time — never trusted from the client, even though the client displayed them during setup.
- Writes go through `createSupabaseServiceRoleClient()` only, from Route Handlers/Server Components — this matches every existing Tiger Center write path (`app/api/portal/scoring/stroke/route.ts`, `app/api/portal/tiger/courses/route.ts`).
- No changes to tournament live scoring (`/portal/scoring/play`, `ScoringPanel.tsx`, `app/api/portal/scoring/**`) or any public `/leaderboard`, `/teams`, `/schedule`, `/history` page.
- `schema.sql` has known drift from production in this repo (see Task 1) — never assume a column exists in production just because it's (or isn't) in `schema.sql`; the Task 1 migration is the one place this plan touches that risk, and every later task's code review should note if it discovers more drift, not silently work around it.
- Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` before considering any task done, per this repo's standing rule.

---

### Task 1: Database schema — confirm tee-set migration, add handicap tables

**Files:**
- Modify: `supabase/schema.sql` (append new section at the end)

**Interfaces:**
- Produces (consumed by Task 4): tables `handicap_rounds` (`id, player_slug, course_id, tee_set_id, tee_set_name, rating, slope, date_played, tee_time, total_score, differential, created_at`) and `handicap_round_holes` (`id, round_id, hole, par, yards, score, putts, fir, gir`).
- Depends on: `live_courses.tee_sets` (jsonb), added by the *separate, not-yet-merged-into-schema.sql* migration file `supabase/course_library_tee_setups.sql` (see spec's Background section). This task folds that same column addition into `schema.sql` too (idempotent — `add column if not exists` is a safe no-op whether or not it was already applied), so `schema.sql` stops being out of sync with what's actually needed.

This task has no automated test — it's a SQL/documentation change plus a manual production step. That manual step is a hard prerequisite for every later task's code to actually work against real data, even though later tasks' *unit* tests don't touch a live database (matching this repo's existing convention — see Task 2's note).

- [ ] **Step 1: Append the schema changes**

Add this section to the end of `supabase/schema.sql`:

```sql
-- === Player Handicap Tracker ================================================
-- Personal (non-tournament) rounds a player logs from /portal to build a real
-- WHS handicap index. Deliberately separate from live_hole_scores (tournament
-- rounds) and archived_scorecard_rounds (Tiger-entered historical tournament
-- scorecards) — this is player-entered, not tournament-tied, and private to
-- the player (plus Tiger) rather than publicly readable.
--
-- Depends on live_courses.tee_sets (jsonb), added by
-- supabase/course_library_tee_setups.sql. Repeated here (idempotently) so
-- schema.sql stops being out of sync with what this feature needs — this
-- repo has hit exactly this "migration file exists but wasn't captured in
-- schema.sql, and might not have been run in production" gap before (the
-- Courses & Format phase).
alter table live_courses add column if not exists tee_sets jsonb not null default '[]'::jsonb;

create table if not exists handicap_rounds (
  id uuid primary key default gen_random_uuid(),
  player_slug text not null references player_slots(player_slug),
  course_id uuid not null references live_courses(id),
  tee_set_id text not null,
  tee_set_name text not null,       -- snapshot: a later course-library edit must never change a past round's math
  rating numeric not null,
  slope integer not null check (slope between 55 and 155),
  date_played date not null,
  tee_time text,                    -- freeform "HH:MM", no timezone concerns for a personal round
  total_score integer not null,
  differential numeric not null,    -- (total_score - rating) * 113 / slope, rounded to 1 decimal
  created_at timestamptz not null default now()
);
create index if not exists handicap_rounds_player_idx on handicap_rounds (player_slug, date_played desc);

create table if not exists handicap_round_holes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references handicap_rounds(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  par integer not null,
  yards integer not null,
  score integer not null,
  putts integer not null,
  fir text not null check (fir in ('0', '1', 'X')),
  gir boolean not null,
  unique (round_id, hole)
);

alter table handicap_rounds enable row level security;
alter table handicap_round_holes enable row level security;

-- Private to the player (plus service-role, which bypasses RLS entirely for
-- every write and for the Route Handlers' own reads) — unlike live_courses/
-- live_hole_scores, this is not public tournament data. Matches
-- profiles_select_own's auth.uid()-based pattern rather than the
-- "select using (true)" pattern used for public live_* tables.
drop policy if exists handicap_rounds_select_own on handicap_rounds;
create policy handicap_rounds_select_own on handicap_rounds for select
  using (player_slug = (select player_slug from profiles where id = auth.uid()));

drop policy if exists handicap_round_holes_select_own on handicap_round_holes;
create policy handicap_round_holes_select_own on handicap_round_holes for select
  using (round_id in (select id from handicap_rounds where player_slug = (select player_slug from profiles where id = auth.uid())));
```

- [ ] **Step 2: Run it against production and confirm**

Give the user this exact block to paste into the Supabase SQL Editor (production project), and wait for them to confirm it ran without error before treating this task as done — do not assume it succeeded. If `live_courses.tee_sets` already exists (from `course_library_tee_setups.sql` having been run separately), the `alter table ... add column if not exists` line is a safe no-op; the two `create table` statements are new either way.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): add handicap_rounds/handicap_round_holes tables

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: WHS calculation module

**Files:**
- Create: `lib/handicap/whs.ts`
- Test: `lib/handicap/whs.test.ts`

**Interfaces:**
- Produces (consumed by Task 4): `calculateDifferential(totalScore: number, rating: number, slope: number): number`, `calculateHandicapIndex(differentials: number[]): number | null` (caller passes only the relevant most-recent-≤20 differentials — this function does not know about dates), `calculateLowIndex(differentialsChronological: number[]): number | null` (caller passes ALL of a player's differentials, oldest first).

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/handicap/whs.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "./whs.ts";

test("calculateDifferential matches the WHS formula, rounded to 1 decimal", () => {
  // (90 - 72.4) * 113 / 130 = 15.303... -> 15.3
  assert.equal(calculateDifferential(90, 72.4, 130), 15.3);
  // (78 - 71.0) * 113 / 120 = 6.5917 -> 6.6
  assert.equal(calculateDifferential(78, 71.0, 120), 6.6);
});

test("calculateHandicapIndex returns null with no rounds", () => {
  assert.equal(calculateHandicapIndex([]), null);
});

test("calculateHandicapIndex with 1 round: that differential minus 2.0", () => {
  assert.equal(calculateHandicapIndex([10.0]), 8.0);
});

test("calculateHandicapIndex with 3 rounds: lowest 1, no adjustment", () => {
  assert.equal(calculateHandicapIndex([10.0, 5.0, 8.0]), 5.0);
});

test("calculateHandicapIndex with 5 rounds: lowest 1 plus 2.0", () => {
  assert.equal(calculateHandicapIndex([10.0, 5.0, 8.0, 12.0, 6.0]), 7.0);
});

test("calculateHandicapIndex with 8 rounds: lowest 2 averaged, no adjustment", () => {
  const diffs = [10.0, 5.0, 8.0, 12.0, 6.0, 9.0, 11.0, 4.0];
  // lowest 2: 4.0, 5.0 -> avg 4.5
  assert.equal(calculateHandicapIndex(diffs), 4.5);
});

test("calculateHandicapIndex with 20 rounds: lowest 8 averaged", () => {
  const diffs = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
  // lowest 8: 1..8 -> avg 4.5
  assert.equal(calculateHandicapIndex(diffs), 4.5);
});

test("calculateHandicapIndex caps at the most recent 20 even if more are passed", () => {
  const diffs = Array.from({ length: 25 }, () => 20.0);
  diffs[24] = 1.0; // a 25th entry should never be considered
  assert.equal(calculateHandicapIndex(diffs), 20.0);
});

test("calculateLowIndex tracks the minimum index across round history", () => {
  // After round 1 ([10]): 1 round used, -2.0 adj -> index 8.0.
  // After round 2 ([10,5]): 2 rounds, lowest 1 (5.0), -1.0 adj -> index 4.0 (lowest so far).
  // After round 3 ([10,5,8]): 3 rounds, lowest 1 (5.0), no adj -> index 5.0.
  // Minimum across all three points-in-time is 4.0.
  assert.equal(calculateLowIndex([10.0, 5.0, 8.0]), 4.0);
});

test("calculateLowIndex returns null with no rounds", () => {
  assert.equal(calculateLowIndex([]), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test lib/handicap/whs.test.ts`
Expected: FAIL with `Cannot find module './whs.ts'` (or similar)

- [ ] **Step 3: Write the implementation**

```typescript
// lib/handicap/whs.ts
/**
 * USGA World Handicap System math: differential per round, and Handicap
 * Index as the (adjusted) average of the best differentials from a player's
 * most recent rounds. Deliberately excludes the Playing Conditions
 * Calculation (PCC) and the official soft-cap/hard-cap rules that limit how
 * fast a real GHIN index can rise — see the design spec's "Out of scope".
 */

interface RoundsUsedRow {
  use: number;
  adjustment: number;
}

// Index 0 = 1 round used, index 19 = 20 rounds used. Official WHS table.
const ROUNDS_USED_TABLE: RoundsUsedRow[] = [
  { use: 1, adjustment: -2.0 }, // 1 round
  { use: 1, adjustment: -1.0 }, // 2
  { use: 1, adjustment: 0 },    // 3
  { use: 1, adjustment: 1.0 },  // 4
  { use: 1, adjustment: 2.0 },  // 5
  { use: 2, adjustment: -1.0 }, // 6
  { use: 2, adjustment: 0 },    // 7
  { use: 2, adjustment: 0 },    // 8
  { use: 3, adjustment: 0 },    // 9
  { use: 3, adjustment: 0 },    // 10
  { use: 3, adjustment: 0 },    // 11
  { use: 4, adjustment: 0 },    // 12
  { use: 4, adjustment: 0 },    // 13
  { use: 4, adjustment: 0 },    // 14
  { use: 5, adjustment: 0 },    // 15
  { use: 5, adjustment: 0 },    // 16
  { use: 6, adjustment: 0 },    // 17
  { use: 6, adjustment: 0 },    // 18
  { use: 7, adjustment: 0 },    // 19
  { use: 8, adjustment: 0 },    // 20
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculateDifferential(totalScore: number, rating: number, slope: number): number {
  return round1(((totalScore - rating) * 113) / slope);
}

/**
 * `differentials` must already be limited by the caller to the rounds that
 * should count (most recent ones) — this function only knows counts and
 * values, never dates. Any extra entries past 20 are dropped defensively.
 */
export function calculateHandicapIndex(differentials: number[]): number | null {
  if (differentials.length === 0) return null;
  const considered = differentials.slice(0, 20);
  const row = ROUNDS_USED_TABLE[considered.length - 1];
  const lowest = [...considered].sort((a, b) => a - b).slice(0, row.use);
  const average = lowest.reduce((sum, d) => sum + d, 0) / lowest.length;
  return round1(average + row.adjustment);
}

/**
 * `differentialsChronological` must be ALL of a player's differentials,
 * oldest first. Replays what the Handicap Index would have been after each
 * round (using only that round and the ones before it, capped at the most
 * recent 20 as of that point) and returns the lowest index ever reached.
 */
export function calculateLowIndex(differentialsChronological: number[]): number | null {
  let low: number | null = null;
  for (let i = 0; i < differentialsChronological.length; i++) {
    const windowStart = Math.max(0, i + 1 - 20);
    const asOfThisRound = differentialsChronological.slice(windowStart, i + 1);
    const index = calculateHandicapIndex(asOfThisRound);
    if (index !== null && (low === null || index < low)) low = index;
  }
  return low;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/handicap/whs.test.ts`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/handicap/whs.ts lib/handicap/whs.test.ts
git commit -m "feat(handicap): add WHS differential/index calculation module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Shared types + input validation

**Files:**
- Create: `lib/handicap/types.ts`
- Create: `lib/handicap/validate.ts`
- Test: `lib/handicap/validate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (consumed by Task 4, Task 5, Task 6, and the wizard components in Tasks 8-10): types `HandicapHoleInput`, `HandicapCourseTeeSet`, `HandicapCourseOption`, `HandicapRoundSummary`, `HandicapSummary`, `SubmitHandicapRoundInput` (all in `lib/handicap/types.ts`); function `validateSubmitInput(input: SubmitHandicapRoundInput): { ok: true } | { ok: false; error: string }` (in `lib/handicap/validate.ts`).

- [ ] **Step 1: Write the types**

```typescript
// lib/handicap/types.ts
export interface HandicapHoleInput {
  hole: number;   // 1-18
  score: number;
  putts: number;
  fir: boolean;   // ignored for par-3 holes — server always records 'X' there
  gir: boolean;
}

export interface HandicapCourseTeeSet {
  id: string;
  name: string;
  rating: number;
  slope: number;
  holes: { number: number; par: number; yards: number }[];
}

export interface HandicapCourseOption {
  id: string;
  name: string;
  teeSets: HandicapCourseTeeSet[];
}

export interface HandicapRoundSummary {
  id: string;
  courseName: string;
  teeSetName: string;
  rating: number;
  slope: number;
  datePlayed: string; // ISO date, e.g. "2026-09-07"
  teeTime: string | null;
  totalScore: number;
  differential: number;
}

export interface HandicapSummary {
  index: number | null;
  lowIndex: number | null;
  rounds: HandicapRoundSummary[];
}

export interface SubmitHandicapRoundInput {
  courseId: string;
  teeSetId: string;
  datePlayed: string; // ISO date
  teeTime: string | null;
  holes: HandicapHoleInput[]; // exactly 18, each hole 1-18 exactly once
}
```

- [ ] **Step 2: Write the failing tests for validation**

```typescript
// lib/handicap/validate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSubmitInput } from "./validate.ts";
import type { HandicapHoleInput, SubmitHandicapRoundInput } from "./types.ts";

function validHoles(): HandicapHoleInput[] {
  return Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, score: 4, putts: 2, fir: true, gir: true }));
}

function validInput(overrides: Partial<SubmitHandicapRoundInput> = {}): SubmitHandicapRoundInput {
  return { courseId: "course-1", teeSetId: "tee-1", datePlayed: "2026-09-07", teeTime: "8:15 AM", holes: validHoles(), ...overrides };
}

test("validateSubmitInput accepts a well-formed submission", () => {
  assert.deepEqual(validateSubmitInput(validInput()), { ok: true });
});

test("validateSubmitInput rejects a missing course", () => {
  const result = validateSubmitInput(validInput({ courseId: "" }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a bad date format", () => {
  const result = validateSubmitInput(validInput({ datePlayed: "09/07/2026" }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects fewer than 18 holes", () => {
  const result = validateSubmitInput(validInput({ holes: validHoles().slice(0, 17) }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a duplicate hole number", () => {
  const holes = validHoles();
  holes[1] = { ...holes[1], hole: 1 }; // hole 1 entered twice, hole 2 missing
  const result = validateSubmitInput(validInput({ holes }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a hole with no score", () => {
  const holes = validHoles();
  // @ts-expect-error deliberately invalid for the test
  holes[0] = { ...holes[0], score: undefined };
  const result = validateSubmitInput(validInput({ holes }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a negative putts count", () => {
  const holes = validHoles();
  holes[0] = { ...holes[0], putts: -1 };
  const result = validateSubmitInput(validInput({ holes }));
  assert.equal(result.ok, false);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx tsx --test lib/handicap/validate.test.ts`
Expected: FAIL with `Cannot find module './validate.ts'`

- [ ] **Step 4: Write the implementation**

```typescript
// lib/handicap/validate.ts
import type { SubmitHandicapRoundInput } from "./types.ts";

type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateSubmitInput(input: SubmitHandicapRoundInput): ValidationResult {
  if (typeof input.courseId !== "string" || !input.courseId) return { ok: false, error: "Course is required." };
  if (typeof input.teeSetId !== "string" || !input.teeSetId) return { ok: false, error: "Tee set is required." };
  if (typeof input.datePlayed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.datePlayed)) {
    return { ok: false, error: "A valid date played is required." };
  }
  if (!Array.isArray(input.holes) || input.holes.length !== 18) {
    return { ok: false, error: "All 18 holes are required." };
  }

  const seenHoles = new Set<number>();
  for (const hole of input.holes) {
    if (typeof hole.hole !== "number" || hole.hole < 1 || hole.hole > 18) {
      return { ok: false, error: "Invalid hole number." };
    }
    if (seenHoles.has(hole.hole)) {
      return { ok: false, error: `Hole ${hole.hole} was entered more than once.` };
    }
    seenHoles.add(hole.hole);
    if (typeof hole.score !== "number" || hole.score < 1) {
      return { ok: false, error: `Hole ${hole.hole} needs a score.` };
    }
    if (typeof hole.putts !== "number" || hole.putts < 0) {
      return { ok: false, error: `Hole ${hole.hole} needs a valid putts count.` };
    }
  }
  if (seenHoles.size !== 18) return { ok: false, error: "All 18 holes are required." };

  return { ok: true };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --test lib/handicap/validate.test.ts`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add lib/handicap/types.ts lib/handicap/validate.ts lib/handicap/validate.test.ts
git commit -m "feat(handicap): add shared types and round-submission validation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Data access layer

**Files:**
- Create: `lib/handicap/data.ts`
- Test: `lib/handicap/data.test.ts`

**Interfaces:**
- Consumes: `calculateDifferential`, `calculateHandicapIndex`, `calculateLowIndex` (Task 2); `validateSubmitInput` (Task 3); types from Task 3; `createSupabaseServiceRoleClient` (`lib/supabase/server.ts`, existing).
- Produces (consumed by Task 5, Task 6, Task 7, Task 11): `mapCourseRow(row: { id: string; name: string; tee_sets: unknown }): HandicapCourseOption` (pure, exported for direct testing), `getCourseLibraryForHandicap(): Promise<HandicapCourseOption[]>`, `getHandicapSummaryForPlayer(playerSlug: string): Promise<HandicapSummary>`, `submitHandicapRound(playerSlug: string, input: SubmitHandicapRoundInput): Promise<{ ok: true; roundId: string } | { ok: false; error: string }>`.

Only `mapCourseRow` is unit-tested directly — the other three call `createSupabaseServiceRoleClient()`, which needs real Supabase credentials to do anything, matching this repo's existing convention of not hitting a live database from `node:test` (see `lib/live/currentRoundForPlayer.ts`'s comment: "Not unit tested... the actual selection rule is where the real logic lives and is fully tested"). Their correctness is verified by Task 1's manual DB step plus the manual walkthrough in Task 10.

- [ ] **Step 1: Write the failing test for the pure row-mapper**

```typescript
// lib/handicap/data.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCourseRow } from "./data.ts";

test("mapCourseRow keeps only well-formed tee sets", () => {
  const row = {
    id: "course-1",
    name: "Pebble Beach",
    tee_sets: [
      { id: "blue", name: "Blue", rating: 74.5, slope: 142, holes: [{ number: 1, par: 4, yards: 400 }] },
      { id: "no-rating", name: "White", rating: null, slope: null, holes: [] }, // never set up — must be dropped
      { id: "broken" }, // malformed — must be dropped
    ],
  };
  const result = mapCourseRow(row);
  assert.equal(result.id, "course-1");
  assert.equal(result.name, "Pebble Beach");
  assert.equal(result.teeSets.length, 1);
  assert.equal(result.teeSets[0].id, "blue");
});

test("mapCourseRow handles a non-array tee_sets value", () => {
  const result = mapCourseRow({ id: "course-2", name: "Some Course", tee_sets: null });
  assert.deepEqual(result.teeSets, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/handicap/data.test.ts`
Expected: FAIL with `Cannot find module './data.ts'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/handicap/data.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "./whs";
import { validateSubmitInput } from "./validate";
import type { HandicapCourseOption, HandicapCourseTeeSet, HandicapRoundSummary, HandicapSummary, SubmitHandicapRoundInput } from "./types";

interface CourseRow {
  id: string;
  name: string;
  tee_sets: unknown;
}

function isWellFormedTeeSet(value: unknown): value is HandicapCourseTeeSet {
  const t = value as Partial<HandicapCourseTeeSet> | null;
  return (
    !!t &&
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.rating === "number" &&
    typeof t.slope === "number" &&
    Array.isArray(t.holes)
  );
}

/** Pure — no I/O — so it's directly unit-testable without a live Supabase instance. */
export function mapCourseRow(row: CourseRow): HandicapCourseOption {
  const teeSets = Array.isArray(row.tee_sets) ? row.tee_sets.filter(isWellFormedTeeSet) : [];
  return { id: row.id, name: row.name, teeSets };
}

export async function getCourseLibraryForHandicap(): Promise<HandicapCourseOption[]> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_courses").select("id, name, tee_sets").order("name");
  if (error) throw new Error("Could not load the course library.");
  return (data ?? []).map(mapCourseRow).filter((course) => course.teeSets.length > 0);
}

interface RoundRow {
  id: string;
  tee_set_name: string;
  rating: number;
  slope: number;
  date_played: string;
  tee_time: string | null;
  total_score: number;
  differential: number;
  live_courses: { name: string } | { name: string }[] | null;
}

function courseNameFromJoin(joined: RoundRow["live_courses"]): string {
  if (!joined) return "Unknown course";
  return Array.isArray(joined) ? (joined[0]?.name ?? "Unknown course") : joined.name;
}

export async function getHandicapSummaryForPlayer(playerSlug: string): Promise<HandicapSummary> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("handicap_rounds")
    .select("id, tee_set_name, rating, slope, date_played, tee_time, total_score, differential, live_courses(name)")
    .eq("player_slug", playerSlug)
    .order("date_played", { ascending: false });
  if (error) throw new Error("Could not load handicap rounds.");

  const rows = (data ?? []) as unknown as RoundRow[];
  const rounds: HandicapRoundSummary[] = rows.map((row) => ({
    id: row.id,
    courseName: courseNameFromJoin(row.live_courses),
    teeSetName: row.tee_set_name,
    rating: row.rating,
    slope: row.slope,
    datePlayed: row.date_played,
    teeTime: row.tee_time,
    totalScore: row.total_score,
    differential: row.differential,
  }));

  const mostRecent20Differentials = rounds.slice(0, 20).map((r) => r.differential);
  const chronologicalDifferentials = [...rounds].reverse().map((r) => r.differential);

  return {
    index: calculateHandicapIndex(mostRecent20Differentials),
    lowIndex: calculateLowIndex(chronologicalDifferentials),
    rounds,
  };
}

export async function submitHandicapRound(
  playerSlug: string,
  input: SubmitHandicapRoundInput
): Promise<{ ok: true; roundId: string } | { ok: false; error: string }> {
  const validation = validateSubmitInput(input);
  if (!validation.ok) return validation;

  const service = createSupabaseServiceRoleClient();
  const { data: courseRow, error: courseError } = await service
    .from("live_courses")
    .select("id, name, tee_sets")
    .eq("id", input.courseId)
    .maybeSingle();
  if (courseError || !courseRow) return { ok: false, error: "Course not found." };

  const course = mapCourseRow(courseRow as CourseRow);
  const teeSet = course.teeSets.find((t) => t.id === input.teeSetId);
  if (!teeSet) return { ok: false, error: "Tee set not found." };

  const holeInfoByNumber = new Map(teeSet.holes.map((h) => [h.number, h]));
  for (const hole of input.holes) {
    if (!holeInfoByNumber.has(hole.hole)) return { ok: false, error: `Tee set has no data for hole ${hole.hole}.` };
  }

  const totalScore = input.holes.reduce((sum, h) => sum + h.score, 0);
  const differential = calculateDifferential(totalScore, teeSet.rating, teeSet.slope);

  const { data: roundRow, error: roundError } = await service
    .from("handicap_rounds")
    .insert({
      player_slug: playerSlug,
      course_id: course.id,
      tee_set_id: teeSet.id,
      tee_set_name: teeSet.name,
      rating: teeSet.rating,
      slope: teeSet.slope,
      date_played: input.datePlayed,
      tee_time: input.teeTime,
      total_score: totalScore,
      differential,
    })
    .select("id")
    .single();
  if (roundError || !roundRow) return { ok: false, error: "Could not save this round." };

  const holeRows = input.holes.map((hole) => {
    const info = holeInfoByNumber.get(hole.hole)!;
    return {
      round_id: roundRow.id,
      hole: hole.hole,
      par: info.par,
      yards: info.yards,
      score: hole.score,
      putts: hole.putts,
      fir: info.par === 3 ? "X" : hole.fir ? "1" : "0",
      gir: hole.gir,
    };
  });

  const { error: holesError } = await service.from("handicap_round_holes").insert(holeRows);
  if (holesError) {
    await service.from("handicap_rounds").delete().eq("id", roundRow.id);
    return { ok: false, error: "Could not save this round's holes. Please try again." };
  }

  return { ok: true, roundId: roundRow.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/handicap/data.test.ts`
Expected: both tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/handicap/data.ts lib/handicap/data.test.ts
git commit -m "feat(handicap): add course library + round data access layer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Courses API route

**Files:**
- Create: `app/api/portal/handicap/courses/route.ts`
- Test: `app/api/portal/handicap/courses/route.test.ts`

**Interfaces:**
- Consumes: `requirePlayer` (`lib/portal/requirePlayer.ts`, existing); `getCourseLibraryForHandicap` (Task 4).
- Produces: `GET` handler returning `{ ok: true, courses: HandicapCourseOption[] }` or `{ ok: false, error }`.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/portal/handicap/courses/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /api/portal/handicap/courses rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  await assert.rejects(() => GET());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/api/portal/handicap/courses/route.test.ts`
Expected: FAIL with `Cannot find module './route.ts'`

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/portal/handicap/courses/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getCourseLibraryForHandicap } from "@/lib/handicap/data";

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  try {
    const courses = await getCourseLibraryForHandicap();
    return NextResponse.json({ ok: true, courses }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load the course library." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/api/portal/handicap/courses/route.test.ts`
Expected: PASS

Note: this test passes once `requirePlayer()` throws (calling `createSupabaseServerClient()`'s `cookies()` outside a real Next.js request lifecycle) — the same documented limitation `app/api/portal/scoring/state/route.test.ts` and `lib/portal/requirePlayer.test.mts` already rely on. It is not exercising the 401 JSON path itself, only that an unauthenticated call never reaches `getCourseLibraryForHandicap()`.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/handicap/courses/route.ts app/api/portal/handicap/courses/route.test.ts
git commit -m "feat(handicap): add player-facing course library read endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Rounds API route (list + submit)

**Files:**
- Create: `app/api/portal/handicap/rounds/route.ts`
- Test: `app/api/portal/handicap/rounds/route.test.ts`

**Interfaces:**
- Consumes: `requirePlayer` (existing); `getHandicapSummaryForPlayer`, `submitHandicapRound` (Task 4); `SubmitHandicapRoundInput` (Task 3).
- Produces: `GET` → `{ ok: true, index, lowIndex, rounds }`; `POST` → `{ ok: true, roundId }` (200) or `{ ok: false, error }` (400).

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/portal/handicap/rounds/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /api/portal/handicap/rounds rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  await assert.rejects(() => GET());
});

test("POST /api/portal/handicap/rounds rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/handicap/rounds", {
    method: "POST",
    body: JSON.stringify({ courseId: "c1", teeSetId: "t1", datePlayed: "2026-09-07", teeTime: null, holes: [] }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test app/api/portal/handicap/rounds/route.test.ts`
Expected: FAIL with `Cannot find module './route.ts'`

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/portal/handicap/rounds/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getHandicapSummaryForPlayer, submitHandicapRound } from "@/lib/handicap/data";
import type { SubmitHandicapRoundInput } from "@/lib/handicap/types";

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  try {
    const summary = await getHandicapSummaryForPlayer(player.playerSlug);
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load your rounds." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const body = (await request.json()) as SubmitHandicapRoundInput;
  const result = await submitHandicapRound(player.playerSlug, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test app/api/portal/handicap/rounds/route.test.ts`
Expected: both PASS (same auth-throws-before-DB-access reasoning as Task 5)

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/handicap/rounds/route.ts app/api/portal/handicap/rounds/route.test.ts
git commit -m "feat(handicap): add rounds list/submit endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: "My Handicap" home page (replaces tournament scoring status screen)

**Files:**
- Create: `components/portal/handicap/HandicapHome.tsx`
- Modify: `app/portal/scoring/page.tsx` (full rewrite)
- Delete: `components/portal/ScoringStatusScreen.tsx` (only caller is the file being rewritten — confirmed via repo-wide search; tournament live scoring stays reachable through `/portal/scoring/play`, linked directly from `app/portal/page.tsx`'s My Match section)

**Interfaces:**
- Consumes: `requirePlayer` pattern used by every other portal page (inlined the same way `app/portal/scoring/page.tsx` already does it); `getHandicapSummaryForPlayer` (Task 4); `HandicapSummary`/`HandicapRoundSummary` (Task 3).
- Produces: nothing consumed by later tasks except the route `/portal/scoring/new` this page links to (built in Task 8).

No automated test — this repo has no component-level test coverage (`components/**/*.test.tsx` doesn't exist anywhere in the repo today); verified via `npx tsc --noEmit`, `npm run build`, and a manual browser walkthrough at the end of Task 10.

- [ ] **Step 1: Write the presentational component**

```typescript
// components/portal/handicap/HandicapHome.tsx
import Image from "next/image";
import Link from "next/link";
import type { HandicapSummary } from "@/lib/handicap/types";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function HandicapHome({ playerName, summary }: { playerName: string; summary: HandicapSummary }) {
  return (
    <main className="w-full pb-10">
      <section className="relative isolate overflow-hidden bg-maroon-950">
        <div className="relative aspect-[16/7] min-h-52 sm:min-h-64">
          <Image src="/loading/desktop.png" alt="Maroon Masters course view" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-maroon-950/90 via-maroon-950/40 to-transparent" />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-6">
          <div>
            <p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-white/75">{playerName}</p>
            <p className="mt-1 font-serif text-4xl font-bold leading-none">{summary.index != null ? summary.index.toFixed(1) : "—"}</p>
            <p className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/75">Handicap Index</p>
          </div>
          <div className="text-right">
            <p className="font-serif text-xl font-bold leading-none">{summary.lowIndex != null ? summary.lowIndex.toFixed(1) : "—"}</p>
            <p className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white/75">Low Index</p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-4 max-w-4xl px-4 sm:px-6">
        <Link
          href="/portal/scoring/new"
          className="block w-full rounded-pill bg-maroon-700 px-4 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-maroon-800"
        >
          Submit a score
        </Link>
      </section>

      <section className="mx-auto mt-6 max-w-4xl px-4 sm:px-6">
        <h2 className="font-serif text-xl font-bold text-ink-900">Scores</h2>
        {summary.rounds.length === 0 ? (
          <p className="mt-3 font-sans text-sm text-ink-500">No rounds yet — submit your first score above.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {summary.rounds.map((round) => (
              <article key={round.id} className="rounded-lg border border-stone-300 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-base font-bold text-ink-900">{round.courseName}</h3>
                    <p className="mt-0.5 font-sans text-xs text-ink-500">{round.teeSetName} · Rating {round.rating} · Slope {round.slope}</p>
                  </div>
                  <p className="font-sans text-xs text-ink-500">{formatDate(round.datePlayed)}</p>
                </div>
                <div className="mt-2 flex items-baseline gap-4">
                  <span className="font-serif text-2xl font-bold text-ink-900">{round.totalScore}</span>
                  <span className="font-sans text-sm text-ink-600">Differential {round.differential.toFixed(1)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Rewrite the page**

```typescript
// app/portal/scoring/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
import { HandicapHome } from "@/components/portal/handicap/HandicapHome";

export default async function ScoringPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_host, player_slug, display_name")
    .eq("id", user.id)
    .single();

  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");
  if (profile.is_host) redirect("/portal/admin");

  const playerSlug = profile.player_slug!;
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  const playerName = playerProfile?.fullName ?? profile.display_name ?? "Player";
  const summary = await getHandicapSummaryForPlayer(playerSlug);

  return <HandicapHome playerName={playerName} summary={summary} />;
}
```

- [ ] **Step 3: Delete the retired component**

```bash
git rm components/portal/ScoringStatusScreen.tsx
```

- [ ] **Step 4: Verify the build is clean**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (in particular, confirm nothing else still imports `ScoringStatusScreen`)

- [ ] **Step 5: Commit**

```bash
git add components/portal/handicap/HandicapHome.tsx app/portal/scoring/page.tsx
git commit -m "feat(handicap): replace tournament scoring status screen with My Handicap home

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Round setup step + wizard shell

**Files:**
- Create: `app/portal/scoring/new/page.tsx`
- Create: `components/portal/handicap/HandicapRoundWizard.tsx`

**Interfaces:**
- Consumes: `getCourseLibraryForHandicap` (Task 4); `HandicapCourseOption`, `HandicapCourseTeeSet`, `HandicapHoleInput` (Task 3).
- Produces (consumed by Task 9 and Task 10): the wizard's internal step state shape — `{ step: "setup" } | { step: "holes"; setup: RoundSetup } | { step: "review"; setup: RoundSetup; holes: HandicapHoleInput[] }`, where `RoundSetup = { course: HandicapCourseOption; teeSet: HandicapCourseTeeSet; datePlayed: string; teeTime: string }`. Task 9 renders the `"holes"` step, Task 10 renders the `"review"` step — both as children of this same component, so this task's placeholder rendering for those steps gets replaced, not duplicated.

No automated test — client-side form/wizard UI, matching Task 7's reasoning. Verified via `tsc`/`build` plus the Task 10 manual walkthrough.

- [ ] **Step 1: Write the page**

```typescript
// app/portal/scoring/new/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCourseLibraryForHandicap } from "@/lib/handicap/data";
import { HandicapRoundWizard } from "@/components/portal/handicap/HandicapRoundWizard";

export default async function NewHandicapRoundPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host, player_slug").eq("id", user.id).single();
  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");
  if (profile.is_host) redirect("/portal/admin");

  const courses = await getCourseLibraryForHandicap();

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-7">
      <HandicapRoundWizard courses={courses} />
    </div>
  );
}
```

- [ ] **Step 2: Write the wizard shell + setup step**

```typescript
// components/portal/handicap/HandicapRoundWizard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HandicapCourseOption, HandicapCourseTeeSet, HandicapHoleInput } from "@/lib/handicap/types";
import { HandicapHoleEntry } from "./HandicapHoleEntry";
import { HandicapRoundReview } from "./HandicapRoundReview";

export interface RoundSetup {
  course: HandicapCourseOption;
  teeSet: HandicapCourseTeeSet;
  datePlayed: string;
  teeTime: string;
}

type WizardState =
  | { step: "setup" }
  | { step: "holes"; setup: RoundSetup }
  | { step: "review"; setup: RoundSetup; holes: HandicapHoleInput[] };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function HandicapRoundWizard({ courses }: { courses: HandicapCourseOption[] }) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({ step: "setup" });
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [teeSetId, setTeeSetId] = useState(courses[0]?.teeSets[0]?.id ?? "");
  const [datePlayed, setDatePlayed] = useState(todayIso());
  const [teeTime, setTeeTime] = useState("");

  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;
  const selectedTeeSet = selectedCourse?.teeSets.find((t) => t.id === teeSetId) ?? null;

  if (courses.length === 0) {
    return <p className="font-sans text-sm text-ink-500">No courses are set up yet — ask Tiger to add one from the Course Library first.</p>;
  }

  if (state.step === "holes") {
    return (
      <HandicapHoleEntry
        teeSet={state.setup.teeSet}
        onBack={() => setState({ step: "setup" })}
        onComplete={(holes) => setState({ step: "review", setup: state.setup, holes })}
      />
    );
  }

  if (state.step === "review") {
    return (
      <HandicapRoundReview
        setup={state.setup}
        holes={state.holes}
        onBack={() => setState({ step: "holes", setup: state.setup })}
        onSubmitted={() => router.push("/portal/scoring")}
      />
    );
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Submit a score</h1>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Course</span>
          <select
            value={courseId}
            onChange={(e) => {
              const nextCourse = courses.find((c) => c.id === e.target.value);
              setCourseId(e.target.value);
              setTeeSetId(nextCourse?.teeSets[0]?.id ?? "");
            }}
            className="rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm"
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Tee set</span>
          <select value={teeSetId} onChange={(e) => setTeeSetId(e.target.value)} className="rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm">
            {selectedCourse?.teeSets.map((teeSet) => (
              <option key={teeSet.id} value={teeSet.id}>{teeSet.name} · Rating {teeSet.rating} · Slope {teeSet.slope}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Date played</span>
          <input type="date" value={datePlayed} onChange={(e) => setDatePlayed(e.target.value)} className="rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Tee time (optional)</span>
          <input type="time" value={teeTime} onChange={(e) => setTeeTime(e.target.value)} className="rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm" />
        </label>

        <button
          type="button"
          disabled={!selectedCourse || !selectedTeeSet}
          onClick={() => {
            if (!selectedCourse || !selectedTeeSet) return;
            setState({ step: "holes", setup: { course: selectedCourse, teeSet: selectedTeeSet, datePlayed, teeTime } });
          }}
          className="mt-2 rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          Start round
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

This task's component imports `HandicapHoleEntry` and `HandicapRoundReview`, built in Tasks 9-10 — commit together with Task 9 so the tree always type-checks (see Task 9's Step 1 note).

---

### Task 9: Hole-by-hole entry step

**Files:**
- Create: `components/portal/handicap/HandicapHoleEntry.tsx`

**Interfaces:**
- Consumes: `HandicapCourseTeeSet`, `HandicapHoleInput` (Task 3); rendered by `HandicapRoundWizard` (Task 8) via its `onComplete: (holes: HandicapHoleInput[]) => void` and `onBack: () => void` props.
- Produces (consumed by Task 8, already wired in Task 8's Step 2): the `HandicapHoleEntry` component itself.

Because Task 8's `HandicapRoundWizard.tsx` already imports this file and `HandicapRoundReview` (Task 10), the tree won't type-check until both exist — do Task 9 and Task 10 back-to-back before running `tsc`/committing either, or commit all three (Tasks 8-10) together. No automated test, same reasoning as Task 7/8.

- [ ] **Step 1: Write the component**

```typescript
// components/portal/handicap/HandicapHoleEntry.tsx
"use client";

import { useState } from "react";
import type { HandicapCourseTeeSet, HandicapHoleInput } from "@/lib/handicap/types";

type Draft = Record<number, { score: string; putts: string; fir: boolean; gir: boolean }>;

function emptyDraft(teeSet: HandicapCourseTeeSet): Draft {
  const draft: Draft = {};
  for (const hole of teeSet.holes) {
    draft[hole.number] = { score: "", putts: "", fir: false, gir: false };
  }
  return draft;
}

export function HandicapHoleEntry({
  teeSet,
  onBack,
  onComplete,
}: {
  teeSet: HandicapCourseTeeSet;
  onBack: () => void;
  onComplete: (holes: HandicapHoleInput[]) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(teeSet));
  const [error, setError] = useState<string | null>(null);

  function setField(holeNumber: number, field: keyof Draft[number], value: string | boolean) {
    setDraft((current) => ({ ...current, [holeNumber]: { ...current[holeNumber], [field]: value } }));
  }

  function handleContinue() {
    const holes: HandicapHoleInput[] = [];
    for (const hole of teeSet.holes) {
      const entry = draft[hole.number];
      const score = Number(entry?.score);
      if (!entry?.score || !score || score < 1) {
        setError(`Enter a score for hole ${hole.number}.`);
        return;
      }
      holes.push({ hole: hole.number, score, putts: Number(entry.putts) || 0, fir: entry.fir, gir: entry.gir });
    }
    setError(null);
    onComplete(holes);
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Enter your round</h1>
        <button type="button" onClick={onBack} className="font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Back</button>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {teeSet.holes.map((hole) => {
          const isPar3 = hole.par === 3;
          const entry = draft[hole.number];
          return (
            <div key={hole.number} className="flex flex-wrap items-center gap-2 border-b border-ink-100 py-2 last:border-b-0">
              <span className="w-16 font-sans text-sm font-semibold text-ink-900">Hole {hole.number}</span>
              <span className="w-14 font-sans text-xs text-ink-400">Par {hole.par}</span>
              <input
                type="number"
                min={1}
                placeholder="Score"
                value={entry.score}
                onChange={(e) => setField(hole.number, "score", e.target.value)}
                className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
              />
              <input
                type="number"
                min={0}
                placeholder="Putts"
                value={entry.putts}
                onChange={(e) => setField(hole.number, "putts", e.target.value)}
                className="w-16 rounded-sm border border-ink-200 px-2 py-1 font-sans text-sm"
              />
              {!isPar3 && (
                <label className="flex items-center gap-1 font-sans text-xs text-ink-500">
                  <input type="checkbox" checked={entry.fir} onChange={(e) => setField(hole.number, "fir", e.target.checked)} /> Fairway
                </label>
              )}
              <label className="flex items-center gap-1 font-sans text-xs text-ink-500">
                <input type="checkbox" checked={entry.gir} onChange={(e) => setField(hole.number, "gir", e.target.checked)} /> Green
              </label>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={handleContinue}
        className="mt-4 w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white"
      >
        Review round
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

Combine with Task 10's commit (see that task's Step 3) so the tree type-checks at the commit point.

---

### Task 10: Review + submit step, end-to-end verification

**Files:**
- Create: `components/portal/handicap/HandicapRoundReview.tsx`

**Interfaces:**
- Consumes: `RoundSetup` (Task 8, exported from `HandicapRoundWizard.tsx`); `HandicapHoleInput` (Task 3); calls `POST /api/portal/handicap/rounds` (Task 6).
- Produces: the `HandicapRoundReview` component, completing the wizard Task 8 already wired up.

- [ ] **Step 1: Write the component**

```typescript
// components/portal/handicap/HandicapRoundReview.tsx
"use client";

import { useState } from "react";
import type { HandicapHoleInput } from "@/lib/handicap/types";
import type { RoundSetup } from "./HandicapRoundWizard";

export function HandicapRoundReview({
  setup,
  holes,
  onBack,
  onSubmitted,
}: {
  setup: RoundSetup;
  holes: HandicapHoleInput[];
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalScore = holes.reduce((sum, h) => sum + h.score, 0);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/handicap/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: setup.course.id,
          teeSetId: setup.teeSet.id,
          datePlayed: setup.datePlayed,
          teeTime: setup.teeTime || null,
          holes,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not submit this round.");
        return;
      }
      onSubmitted();
    } catch {
      setError("Could not submit this round. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Review round</h1>
        <button type="button" onClick={onBack} disabled={submitting} className="font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Back</button>
      </div>
      <p className="mt-1 font-sans text-sm text-ink-600">{setup.course.name} · {setup.teeSet.name} · Rating {setup.teeSet.rating} · Slope {setup.teeSet.slope}</p>

      <div className="mt-3 flex flex-col gap-1">
        {holes.map((hole) => {
          const holeInfo = setup.teeSet.holes.find((h) => h.number === hole.hole)!;
          return (
            <div key={hole.hole} className="flex items-center gap-3 border-b border-ink-100 py-1.5 last:border-b-0 font-sans text-sm text-ink-700">
              <span className="w-16 font-semibold">Hole {hole.hole}</span>
              <span className="w-14 text-ink-400">Par {holeInfo.par}</span>
              <span className="w-20">Score {hole.score}</span>
              <span className="w-20">Putts {hole.putts}</span>
              <span className="w-24">{holeInfo.par === 3 ? "FIR n/a" : hole.fir ? "Fairway hit" : "Fairway missed"}</span>
              <span>{hole.gir ? "GIR" : "No GIR"}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 font-serif text-xl font-bold text-ink-900">Total: {totalScore}</p>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={handleSubmit}
        className="mt-4 w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify the whole feature type-checks and builds**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors across Tasks 7-10's files

- [ ] **Step 3: Commit Tasks 8-10 together**

```bash
git add components/portal/handicap/HandicapRoundWizard.tsx components/portal/handicap/HandicapHoleEntry.tsx components/portal/handicap/HandicapRoundReview.tsx app/portal/scoring/new/page.tsx
git commit -m "feat(handicap): add round setup, hole entry, and review/submit wizard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Manual walkthrough**

With a real Supabase project (Task 1's migration run) and at least one course with a saved tee set in the Course Library: log in as a player, go to `/portal`, tap "Submit a score", confirm it lands on "My Handicap" (not the old tournament status screen), tap "Submit a score" again, pick a course/tee set/date, enter all 18 holes, review, submit, and confirm the round appears on "My Handicap" with a sensible differential and the index updates per Task 2's table.

---

### Task 11: Wire the portal hero's real Handicap Index

**Files:**
- Modify: `app/portal/page.tsx:44` (and the surrounding data fetch)

**Interfaces:**
- Consumes: `getHandicapSummaryForPlayer` (Task 4).

- [ ] **Step 1: Fetch the summary and replace the hardcoded value**

In `app/portal/page.tsx`, add the import:

```typescript
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
```

Add the fetch alongside the existing `currentMatch` fetch (both are independent, so fetch them together):

```typescript
// was:
// const currentMatch = await findCurrentRoundForPlayer(playerSlug);
const [currentMatch, handicapSummary] = await Promise.all([
  findCurrentRoundForPlayer(playerSlug),
  getHandicapSummaryForPlayer(playerSlug),
]);
```

Replace the hardcoded hero value:

```typescript
// was:
// <p className="font-serif text-2xl font-bold leading-none">0.0</p>
<p className="font-serif text-2xl font-bold leading-none">{handicapSummary.index != null ? handicapSummary.index.toFixed(1) : "—"}</p>
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/portal/page.tsx
git commit -m "feat(handicap): wire the portal hero to the real handicap index

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** flow (Tasks 7-10), data model (Task 1), WHS math (Task 2), API surface (Tasks 5-6), portal hero wiring (Task 11), error handling (Task 4's cleanup-on-failure + every route's 400/401/500 paths), testing gate (every task's Step 2/4 + Task 10's Step 2) are all covered. Out-of-scope items (PCC/caps, predictions feature itself, adding courses from this flow, HCP Calculator/Lookup, editing/deleting rounds) have no task — correctly, per spec.
- **Type consistency:** `HandicapHoleInput`/`HandicapCourseOption`/`HandicapCourseTeeSet`/`HandicapRoundSummary`/`HandicapSummary`/`SubmitHandicapRoundInput` (Task 3) are used with identical shapes in Tasks 4-10; `RoundSetup` (defined in Task 8) is imported by name in Task 10, not redefined.
- **Migration risk:** Task 1 is intentionally the first task and calls out — twice — that its production SQL step must be confirmed before trusting later tasks' behavior against real data, matching this repo's established gotcha with undocumented schema changes.
