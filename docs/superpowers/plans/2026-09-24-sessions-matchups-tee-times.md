# Sessions, Session Tee Times & Matchups Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the live/upcoming tournament's "Round" concept to "Session" everywhere it's shown or coded, add 3 Pacific-Time tee-time slots to each Session (Courses & Format page), have those locked tee times flow automatically into each Matchups match's own start time, and redesign the Matchups page to show, per format, who scores for whom.

**Architecture:** This is one continuous data-flow change, not four independent features: `lib/live/types.ts`'s core types get renamed and gain a `matchTeeTimes` field; a new pure helper (`lib/live/sessionTeeTimes.ts`) converts a typed Pacific time + a session's date into the absolute instant each match already uses to auto-transition Scheduled → Armed → Live (that mechanism, `effectiveMatchState`, is untouched — only what feeds its `teeTime` input changes); the API routes and the two admin panels are updated in dependency order (types → routes → pages → panels); a final sweep renames the remaining "Round"/"Box" UI text and converts a handful of already-shipped Central-Time tee-time displays to Pacific.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres), `node:test` for unit tests.

**Spec:** [docs/superpowers/specs/2026-09-24-sessions-matchups-tee-times-design.md](../specs/2026-09-24-sessions-matchups-tee-times-design.md) — read it alongside this plan; the design decisions there (especially the rename boundary in §1) are assumed knowledge for every task below. Additional decisions made after that spec was written, folded in here:
- **Start Round stays a manual gate.** Locking a Session's tee times sets what each match's tee time *will be* once armed; it does **not** skip the existing "Start Round" button on `/portal/admin` (`StartRoundBanner`, soon `StartSessionBanner`). Tiger still presses it on the day to arm the round; from then on each match auto-flips Live at its own tee time, exactly as today.
- **Convert every existing Central-Time tee-time display to Pacific**, not just the new Session screens — see Task 12.

## Global Constraints

- **Rename scope (spec §1):** rename UI text and code identifiers for the live/upcoming tournament's numbered-round concept only. Do **not** touch: the Supabase table/column names (`live_round_state`, `round`, `box_number` stay exactly as they are — no migration for this); the historical/archived "Round" concept (`CareerRoundArchive.tsx`, `RoundFormatArchive.tsx`'s "Round INDI", `ArchiveTeeAssigner.tsx`, `roundLabel.ts`, `lib/data/archivedScorecards.ts`); the handicap system's own "round" (`RoundInProgressCard.tsx`, `RoundExit.tsx`); the shared historical `RealMatch` type and its `teeTimeCst`/`day`/`session` fields (used by hand-typed per-year files like `lib/data/2024-pinehurst.ts` — never touch those files' contents); `components/match/MatchProfile.tsx` (shared between live and legacy archived match display, falls back to `match.day`/`match.session`); `PlayerScoringPanel.tsx` (dead code — not imported anywhere in the app, confirmed by repo-wide search; leave it alone).
- **Generic "round of golf" vocabulary is not renamed.** "Submit Round," "Round complete," "Waiting For Round To Begin," "Upcoming Round"/"Round Live"/"Round Submitted" status headings, `RoundCardState`, `roundFinishedForPlayer`, and similar already-shipped Live Scoring Lifecycle copy/identifiers stay exactly as they are — they mean "a round of golf you're playing," not "which numbered session of the trip," and changing them would deviate from that separately-approved, already-shipped spec's exact wording.
- **The rename DOES apply** to every place a number is attached to the word "Round" for the live tournament (`Round {n}`, `LiveRoundState`, `LiveRoundState.round`, `TournamentSettings.roundCount`, `LiveMatchBox`, `LiveMatchBox.boxNumber`, `boxesPerRound()`, `playersPerTeamPerBox()`, `roundIsComplete()`, `findCurrentRoundForPlayer()` and its neighbors in `currentRoundForPlayer.ts`, `RoundBox` in `VenueSchedulePage.tsx`, `StartRoundBanner`, the `/api/portal/tiger/rounds*` and `/api/portal/tiger/matchboxes*` routes).
- **Read/write translation boundary.** Because the DB columns keep their old names, every place that reads a Supabase row assigns `session: row.round` (not `round: row.round`), and every place that writes one uses `{ round: value.session }` (the object key sent to Supabase is always the DB column name `round`/`box_number`, never `session`/`matchNumber`).
- **Tee times are Pacific Time everywhere**, both new and pre-existing displays (Task 6, 9, 12). Use `America/Los_Angeles` (tracks PST/PDT automatically) via `Intl.DateTimeFormat`, not a hardcoded UTC offset.
- Every task ends green on: the specific test file(s) it touches. Task 13 runs the full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` sweep.

## Review Focus

- **Singles' 6-match grouping into 3 tee times** — a match created for box/match 5 or 6 must resolve to `matchTeeTimes[2]`, not error or fall back to slot 0. Covered by Task 2's `teeTimeSlotForMatch` tests.
- **A Session with an unset tee-time slot cannot be locked** — locking must fail with a clear error if any of the 3 `matchTeeTimes` entries is null, the same way it already fails today for a missing date/course/format. Covered by Task 6.
- **DST boundary correctness** — a tee time typed in winter (PST, UTC-8) and one typed in summer (PDT, UTC-7) must both convert correctly; a naive fixed-offset implementation would be off by an hour for half the year. Covered by Task 2's tests.
- **Changing a Session's format after matches already exist** — the existing `rounds/route.ts` POST already deletes that session's match boxes when the format changes; after the rename this must still happen keyed on the renamed fields, and Singles' 6-match tee-time grouping must not leak into a Fourball session's 3-match assumption or vice versa. Covered by Task 6 (route logic is a straight rename, but the interaction with `matchTeeTimes` — a 3-slot array regardless of format — is verified by Task 6's test).
- **The public Schedule page and Wagers' Live Matches list must not crash for a Session with no `matchTeeTimes` set yet** (a brand-new season, tee times never entered) — `deriveMatchTeeTime` must return `null` rather than throw, and every display site must fall back to a "TBD" label rather than rendering `Invalid Date`. Covered by Task 2 (null-safety) and Task 9/12 (fallback text at each display site).

---

## File structure

**New:**
- `supabase/session_tee_times.sql` — migration adding `match_tee_times` to `live_round_state`.
- `lib/live/sessionTeeTimes.ts` + `lib/live/sessionTeeTimes.test.ts` — pure Pacific-time conversion and slot-grouping helpers.
- `app/api/portal/tiger/sessions/**` — renamed from `app/api/portal/tiger/rounds/**` (route.ts, lock/route.ts, remove/route.ts, start/route.ts, and their `.test.ts` files).
- `app/api/portal/tiger/matches/**` — renamed from `app/api/portal/tiger/matchboxes/**` (route.ts, remove/route.ts, start/route.ts, closeout/route.ts, and their `.test.ts` files).
- `components/portal/tiger/StartSessionBanner.tsx` — renamed from `StartRoundBanner.tsx`.

**Modified:** `lib/live/types.ts`, `lib/live/orchestration.ts` (+ test), `lib/live/currentRoundForPlayer.ts` (+ test), `lib/live/officialMatchState.ts`, `lib/live/syncLockedRound.ts`, `lib/live/matchProfile.ts` (+ test), `lib/live/playerProfile.ts` (+ test if present), `lib/live/publishOfficialMatchState.ts`, `lib/live/publishMatchOdds.ts`, `lib/live/previewMatchState.ts` (+ test), `lib/live/scoringPreviewRoom.ts`, `lib/portal/matchCards.ts`, `lib/data/liveRoundFormatArchive.ts`, `app/portal/admin/master-settings/[year]/courses-format/page.tsx`, `app/portal/admin/master-settings/[year]/matchups/page.tsx`, `components/portal/tiger/CoursesFormatPanel.tsx`, `components/portal/tiger/MatchupsPanel.tsx`, `components/portal/tiger/MatchCloseoutCards.tsx`, `components/portal/tiger/BroadcastControlsPanel.tsx`, `components/portal/tiger/TestSeasonPanel.tsx`, `components/portal/ScoringStatusScreen.tsx`, `components/schedule/VenueSchedulePage.tsx`, `components/wagers/LiveMatchesList.tsx`, `components/ui/RoundCountdown.tsx`, `app/portal/admin/page.tsx`, `project_specs.md`.

---

### Task 1: Migration — `match_tee_times` column

**Files:**
- Create: `supabase/session_tee_times.sql`

**Interfaces:**
- Produces: a `match_tee_times jsonb` column on `live_round_state`, default `[null, null, null]`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/session_tee_times.sql
-- Adds the 3 per-session match tee-time slots (Match 1/2/3, or Match 1&2 /
-- 3&4 / 5&6 for Singles) to live_round_state. Entered and interpreted by
-- the app as Pacific Time. Run once in the Supabase SQL Editor.
alter table live_round_state
  add column if not exists match_tee_times jsonb not null default '[null, null, null]'::jsonb;
```

- [ ] **Step 2: Run it against the local/dev Supabase project**

There is no automated migration runner in this repo (every other `supabase/*.sql` file, e.g. `hole_shot_directions.sql`, is a standalone script run by hand) — open the Supabase SQL Editor and run this file's contents once. Confirm with:

```sql
select column_name, data_type, column_default from information_schema.columns
where table_name = 'live_round_state' and column_name = 'match_tee_times';
```

Expected: one row, `jsonb`, default `'[null, null, null]'::jsonb`.

- [ ] **Step 3: Commit**

```bash
git add supabase/session_tee_times.sql
git commit -m "Add match_tee_times column to live_round_state"
```

---

### Task 2: `lib/live/sessionTeeTimes.ts` — Pacific time conversion (TDD)

**Files:**
- Create: `lib/live/sessionTeeTimes.ts`
- Test: `lib/live/sessionTeeTimes.test.ts`

**Interfaces:**
- Consumes: `MatchFormat` from `./types.ts` (not yet renamed at this point in the plan — Task 3 renames `types.ts`; write this task's import as `import type { MatchFormat } from "./types.ts";`, which keeps working after Task 3 since `MatchFormat` itself isn't renamed).
- Produces: `teeTimeSlotForMatch(format: MatchFormat, matchNumber: number): number`, `deriveMatchTeeTime(date: string | null, timeOfDay: string | null): Date | null`, `formatPacificTeeTime(date: Date): string`. Tasks 6, 9, 10, 12 all import from here.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/live/sessionTeeTimes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { deriveMatchTeeTime, formatPacificTeeTime, teeTimeSlotForMatch } from "./sessionTeeTimes.ts";

test("teeTimeSlotForMatch: Fourball/Foursome map each match 1:1 to a slot", () => {
  assert.equal(teeTimeSlotForMatch("Fourball", 1), 0);
  assert.equal(teeTimeSlotForMatch("Fourball", 2), 1);
  assert.equal(teeTimeSlotForMatch("Fourball", 3), 2);
  assert.equal(teeTimeSlotForMatch("Foursome", 1), 0);
  assert.equal(teeTimeSlotForMatch("Foursome", 3), 2);
});

test("teeTimeSlotForMatch: Singles pairs two matches per slot", () => {
  assert.equal(teeTimeSlotForMatch("Singles", 1), 0);
  assert.equal(teeTimeSlotForMatch("Singles", 2), 0);
  assert.equal(teeTimeSlotForMatch("Singles", 3), 1);
  assert.equal(teeTimeSlotForMatch("Singles", 4), 1);
  assert.equal(teeTimeSlotForMatch("Singles", 5), 2);
  assert.equal(teeTimeSlotForMatch("Singles", 6), 2);
});

test("deriveMatchTeeTime converts a Pacific wall-clock time to the correct UTC instant in PDT (summer)", () => {
  const result = deriveMatchTeeTime("2027-07-15", "07:30");
  assert.equal(result?.toISOString(), "2027-07-15T14:30:00.000Z");
});

test("deriveMatchTeeTime converts a Pacific wall-clock time to the correct UTC instant in PST (winter)", () => {
  const result = deriveMatchTeeTime("2027-01-06", "07:30");
  assert.equal(result?.toISOString(), "2027-01-06T15:30:00.000Z");
});

test("deriveMatchTeeTime returns null when the date or the time of day is missing", () => {
  assert.equal(deriveMatchTeeTime(null, "07:30"), null);
  assert.equal(deriveMatchTeeTime("2027-01-06", null), null);
  assert.equal(deriveMatchTeeTime(null, null), null);
});

test("formatPacificTeeTime labels the instant in Pacific Time regardless of season", () => {
  assert.equal(formatPacificTeeTime(new Date("2027-07-15T14:30:00.000Z")), "7:30 AM PT");
  assert.equal(formatPacificTeeTime(new Date("2027-01-06T15:30:00.000Z")), "7:30 AM PT");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test lib/live/sessionTeeTimes.test.ts` (matches how this repo already runs `.test.ts` files under `lib/live` — check `package.json`'s `test` script if this exact invocation errors, and use that instead).
Expected: FAIL — `sessionTeeTimes.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/live/sessionTeeTimes.ts
import type { MatchFormat } from "./types.ts";

const PACIFIC_TZ = "America/Los_Angeles";

/**
 * Which of a Session's 3 match-tee-time slots a given match number uses.
 * Fourball/Foursome have 3 matches, one slot each. Singles has 6 matches,
 * two sharing each slot (1&2, 3&4, 5&6) since two singles matches
 * conventionally go off the same tee time.
 */
export function teeTimeSlotForMatch(format: MatchFormat, matchNumber: number): number {
  if (format === "Singles") return Math.floor((matchNumber - 1) / 2);
  return matchNumber - 1;
}

function pacificOffsetMinutes(utcGuess: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PACIFIC_TZ,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utcGuess)
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - utcGuess.getTime()) / 60000;
}

/**
 * Combines a Session's date ("YYYY-MM-DD") with one of its "HH:MM" tee
 * times, interpreted as Pacific Time (PST/PDT, handled automatically), into
 * the absolute instant a match's teeTime should be. Null if either input is
 * missing — callers must show a "TBD" fallback rather than format an
 * invalid date.
 */
export function deriveMatchTeeTime(date: string | null, timeOfDay: string | null): Date | null {
  if (!date || !timeOfDay) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = timeOfDay.split(":").map(Number);
  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) return null;
  // First guess: treat the wall-clock time as if it were already UTC, then
  // measure Pacific's real offset at that instant and correct for it. One
  // correction is enough for a same-day tee time (never near midnight UTC,
  // the only place a single-pass guess could straddle a DST boundary).
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = pacificOffsetMinutes(utcGuess);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
}

/** "7:30 AM PT" — for displaying an already-absolute tee time back in Pacific. */
export function formatPacificTeeTime(date: Date): string {
  return `${date.toLocaleTimeString("en-US", { timeZone: PACIFIC_TZ, hour: "numeric", minute: "2-digit" })} PT`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: same command as Step 2.
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/live/sessionTeeTimes.ts lib/live/sessionTeeTimes.test.ts
git commit -m "Add Pacific-time tee-time conversion helper"
```

---

### Task 3: Rename core types (`lib/live/types.ts`)

**Files:**
- Modify: `lib/live/types.ts`

**Interfaces:**
- Produces (new names every later task imports): `LiveSessionState` (was `LiveRoundState`), `LiveSessionState.session` (was `.round`), `LiveSessionState.matchTeeTimes: (string | null)[]` (new), `LiveMatch` (was `LiveMatchBox`), `LiveMatch.session` (was `.round`), `LiveMatch.matchNumber` (was `.boxNumber`), `TournamentSettings.sessionCount` (was `.roundCount`). `MatchFormat`, `MatchState`, `Team`, `LiveHole`, `LiveTeeSet`, `LiveCourse`, `LiveHoleScore`, `RosterEntry` are unchanged.

- [ ] **Step 1: Apply the rename**

Replace the whole file with:

```typescript
// lib/live/types.ts
export type Team = "maroon" | "white";
export type MatchFormat = "Fourball" | "Foursome" | "Singles";
export type MatchState = "Scheduled" | "Armed" | "Live" | "Final";

export interface LiveHole {
  number: number;
  par: number;
  yards: number;
}

export interface LiveTeeSet {
  apiSource?: {
    provider?: "golfcore";
    courseId: string;
    teeId: string;
    syncedAt: string;
    baseline: { name: string; color?: string; rating: number | null; slope: number | null; holes: LiveHole[] };
  };
  color?: string;
  locked?: boolean;
  id: string;
  name: string;
  holes: LiveHole[];
  rating: number | null;
  slope: number | null;
}

export interface LiveCourse {
  id: string;
  name: string;
  holes: LiveHole[];
  teeSets?: LiveTeeSet[];
  rating: number | null; // e.g. 72.4 — null until set
  slope: number | null; // USGA range 55-155 — null until set
  city?: string | null;
  state?: string | null; // two-letter code, e.g. "TX"
  zipCode?: string | null; // optional; never displayed, reserved for a nearby-courses lookup
}

export interface LiveHoleScore {
  seasonYear: number;
  player: string; // player_slug
  round: number;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  hostEdited: boolean;
}

export interface LiveMatch {
  id: string | null;
  seasonYear: number;
  session: number;
  matchNumber: number;
  format: MatchFormat;
  teeTime: Date;
  maroonPlayers: string[]; // player_slug[]
  whitePlayers: string[]; // player_slug[]
  state: MatchState;
  started: boolean;
}

export interface TournamentSettings {
  sessionCount: number | null;
  completedAt: string | null; // ISO timestamp, null until the tournament is done
  venueName: string | null;
  venueLocked: boolean;
  beginDate: string | null; // ISO date (YYYY-MM-DD)
  endDate: string | null; // ISO date (YYYY-MM-DD)
  datesLocked: boolean;
}

export interface RosterEntry {
  seasonYear: number;
  playerSlug: string;
  team: Team;
  displayName?: string;
  avatarSrc?: string | null;
}

export interface LiveSessionState {
  seasonYear: number;
  session: number;
  started: boolean;
  courseId: string | null;
  courseSetup?: { teeSetId: string; teeSetName: string; holes: LiveHole[]; rating: number | null; slope: number | null; holeTeeSetIds?: Record<string, string> } | null;
  date: string | null; // ISO date (YYYY-MM-DD)
  format: MatchFormat | null;
  /** 3 "HH:MM" Pacific wall-clock times, or null where not yet set. Fourball/Foursome: one per match. Singles: shared 1&2 / 3&4 / 5&6. See lib/live/sessionTeeTimes.ts. */
  matchTeeTimes: (string | null)[];
  courseLocked: boolean;
  matchupsLocked: boolean;
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
  roundCourses: Record<number, string>; // session -> course id
  scores: Map<string, LiveHoleScore>; // keyed by `${player}:${round}:${hole}`
  matchBoxes: LiveMatch[];
}

export function scoreKey(player: string, round: number, hole: number): string {
  return `${player}:${round}:${hole}`;
}

export function scoreFor(snapshot: LiveTournamentSnapshot, player: string, round: number, hole: number): LiveHoleScore {
  const key = scoreKey(player, round, hole);
  const existing = snapshot.scores.get(key);
  if (existing) return existing;
  const blank: LiveHoleScore = { seasonYear: 0, player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false };
  snapshot.scores.set(key, blank);
  return blank;
}

export function readScore(snapshot: LiveTournamentSnapshot, player: string, round: number, hole: number): LiveHoleScore {
  const key = scoreKey(player, round, hole);
  return (
    snapshot.scores.get(key) ?? { seasonYear: 0, player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false }
  );
}

export function courseForRound(snapshot: LiveTournamentSnapshot, round: number): LiveCourse | null {
  const courseId = snapshot.roundCourses[round];
  if (courseId && snapshot.courses[courseId]) return snapshot.courses[courseId];
  const first = Object.values(snapshot.courses)[0];
  return first ?? null;
}
```

Notes on what deliberately did **not** change: `LiveHoleScore.round`, `scoreKey`/`scoreFor`/`readScore`/`courseForRound`'s `round` parameter, and `LiveTournamentSnapshot.roundCourses` keep the word "round" — these key hole-scores and courses by the ordinal session number too, but renaming every internal parameter name across `orchestration.ts`/`scoring.ts` that isn't itself part of the public `LiveSessionState`/`LiveMatch` shape is unnecessary churn for zero user-facing benefit. Task 4 renames `LiveMatch`'s own fields and every place that reads `.round`/`.boxNumber` off a `LiveMatch`/`LiveSessionState` value; it leaves these already-generic parameter names alone.

- [ ] **Step 2: Confirm the file compiles in isolation**

Run: `npx tsc --noEmit lib/live/types.ts` will fail (it has no project context) — instead run the full `npx tsc --noEmit` now, expect a long list of errors in every file that imports the renamed symbols. That list is your checklist for Tasks 4–11; do not try to fix it all now.

- [ ] **Step 3: Commit**

```bash
git add lib/live/types.ts
git commit -m "Rename LiveRoundState/LiveMatchBox to LiveSessionState/LiveMatch"
```

---

### Task 4: Rename `lib/live/orchestration.ts` and its test

**Files:**
- Modify: `lib/live/orchestration.ts`, `lib/live/orchestration.test.ts`

**Interfaces:**
- Consumes: `LiveMatch`, `LiveSessionState` types from Task 3.
- Produces: `matchesPerSession()` (was `boxesPerRound`), `playersPerTeamPerMatch()` (was `playersPerTeamPerBox`), `sessionIsComplete()` (was `roundIsComplete`). `validateMatchBox`, `canScoreStrokesFor`, `effectiveMatchState`, `matchBoxStartedThru`, `thruLabel`, `matchBoxResult`, `scoresAgree`, `holeComplete` keep their current names (they already read naturally and are consumed by many other files below — renaming them buys nothing and multiplies the rename surface).

- [ ] **Step 1: Apply the rename**

Open `lib/live/orchestration.ts`. Apply this exact substitution table throughout the file (every occurrence, including inside comments/JSDoc that reference these names):

| Find | Replace with |
|---|---|
| `boxesPerRound` | `matchesPerSession` |
| `playersPerTeamPerBox` | `playersPerTeamPerMatch` |
| `roundIsComplete` | `sessionIsComplete` |
| `matchBox.round` | `matchBox.session` |
| `matchBox.boxNumber` | `matchBox.matchNumber` |
| `box.round` | `box.session` |
| `box.boxNumber` | `box.matchNumber` |
| `LiveMatchBox` (as a type reference) | `LiveMatch` |

Do **not** touch `snapshot.matchBoxes` (the field name on `LiveTournamentSnapshot`, unchanged by Task 3) or the `round`/`format` parameter names on `sessionIsComplete(snapshot, round, format)` — only rename the type annotation if one references `LiveMatchBox`/`LiveRoundState` by name; the parameter itself can keep being called `round` since it's a plain `number`, matching the convention set in Task 3's Step 1 notes.

Then open `lib/live/orchestration.test.ts` and apply the same table (its `box(...)` test helper builds `LiveMatchBox`-shaped objects — rename the type import and every object literal's `round`/`boxNumber` keys to `session`/`matchNumber`).

- [ ] **Step 2: Run the tests**

Run: `node --experimental-strip-types --test lib/live/orchestration.test.ts` (or this repo's equivalent `npm test`-driven invocation for a single file — check `package.json`).
Expected: PASS, same test count as before the rename (this is a pure rename — no assertion should need to change).

- [ ] **Step 3: Commit**

```bash
git add lib/live/orchestration.ts lib/live/orchestration.test.ts
git commit -m "Rename orchestration.ts to the Session/Match vocabulary"
```

---

### Task 5: Rename the remaining `lib/live/*.ts` consumers

**Files:**
- Modify: `lib/live/currentRoundForPlayer.ts` (+ its test if one exists — check for `currentRoundForPlayer.test.ts`), `lib/live/officialMatchState.ts`, `lib/live/syncLockedRound.ts`, `lib/live/matchProfile.ts` (+ `matchProfile.test.ts`), `lib/live/playerProfile.ts` (+ test if present), `lib/live/publishOfficialMatchState.ts`, `lib/live/publishMatchOdds.ts`, `lib/live/previewMatchState.ts` (+ `previewMatchState.test.ts`), `lib/live/scoringPreviewRoom.ts` (+ test if present)

**Interfaces:**
- Consumes: `LiveSessionState`, `LiveMatch`, `matchesPerSession`, `sessionIsComplete` from Tasks 3–4.
- Produces: `findCurrentSessionForPlayer` (was `findCurrentRoundForPlayer`), `findMatchesForPlayer` (unchanged name — already generic), `findUpcomingMatchesForPlayer` (unchanged), `pickCurrentSession` (was `pickCurrentRound`), `CurrentSessionResult` (was `CurrentRoundResult`, with its `round` field renamed to `session: LiveSessionState`). Task 6, 9, 10 import these new names.

- [ ] **Step 1: `lib/live/currentRoundForPlayer.ts`**

Replace the whole file with:

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerDisplayName } from "@/lib/data/players";
import { getActiveSeasonYear } from "./activeSeason.ts";
import { effectiveMatchState } from "./orchestration.ts";
import { roundFinishedForPlayer } from "./roundStatus.ts";
import type { LiveMatch, LiveSessionState, LiveTournamentSnapshot, MatchFormat, MatchState } from "./types.ts";

export interface CurrentSessionResult {
  session: LiveSessionState;
  matchBox: LiveMatch;
  state: MatchState;
}

const EMPTY_SNAPSHOT: LiveTournamentSnapshot = {
  players: {},
  courses: {},
  roundCourses: {},
  scores: new Map(),
  matchBoxes: [],
};

/**
 * The next session relevant to this player: the lowest-numbered fully locked
 * session (course + matchups) that has a match containing them, whose
 * computed state isn't yet Final. Pure — no I/O — so the selection rule is
 * fully unit-testable without a live Supabase instance.
 */
export function pickCurrentSession(sessions: LiveSessionState[], matches: LiveMatch[], playerSlug: string): CurrentSessionResult | null {
  const lockedSessions = sessions.filter((s) => s.courseLocked && s.matchupsLocked).sort((a, b) => a.session - b.session);

  for (const session of lockedSessions) {
    const matchBox = matches.find(
      (match) => match.session === session.session && (match.maroonPlayers.includes(playerSlug) || match.whitePlayers.includes(playerSlug))
    );
    if (!matchBox) continue;

    const state = effectiveMatchState(EMPTY_SNAPSHOT, matchBox);
    if (state === "Final") continue;

    return { session, matchBox, state };
  }

  return null;
}

/**
 * "You & Cam vs. Drew & Hugo" (Fourball/Foursome) or "You vs. Drew"
 * (Singles) — this player's side first, teammate before opponents.
 */
export function matchupLabel(playerSlug: string, matchBox: LiveMatch): string {
  const onMaroon = matchBox.maroonPlayers.includes(playerSlug);
  const ownSide = onMaroon ? matchBox.maroonPlayers : matchBox.whitePlayers;
  const otherSide = onMaroon ? matchBox.whitePlayers : matchBox.maroonPlayers;
  const teammates = ownSide.filter((slug) => slug !== playerSlug).map(getPlayerDisplayName);
  const opponents = otherSide.map(getPlayerDisplayName);
  return `${["You", ...teammates].join(" & ")} vs. ${opponents.join(" & ")}`;
}

interface SessionRow {
  round: number;
  started: boolean;
  course_id: string | null;
  date: string | null;
  format: string | null;
  course_locked: boolean;
  matchups_locked: boolean;
}

function sessionFromRow(row: SessionRow, seasonYear: number): LiveSessionState {
  return {
    seasonYear,
    session: row.round,
    started: row.started,
    courseId: row.course_id,
    date: row.date,
    format: row.format as MatchFormat | null,
    courseLocked: row.course_locked,
    matchupsLocked: row.matchups_locked,
    matchTeeTimes: [null, null, null],
  };
}

interface MatchRow {
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

function matchFromRow(row: MatchRow, seasonYear: number): LiveMatch {
  return {
    id: row.id,
    seasonYear,
    session: row.round,
    matchNumber: row.box_number,
    format: row.format as MatchFormat,
    teeTime: new Date(row.tee_time),
    maroonPlayers: row.maroon_players,
    whitePlayers: row.white_players,
    state: row.state as MatchState,
    started: row.started,
  };
}

// Not unit tested: createSupabaseServerClient() needs a real request
// lifecycle, same documented limitation as lib/portal/requireHost.test.mts
// and app/api/portal/profile/route.test.mts. pickCurrentSession() above (the
// actual selection rule) is where the real logic lives and is fully tested.
export async function findMatchesForPlayer(playerSlug: string, seasonYear: number): Promise<CurrentSessionResult[]> {
  const supabase = await createSupabaseServerClient();

  const [{ data: sessionRows, error: sessionError }, { data: matchRows, error: matchError }] = await Promise.all([
    supabase
      .from("live_round_state")
      .select("round, started, course_id, date, format, course_locked, matchups_locked")
      .eq("season_year", seasonYear)
      .order("round"),
    supabase
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("season_year", seasonYear)
      .order("round"),
  ]);

  if (sessionError) {
    console.error("Failed to fetch live_round_state:", sessionError);
  }
  if (matchError) {
    console.error("Failed to fetch live_match_boxes:", matchError);
  }

  const sessions = (sessionRows ?? []).map((row) => sessionFromRow(row, seasonYear));
  const matches = (matchRows ?? []).map((row) => matchFromRow(row, seasonYear));

  return sessions.filter((session) => session.courseLocked && session.matchupsLocked).flatMap((session) =>
    matches.filter((match) => match.session === session.session && (match.maroonPlayers.includes(playerSlug) || match.whitePlayers.includes(playerSlug)))
      .map((matchBox) => ({ session, matchBox, state: effectiveMatchState(EMPTY_SNAPSHOT, matchBox) }))
  );
}

/** A session is finished for a player once they and their scorer have both pressed Submit Round; the Scoring tab then moves on. */
export function withoutFinishedMatches(matches: CurrentSessionResult[], playerSlug: string, submissions: { match_box_id: string; player_slug: string }[]): CurrentSessionResult[] {
  return matches.filter((match) => {
    const submitted = submissions.filter((row) => row.match_box_id === match.matchBox.id).map((row) => row.player_slug);
    return !roundFinishedForPlayer(match.matchBox, playerSlug, submitted);
  });
}

export async function findUpcomingMatchesForPlayer(playerSlug: string): Promise<CurrentSessionResult[]> {
  const matches = (await findMatchesForPlayer(playerSlug, await getActiveSeasonYear())).filter((match) => match.state !== "Final");
  const ids = matches.map((match) => match.matchBox.id).filter((id): id is string => !!id);
  if (ids.length === 0) return matches;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("live_match_box_submissions").select("match_box_id, player_slug").in("match_box_id", ids);
  if (error) {
    console.error("Failed to fetch live_match_box_submissions:", error);
    return matches;
  }
  return withoutFinishedMatches(matches, playerSlug, data ?? []);
}

export async function findCurrentSessionForPlayer(playerSlug: string): Promise<CurrentSessionResult | null> {
  return (await findUpcomingMatchesForPlayer(playerSlug))[0] ?? null;
}
```

Note `sessionFromRow` hardcodes `matchTeeTimes: [null, null, null]` since this file's existing `SELECT` never fetched `match_tee_times` and nothing here needs it (it only needs `LiveSessionState.session`/`.courseLocked`/`.matchupsLocked` for the selection rule) — this keeps the query unchanged rather than adding an unused column fetch. `findCurrentRoundForPlayer` callers (grep for it — likely `ScoringStatusScreen`'s server-side loader / a `/api/portal/scoring/state`-style route) must be updated to import `findCurrentSessionForPlayer` and rename the `round`/`CurrentRoundResult` field they destructure to `session`/`CurrentSessionResult` — check Task 12's Step 5 (`ScoringStatusScreen.tsx`) for the one confirmed call site; grep for any others (`findCurrentRoundForPlayer|CurrentRoundResult|pickCurrentRound`) before calling this task done.

If `lib/live/currentRoundForPlayer.test.ts` exists (it's referenced by the `pickCurrentRound returns Armed...` test discovered during design), open it and rename every `pickCurrentRound`/`CurrentRoundResult`/`round:`/`boxNumber:` occurrence to `pickCurrentSession`/`CurrentSessionResult`/`session:`/`matchNumber:` to match this rewrite.

- [ ] **Step 2: `lib/live/officialMatchState.ts` and `lib/live/publishOfficialMatchState.ts`**

`officialMatchState.ts`: no direct `.round`/`.boxNumber` access was found, but it imports `LiveMatchBox`/`effectiveMatchState`/`matchBoxResult`/`matchBoxStartedThru` — update the type import name to `LiveMatch`. `publishOfficialMatchState.ts` line ~36 (`round: box.round,`): this writes to `live_score_audit_events`, whose DB column is still `round` — per the Global Constraints translation-boundary rule, keep the object key `round` but change the value expression to `box.session`: `round: box.session,`.

- [ ] **Step 3: `lib/live/publishMatchOdds.ts`**

Update `snapshot.roundCourses[box.round]` → `snapshot.roundCourses[box.session]` (both occurrences — the one building `course` and the one building `score`), and the audit-event insert `round: box.round` → `round: box.session` (same DB-column-key rule as Step 2).

- [ ] **Step 4: `lib/live/syncLockedRound.ts`**

Its exported function `syncLockedRoundToCareerArchive(seasonYear: number, round: number)` — this is called from the (soon-to-be-renamed) session lock route and matches routes with a session number. Rename the parameter `round` → `session` and rename the function to `syncLockedSessionToCareerArchive`. Update the one call site inside this file that reads `box.round`/`.boxNumber` (if any — re-check the file's body beyond the signature; apply the same `.session`/`.matchNumber` field rename as elsewhere).

- [ ] **Step 5: `lib/live/matchProfile.ts` and `matchProfile.test.ts`**

In `matchProfileScorecard`: `snapshot.roundCourses[box.round]` → `snapshot.roundCourses[box.session]`; the scores-map key template `` `${player}:${box.round}:${hole.number}` `` stays exactly as-is (that key format is `LiveHoleScore`'s own `scoreKey`, keyed by the ordinal number, unchanged by Task 3 per its notes) — do **not** rename this one. `MatchProfileEntry.match.round` → keep the field named `round` here deliberately: this type flows into `profileMatch()`, which maps it onto the shared, out-of-scope `RealMatch` type's `day`/`session` fields (`day: match.round`) — renaming it would ripple into that shared historical type. Only change `profileMatch()`'s tee-time computation (Task 12 handles the Central→Pacific conversion for this same function; do not duplicate that work here). In `matchProfile.test.ts` line 9, `matchBoxes: [{ ..., round: 2, boxNumber: 1, ... }]` — update to `{ ..., session: 2, matchNumber: 1, ... }` to match the renamed `LiveMatch` shape used to build the test's `LiveTournamentSnapshot`.

- [ ] **Step 6: `lib/live/playerProfile.ts`**

Rename `box.round` → `box.session` at both occurrences (building the per-round list and the match entry), and `match: { ..., round: box.round, ... }` → keep this object's key as `round` (it also flows toward the shared `RealMatch`/`MatchProfileEntry.match` shape via `matchProfile.ts`, per Step 5's reasoning) but change its value to `box.session`.

- [ ] **Step 7: `lib/live/previewMatchState.ts` and its test**

Rename its `round: number` parameter to `session: number`, and the object literal `{ id: null, seasonYear: 0, round, boxNumber: 0, ... }` → `{ id: null, seasonYear: 0, session, matchNumber: 0, ... }`. Update `previewMatchState.test.ts` call sites and any `LiveMatchBox`-shaped literals the same way.

- [ ] **Step 8: `lib/live/scoringPreviewRoom.ts`**

Check this file for `.round`/`.boxNumber` field access on `LiveMatch`-shaped values (it builds the Tiger Center Live Scoring Page Editor's in-memory preview) and rename per the same table. If it constructs `LiveMatch` object literals directly, update their keys.

- [ ] **Step 9: Update every remaining consumer of the renamed `currentRoundForPlayer.ts` exports**

A repo-wide search for `findCurrentRoundForPlayer|CurrentRoundResult|pickCurrentRound|findMatchesForPlayer|findUpcomingMatchesForPlayer` during design turned up more call sites than Step 1 alone covers. Apply exactly these changes (nothing else in these files needs to change):

`lib/live/scoringProgress.ts`:

```typescript
import type { CurrentSessionResult } from "./currentRoundForPlayer.ts"; // was CurrentRoundResult
...
export async function loadScoringProgress(result: CurrentSessionResult, playerSlug: string): Promise<ScoringProgress> {
  const boxId = result.matchBox.id;
  const courseId = result.session.courseId; // was result.round.courseId
```

`app/portal/scoring/page.tsx`:

```typescript
import { findCurrentSessionForPlayer } from "@/lib/live/currentRoundForPlayer"; // was findCurrentRoundForPlayer
...
  const result = await findCurrentSessionForPlayer(playerSlug); // was findCurrentRoundForPlayer(playerSlug)
```

`app/portal/scoring/play/page.tsx`:

```typescript
import { findCurrentSessionForPlayer } from "@/lib/live/currentRoundForPlayer"; // was findCurrentRoundForPlayer
...
  const result = await findCurrentSessionForPlayer(playerSlug);
  if (!result || result.state !== "Live") redirect("/portal/scoring");
  ...
        round={result.session.session} // was result.round.round
```

**Deliberately do not rename `ScoringPanel`'s `round` prop itself**, nor its downstream `/api/portal/scoring/state?round=`, `/api/portal/scoring/submit` body `{ round }`, the Supabase Realtime filter `round=eq.${round}`, or the offline submission queue's `{ ..., round, ... }` payload. That whole hole-by-hole live scoring engine (already shipped, a separate spec) treats `round` as a wire-level parameter exactly like a database column — same translation-boundary rule as everywhere else in this plan: only the *value* fed into it changes (from `result.session.session` above), never its name. Renaming it would mean re-touching `/api/portal/scoring/state`, `/api/portal/scoring/submit`, the realtime subscription, and the offline queue's storage schema — a different, already-shipped subsystem outside this plan's scope (spec §1's Global Constraints "generic round of golf vocabulary" carve-out).

`app/portal/page.tsx`: imports `findMatchesForPlayer` (name unchanged by this plan) and passes its result array straight into `buildLiveMatchCards` (see next). Open the file and confirm it doesn't itself destructure `.round`/`.boxNumber` anywhere beyond what the earlier grep showed (the grep context only showed the import and the call, both fine as-is) — if it does, apply the same `.session`/`.matchNumber` rename.

`lib/portal/archivedMatches.ts`: no code change — the only match was a comment referencing `findMatchesForPlayer` by name in passing, and that name is unchanged.

`lib/portal/liveMatchCards.ts`:

```typescript
import type { CurrentSessionResult } from "@/lib/live/currentRoundForPlayer"; // was CurrentRoundResult

export async function buildLiveMatchCards(matches: CurrentSessionResult[]): Promise<PortalMatchCard[]> {
  if (matches.length === 0) return [];

  const service = createSupabaseServiceRoleClient();
  const boxIds = matches.map((m) => m.matchBox.id).filter((id): id is string => Boolean(id));
  const courseIds = [...new Set(matches.map((m) => m.session.courseId).filter((id): id is string => Boolean(id)))]; // was m.round.courseId
  ...
    const odds = matchBox.id ? oddsByBox.get(matchBox.id) : null;
    return liveMatchCard({
      id: matchBox.id ?? `round-${session.session}-box-${matchBox.matchNumber}`, // was `round-${round.round}-box-${matchBox.boxNumber}` — the id-fallback string's own text is unchanged, only the variable references are
      status: state === "Final" ? "Past" : state === "Live" ? "Live" : "Upcoming",
      course: session.courseId ? courseNameById.get(session.courseId) ?? null : null, // was round.courseId
      round: session.session, // was round: round.round — key intentionally still "round" for now: LiveMatchCardInput itself isn't renamed to accept "session" until Task 12 Step 7, which also updates this exact call site's key
      format: matchBox.format,
      maroonPlayers: matchBox.maroonPlayers,
```

(rename every other local variable named `round` in this function to `session` for consistency — re-read the whole function body, not just the lines shown here, before considering this file done. Leaving the `round:` **key** as-is here, only the value/variable renamed, avoids a `tsc` error between this task and Task 12, which is what actually renames `LiveMatchCardInput`'s field and updates this call site's key to `session:`.)

- [ ] **Step 10: Run the whole `lib/live` test suite**

Run: `npm test` (or the project's full test command from `package.json`) filtered to `lib/live` if the runner supports a path filter, otherwise the whole suite.
Expected: PASS, same total test count as before this task (pure rename, no logic changed).

- [ ] **Step 11: Type-check**

Run: `npx tsc --noEmit`.
Expected: errors should now only remain in the API routes and components not yet updated (Tasks 6–11). If any error appears inside `lib/live/*.ts` itself, fix it before moving on — Tasks 6+ assume this layer compiles clean on its own.

- [ ] **Step 12: Commit**

```bash
git add lib/live/currentRoundForPlayer.ts lib/live/currentRoundForPlayer.test.ts lib/live/officialMatchState.ts lib/live/syncLockedRound.ts lib/live/matchProfile.ts lib/live/matchProfile.test.ts lib/live/playerProfile.ts lib/live/publishOfficialMatchState.ts lib/live/publishMatchOdds.ts lib/live/previewMatchState.ts lib/live/previewMatchState.test.ts lib/live/scoringPreviewRoom.ts lib/live/scoringProgress.ts app/portal/scoring/page.tsx app/portal/scoring/play/page.tsx lib/portal/liveMatchCards.ts
git commit -m "Rename remaining lib/live consumers to Session/Match"
```

---

### Task 6: Rename and extend the Session API routes (`rounds` → `sessions`)

**Files:**
- Create (via `git mv`): `app/api/portal/tiger/sessions/route.ts`, `sessions/lock/route.ts`, `sessions/remove/route.ts`, `sessions/start/route.ts`, and their `.test.ts` files.
- Modify: content of each moved file.
- Test: existing `.test.ts` files, moved and updated.

**Interfaces:**
- Consumes: `LiveSessionState`, `deriveMatchTeeTime` is **not** used here (tee times are stored as raw "HH:MM" strings on the session; derivation into a `LiveMatch.teeTime` happens in Task 7's matches route).
- Produces: `GET/POST /api/portal/tiger/sessions` (was `rounds`), `POST /api/portal/tiger/sessions/lock`, `/remove`, `/start` — all now read/write `matchTeeTimes`, and `lock` now requires all 3 slots to be set before locking.

- [ ] **Step 1: Move the files**

```bash
git mv app/api/portal/tiger/rounds/route.ts app/api/portal/tiger/sessions/route.ts
git mv app/api/portal/tiger/rounds/route.test.ts app/api/portal/tiger/sessions/route.test.ts
git mv app/api/portal/tiger/rounds/lock/route.ts app/api/portal/tiger/sessions/lock/route.ts
git mv app/api/portal/tiger/rounds/lock/route.test.ts app/api/portal/tiger/sessions/lock/route.test.ts
git mv app/api/portal/tiger/rounds/remove/route.ts app/api/portal/tiger/sessions/remove/route.ts
git mv app/api/portal/tiger/rounds/remove/route.test.ts app/api/portal/tiger/sessions/remove/route.test.ts
git mv app/api/portal/tiger/rounds/start/route.ts app/api/portal/tiger/sessions/start/route.ts
git mv app/api/portal/tiger/rounds/start/route.test.ts app/api/portal/tiger/sessions/start/route.test.ts
```

- [ ] **Step 2: Rewrite `sessions/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import type { LiveSessionState, LiveTeeSet, MatchFormat } from "@/lib/live/types";
import { availableTeeSets } from "@/lib/live/teeSets";

const VALID_FORMATS: MatchFormat[] = ["Fourball", "Foursome", "Singles"];

export async function GET(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("live_round_state")
    .select("round, started, course_id, date, format, course_locked, matchups_locked, course_setup, match_tee_times")
    .eq("season_year", year)
    .order("round");
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the sessions." }, { status: 500 });
  }

  const sessions: LiveSessionState[] = (data ?? []).map((row) => ({
    seasonYear: year,
    session: row.round,
    started: row.started,
    courseId: row.course_id,
    date: row.date,
    format: row.format as MatchFormat | null,
    courseLocked: row.course_locked,
    matchupsLocked: row.matchups_locked,
    courseSetup: row.course_setup,
    matchTeeTimes: (row.match_tee_times as (string | null)[] | null) ?? [null, null, null],
  }));
  return NextResponse.json({ ok: true, sessions }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session, date, courseId, format, courseSetup, matchTeeTimes } = await request.json();
  if (!isValidSeasonYear(year) || typeof session !== "number") {
    return NextResponse.json({ ok: false, error: "Missing session." }, { status: 400 });
  }
  if (format !== undefined && !VALID_FORMATS.includes(format)) {
    return NextResponse.json({ ok: false, error: "Invalid format." }, { status: 400 });
  }

  if (courseSetup !== undefined && (typeof courseId !== "string" || typeof courseSetup?.teeSetId !== "string" || !courseSetup?.holeTeeSetIds || typeof courseSetup.holeTeeSetIds !== "object")) {
    return NextResponse.json({ ok: false, error: "Choose a course and tee set before saving yardages." }, { status: 400 });
  }

  if (matchTeeTimes !== undefined) {
    const valid = Array.isArray(matchTeeTimes) && matchTeeTimes.length === 3 && matchTeeTimes.every((value) => value === null || (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)));
    if (!valid) {
      return NextResponse.json({ ok: false, error: "matchTeeTimes must be an array of 3 \"HH:MM\" strings (or null)." }, { status: 400 });
    }
  }

  const update: Record<string, unknown> = {};
  if (date !== undefined) update.date = date;
  if (courseId !== undefined) update.course_id = courseId;
  if (courseId !== undefined && courseSetup === undefined) update.course_setup = null;
  if (format !== undefined) update.format = format;
  if (matchTeeTimes !== undefined) update.match_tee_times = matchTeeTimes;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (courseSetup !== undefined) {
    const { data: course } = await service.from("live_courses").select("holes, rating, slope, tee_sets").eq("id", courseId).single();
    const teeSets = availableTeeSets((Array.isArray(course?.tee_sets) ? course.tee_sets : []) as LiveTeeSet[]);
    const selected = teeSets.find((tee) => tee.id === courseSetup.teeSetId);
    if (!selected || selected.holes.length !== 18) return NextResponse.json({ ok: false, error: "That tee set is not available for this course." }, { status: 400 });
    const byId = new Map(teeSets.map((tee) => [tee.id, tee]));
    if (Object.values(courseSetup.holeTeeSetIds).some((id) => typeof id !== "string" || !byId.has(id))) return NextResponse.json({ ok: false, error: "Every selected tee set must be locked and available." }, { status: 400 });
    const holes = selected.holes.map((hole) => {
      const tee = byId.get(courseSetup.holeTeeSetIds[String(hole.number)]) ?? selected;
      const override = tee.holes.find((candidate) => candidate.number === hole.number);
      return override ?? hole;
    });
    update.course_setup = { teeSetId: selected.id, teeSetName: selected.name, holes, rating: selected.rating, slope: selected.slope, holeTeeSetIds: courseSetup.holeTeeSetIds };
  }

  if (format !== undefined) {
    const { data: current } = await service.from("live_round_state").select("format").eq("season_year", year).eq("round", session).single();
    if (current && current.format !== format) {
      const { error: matchesError } = await service.from("live_match_boxes").delete().eq("season_year", year).eq("round", session);
      if (matchesError) {
        return NextResponse.json({ ok: false, error: "Could not clear this session's matches for the new format." }, { status: 500 });
      }
    }
  }

  const { error } = await service.from("live_round_state").update(update).eq("season_year", year).eq("round", session);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that session." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Rewrite `sessions/lock/route.ts`**

Same as the original `rounds/lock/route.ts`, with these changes: rename the `round` request field to `session` throughout; before locking `lock === "course"`, additionally require all 3 `match_tee_times` slots to be non-null (Review Focus item 2); update every `LiveMatchBox`/`.round`/`.boxNumber` reference to `LiveMatch`/`.session`/`.matchNumber`; rename the imported `roundIsComplete`/`syncLockedRoundToCareerArchive` to `sessionIsComplete`/`syncLockedSessionToCareerArchive`.

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { sessionIsComplete, validateMatchBox } from "@/lib/live/orchestration";
import { syncLockedSessionToCareerArchive } from "@/lib/live/syncLockedRound";
import { availableTeeSets } from "@/lib/live/teeSets";
import type { LiveMatch, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session, lock, value } = await request.json();
  if (!isValidSeasonYear(year) || typeof session !== "number" || (lock !== "course" && lock !== "matchups") || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (lock === "course") {
    if (value) {
      const { data: current } = await service.from("live_round_state").select("date, course_id, format, course_setup, match_tee_times").eq("season_year", year).eq("round", session).single();
      if (!current?.date || !current?.course_id || !current?.format) {
        return NextResponse.json({ ok: false, error: "Set a date, course, and format before locking this session." }, { status: 400 });
      }
      const teeTimes = (current.match_tee_times as (string | null)[] | null) ?? [null, null, null];
      if (teeTimes.length !== 3 || teeTimes.some((slot) => !slot)) {
        return NextResponse.json({ ok: false, error: "Set all 3 match tee times before locking this session." }, { status: 400 });
      }
      const { data: course } = await service.from("live_courses").select("tee_sets").eq("id", current.course_id).single();
      const availableIds = new Set(availableTeeSets(Array.isArray(course?.tee_sets) ? course.tee_sets : []).map((tee) => tee.id));
      if (!availableIds.has(current.course_setup?.teeSetId) || Object.values(current.course_setup?.holeTeeSetIds ?? {}).some((id) => typeof id !== "string" || !availableIds.has(id))) {
        return NextResponse.json({ ok: false, error: "Choose locked tee sets from the Course Library before locking this session." }, { status: 400 });
      }
    }
    const { error } = await service
      .from("live_round_state")
      .update(value ? { course_locked: value } : { course_locked: value, matchups_locked: false })
      .eq("season_year", year)
      .eq("round", session);
    if (error) {
      return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // lock === "matchups"
  if (value) {
    const { data: current } = await service.from("live_round_state").select("course_locked, format, course_id, date").eq("season_year", year).eq("round", session).single();
    if (!current?.course_locked || !current.format) {
      return NextResponse.json({ ok: false, error: "Lock this session's course and format before locking matchups." }, { status: 400 });
    }

    const { data: matchRows } = await service
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("season_year", year)
      .eq("round", session);
    const matches: LiveMatch[] = (matchRows ?? []).map((row) => ({
      id: row.id,
      seasonYear: year,
      session: row.round,
      matchNumber: row.box_number,
      format: row.format as MatchFormat,
      teeTime: new Date(row.tee_time),
      maroonPlayers: row.maroon_players,
      whitePlayers: row.white_players,
      state: row.state as MatchState,
      started: row.started,
    }));
    const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
    const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

    const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes: matches };
    if (!sessionIsComplete(snapshot, session, current.format as MatchFormat)) {
      return NextResponse.json({ ok: false, error: "Every match for this session needs to be filled before locking matchups." }, { status: 400 });
    }

    const matchErrors = matches.flatMap((match) => validateMatchBox(snapshot, match).map((message) => `Match ${match.matchNumber}: ${message}`));
    if (matchErrors.length > 0) {
      return NextResponse.json({ ok: false, error: matchErrors.join(" ") }, { status: 400 });
    }
  }

  const { error } = await service.from("live_round_state").update({ matchups_locked: value }).eq("season_year", year).eq("round", session);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
  }
  if (value) {
    try {
      await syncLockedSessionToCareerArchive(year, session);
    } catch {
      return NextResponse.json({ ok: false, error: "Matchups locked, but Career Archive publishing failed. Run the Career Live Archive SQL first." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Rewrite `sessions/remove/route.ts` and `sessions/start/route.ts`**

`sessions/remove/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session } = await request.json();
  if (!isValidSeasonYear(year) || typeof session !== "number") {
    return NextResponse.json({ ok: false, error: "Missing session." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: current } = await service.from("live_round_state").select("course_locked, matchups_locked").eq("season_year", year).eq("round", session).single();
  if (current?.course_locked || current?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this session before removing it." }, { status: 400 });
  }

  const { error: matchesError } = await service.from("live_match_boxes").delete().eq("season_year", year).eq("round", session);
  if (matchesError) {
    return NextResponse.json({ ok: false, error: "Could not remove that session's matches." }, { status: 500 });
  }

  const { error } = await service.from("live_round_state").delete().eq("season_year", year).eq("round", session);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that session." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

`sessions/start/route.ts` — only the request field and error copy change; the RPC name and its own parameter names (`p_year`, `p_round`) are the Postgres function's signature, out of scope/unchanged, so only the local variable feeding `p_round` is renamed:

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { publishBroadcastEvent } from "@/lib/broadcast/publish";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session } = await request.json();
  if (!isValidSeasonYear(year) || typeof session !== "number" || !Number.isInteger(session)) {
    return NextResponse.json({ ok: false, error: "Missing session." }, { status: 400 });
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("start_live_round_atomic", { p_year: year, p_round: session });
  if (error) return NextResponse.json({ ok: false, error: error.code === "P0001" ? error.message : "Could not start this session. Retry safely." }, { status: 400 });

  try {
    await publishBroadcastEvent({ kind: "ROUND_STARTED", seasonYear: year, round: session });
  } catch (err) {
    console.error("broadcast publish failed:", err);
  }

  return NextResponse.json({ ok: true });
}
```

(`publishBroadcastEvent`'s `{ kind: "ROUND_STARTED", ... round: session }` — `ROUND_STARTED` and its `round` field are that function's own event-schema, shared with broadcast consumers outside this plan's scope; keep the key name `round`, just pass the renamed `session` value, same translation-boundary rule as everywhere else.)

- [ ] **Step 5: Update the 4 `.test.ts` files**

Each currently does something like:

```typescript
const request = new Request("http://localhost/api/portal/tiger/rounds", {
  method: "POST",
  body: JSON.stringify({ round: 1, format: "Fourball" }),
});
```

Update the URL to `.../sessions` and the body's `round` key to `session`, and the dynamic `await import("./route.ts")` path stays correct automatically since the file itself moved.

- [ ] **Step 6: Run the route tests**

Run: `node --experimental-strip-types --test app/api/portal/tiger/sessions/route.test.ts app/api/portal/tiger/sessions/lock/route.test.ts app/api/portal/tiger/sessions/remove/route.test.ts app/api/portal/tiger/sessions/start/route.test.ts` (adjust to this repo's actual test invocation from `package.json` if different).
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/portal/tiger/sessions app/api/portal/tiger/rounds
git commit -m "Rename tiger/rounds API to tiger/sessions; add match tee times"
```

---

### Task 7: Rename and extend the Matches API routes (`matchboxes` → `matches`)

**Files:**
- Create (via `git mv`): `app/api/portal/tiger/matches/route.ts`, `matches/remove/route.ts`, `matches/start/route.ts`, `matches/closeout/route.ts`, and their `.test.ts` files.
- Modify: content of each moved file.

**Interfaces:**
- Consumes: `LiveMatch`, `LiveSessionState`, `teeTimeSlotForMatch`, `deriveMatchTeeTime` from Task 2.
- Produces: `GET/POST /api/portal/tiger/matches` (was `matchboxes`) — **POST no longer accepts `teeTime` from the client**; the server derives it from the session's `matchTeeTimes` and the match's number/format. `POST /api/portal/tiger/matches/remove`, `/start`, `/closeout` — renamed, same behavior.

- [ ] **Step 1: Move the files**

```bash
git mv app/api/portal/tiger/matchboxes/route.ts app/api/portal/tiger/matches/route.ts
git mv app/api/portal/tiger/matchboxes/route.test.ts app/api/portal/tiger/matches/route.test.ts
git mv app/api/portal/tiger/matchboxes/remove/route.ts app/api/portal/tiger/matches/remove/route.ts
git mv app/api/portal/tiger/matchboxes/remove/route.test.ts app/api/portal/tiger/matches/remove/route.test.ts
git mv app/api/portal/tiger/matchboxes/start/route.ts app/api/portal/tiger/matches/start/route.ts
git mv app/api/portal/tiger/matchboxes/closeout/route.ts app/api/portal/tiger/matches/closeout/route.ts
```

- [ ] **Step 2: Rewrite `matches/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { validateMatchBox } from "@/lib/live/orchestration";
import { deriveMatchTeeTime, teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
import { syncLockedSessionToCareerArchive } from "@/lib/live/syncLockedRound";
import type { LiveMatch, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

interface MatchRow {
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

function rowToMatch(row: MatchRow, seasonYear: number): LiveMatch {
  return {
    id: row.id,
    seasonYear,
    session: row.round,
    matchNumber: row.box_number,
    format: row.format as MatchFormat,
    teeTime: new Date(row.tee_time),
    maroonPlayers: row.maroon_players,
    whitePlayers: row.white_players,
    state: row.state as MatchState,
    started: row.started,
  };
}

const MATCH_COLUMNS = "id, round, box_number, format, tee_time, maroon_players, white_players, state, started";

export async function GET(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }
  const sessionParam = url.searchParams.get("session");

  const service = createSupabaseServiceRoleClient();
  let query = service.from("live_match_boxes").select(MATCH_COLUMNS).eq("season_year", year).order("round").order("box_number");
  if (sessionParam) query = query.eq("round", Number(sessionParam));

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the matches." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matches: (data ?? []).map((row) => rowToMatch(row, year)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session, matchNumber, maroonPlayers, whitePlayers } = await request.json();
  if (
    !isValidSeasonYear(year) ||
    typeof session !== "number" ||
    typeof matchNumber !== "number" ||
    !Array.isArray(maroonPlayers) ||
    !Array.isArray(whitePlayers)
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: sessionRow } = await service.from("live_round_state").select("format, course_locked, matchups_locked, started, date, match_tee_times").eq("season_year", year).eq("round", session).single();
  if (!sessionRow?.course_locked || !sessionRow.format) {
    return NextResponse.json({ ok: false, error: "Lock this session's course and format before building matchups." }, { status: 400 });
  }
  if (sessionRow.started) {
    return NextResponse.json({ ok: false, error: "This session is armed; use Tiger's correction flow for a live matchup." }, { status: 400 });
  }
  const format = sessionRow.format as MatchFormat;

  const teeTimes = (sessionRow.match_tee_times as (string | null)[] | null) ?? [null, null, null];
  const slot = teeTimeSlotForMatch(format, matchNumber);
  const teeTime = deriveMatchTeeTime(sessionRow.date, teeTimes[slot] ?? null);
  if (!teeTime) {
    return NextResponse.json({ ok: false, error: "This session's tee times aren't set yet — set and lock them in Courses & Format first." }, { status: 400 });
  }

  const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
  const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

  const { data: existingRows } = await service.from("live_match_boxes").select(MATCH_COLUMNS).eq("season_year", year).eq("round", session);
  const existingMatches = (existingRows as MatchRow[] | null ?? []).map((row) => rowToMatch(row, year)).filter((match) => match.matchNumber !== matchNumber);

  const candidate: LiveMatch = {
    id: null,
    seasonYear: year,
    session,
    matchNumber,
    format,
    teeTime,
    maroonPlayers,
    whitePlayers,
    state: "Scheduled",
    started: false,
  };

  const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes: [...existingMatches, candidate] };
  const errors = validateMatchBox(snapshot, candidate);
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });
  }

  const { data: currentMatch } = await service.from("live_match_boxes").select("id").eq("season_year", year).eq("round", session).eq("box_number", matchNumber).maybeSingle();
  if (currentMatch) {
    const { error } = await service
      .from("live_match_boxes")
      .update({ format, tee_time: teeTime.toISOString(), maroon_players: maroonPlayers, white_players: whitePlayers })
      .eq("id", currentMatch.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not save that match." }, { status: 500 });
    if (sessionRow.matchups_locked) {
      try {
        await syncLockedSessionToCareerArchive(year, session);
      } catch {
        return NextResponse.json({ ok: false, error: "Match saved, but its published archive/odds update failed." }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, id: currentMatch.id });
  }

  const { data: inserted, error } = await service
    .from("live_match_boxes")
    .insert({ season_year: year, round: session, box_number: matchNumber, format, tee_time: teeTime.toISOString(), maroon_players: maroonPlayers, white_players: whitePlayers })
    .select("id")
    .single();
  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: "Could not save that match." }, { status: 500 });
  }
  if (sessionRow.matchups_locked) {
    try {
      await syncLockedSessionToCareerArchive(year, session);
    } catch {
      return NextResponse.json({ ok: false, error: "Match saved, but its published archive/odds update failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
```

Note the behavior change from the spec (§3/§4): this route no longer accepts a `teeTime` field at all — it derives one server-side from the locked session's `matchTeeTimes`. This is what makes the tee time "inherited/read-only" on the Matchups page in Task 9.

- [ ] **Step 3: Rewrite `matches/remove/route.ts`, `matches/start/route.ts`, `matches/closeout/route.ts`**

`matches/remove/route.ts` — only the error copy changes ("match box" → "match"); it takes a plain `id`, no `round`/`boxNumber` field to rename in its request body:

```typescript
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

  const { data: match } = await service.from("live_match_boxes").select("season_year, round").eq("id", id).single();
  if (!match) {
    return NextResponse.json({ ok: false, error: "Match not found." }, { status: 404 });
  }

  const { data: sessionRow } = await service.from("live_round_state").select("matchups_locked").eq("season_year", match.season_year).eq("round", match.round).single();
  if (sessionRow?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this session's matchups before removing a match." }, { status: 400 });
  }

  const { error } = await service.from("live_match_boxes").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that match." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

`matches/closeout/route.ts` — untouched: it never references `round`/`boxNumber` at all (just an opaque `id` passed straight to the `close_live_match_atomic` RPC). Move it with `git mv` (Step 1) and make no content changes.

`matches/start/route.ts` was fully read during design — apply exactly this diff:

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Tiger's per-match tee-time override. The session must already be armed. */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const { id } = await request.json();
  if (typeof id !== "string" || !id) return NextResponse.json({ ok: false, error: "Missing match." }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data: match } = await service.from("live_match_boxes").select("id, season_year, round, state").eq("id", id).single();
  if (!match) return NextResponse.json({ ok: false, error: "Match not found." }, { status: 404 });
  if (match.state === "Final") return NextResponse.json({ ok: false, error: "This match is already final." }, { status: 400 });

  const { data: session } = await service
    .from("live_round_state")
    .select("course_locked, matchups_locked, started")
    .eq("season_year", match.season_year)
    .eq("round", match.round)
    .single();
  if (!session?.course_locked || !session.matchups_locked || !session.started) {
    return NextResponse.json({ ok: false, error: "Arm the session before starting an individual match." }, { status: 400 });
  }

  const { error } = await service.from("live_match_boxes").update({ state: "Live", started: true, started_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "Could not start this match." }, { status: 500 });
  await service.from("live_score_audit_events").insert({ season_year: match.season_year, match_box_id: match.id, round: match.round, actor_profile_id: host.userId, kind: "match_started" });
  return NextResponse.json({ ok: true });
}
```

For `matches/remove/route.ts` and `matches/closeout/route.ts` (not read in full during design): open each, confirm whether it references `round`/`box_number`/`LiveMatchBox` at all — if it only takes an `id` and deletes/updates a row by id (likely, mirroring the pattern above), no field renames are needed beyond updating any `LiveMatchBox` type import to `LiveMatch`.

- [ ] **Step 4: Update the moved `.test.ts` files**

Same pattern as Task 6 Step 5 — update the request URL path and any renamed body fields (`round`→`session`, `boxNumber`→`matchNumber`, drop `teeTime` from any POST test body since the route no longer accepts it — if an existing test asserts on `teeTime` in the request, update it to assert the route still succeeds without one, driven instead by the session's `match_tee_times`).

- [ ] **Step 5: Run the tests**

Run: the 3-4 renamed `.test.ts` files under `app/api/portal/tiger/matches/`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/portal/tiger/matches app/api/portal/tiger/matchboxes
git commit -m "Rename tiger/matchboxes API to tiger/matches; derive tee time server-side"
```

---

### Task 8: Update the two server page components

**Files:**
- Modify: `app/portal/admin/master-settings/[year]/courses-format/page.tsx`, `app/portal/admin/master-settings/[year]/matchups/page.tsx`

**Interfaces:**
- Consumes: `LiveSessionState`, `LiveMatch` from Task 3; `CoursesFormatPanel`, `MatchupsPanel` props from Tasks 9–10 (see those tasks' "Consumes" for the exact prop names these pages must pass).

- [ ] **Step 1: Rewrite `courses-format/page.tsx`**

```typescript
// app/portal/admin/master-settings/[year]/courses-format/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { CoursesFormatPanel } from "@/components/portal/tiger/CoursesFormatPanel";
import type { LiveCourse, LiveSessionState, MatchFormat, TournamentSettings } from "@/lib/live/types";

export default async function CoursesFormatPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!isValidSeasonYear(year)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const [{ data: settingsRow }, { data: sessionRows }, { data: courseRows }] = await Promise.all([
    service
      .from("live_tournament_settings")
      .select("round_count, completed_at, venue_name, venue_locked, begin_date, end_date, dates_locked")
      .eq("season_year", year)
      .maybeSingle(),
    service
      .from("live_round_state")
      .select("round, started, course_id, date, format, course_locked, matchups_locked, course_setup, match_tee_times")
      .eq("season_year", year)
      .order("round"),
    service.from("live_courses").select("id, name, holes, rating, slope, tee_sets").order("name"),
  ]);

  const settings: TournamentSettings = {
    sessionCount: settingsRow?.round_count ?? null,
    completedAt: settingsRow?.completed_at ?? null,
    venueName: settingsRow?.venue_name ?? null,
    venueLocked: settingsRow?.venue_locked ?? false,
    beginDate: settingsRow?.begin_date ?? null,
    endDate: settingsRow?.end_date ?? null,
    datesLocked: settingsRow?.dates_locked ?? false,
  };
  const sessions: LiveSessionState[] = (sessionRows ?? []).map((r) => ({
    seasonYear: year,
    session: r.round,
    started: r.started,
    courseId: r.course_id,
    date: r.date,
    format: r.format as MatchFormat | null,
    courseLocked: r.course_locked,
    matchupsLocked: r.matchups_locked,
    courseSetup: r.course_setup,
    matchTeeTimes: (r.match_tee_times as (string | null)[] | null) ?? [null, null, null],
  }));
  const courses: LiveCourse[] = (courseRows ?? []).map((c) => ({ id: c.id, name: c.name, holes: c.holes, rating: c.rating, slope: c.slope, teeSets: Array.isArray(c.tee_sets) ? c.tee_sets : [] }));

  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Courses & Format</h1>
      <CoursesFormatPanel year={year} initialSettings={settings} initialSessions={sessions} initialCourses={courses} />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `matchups/page.tsx`**

```typescript
// app/portal/admin/master-settings/[year]/matchups/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { playerProfiles } from "@/lib/data/players";
import { MatchupsPanel, type RosterPlayer } from "@/components/portal/tiger/MatchupsPanel";
import type { LiveMatch, LiveSessionState, MatchFormat, MatchState } from "@/lib/live/types";

export default async function MatchupsPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!isValidSeasonYear(year)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const [{ data: sessionRows }, { data: matchRows }, { data: rosterRows }] = await Promise.all([
    service
      .from("live_round_state")
      .select("round, started, course_id, date, format, course_locked, matchups_locked, match_tee_times")
      .eq("season_year", year)
      .order("round"),
    service
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("season_year", year)
      .order("round")
      .order("box_number"),
    service.from("live_roster").select("player_slug, team").eq("season_year", year),
  ]);

  const sessions: LiveSessionState[] = (sessionRows ?? []).map((r) => ({
    seasonYear: year,
    session: r.round,
    started: r.started,
    courseId: r.course_id,
    date: r.date,
    format: r.format as MatchFormat | null,
    courseLocked: r.course_locked,
    matchupsLocked: r.matchups_locked,
    matchTeeTimes: (r.match_tee_times as (string | null)[] | null) ?? [null, null, null],
  }));

  const matches: LiveMatch[] = (matchRows ?? []).map((b) => ({
    id: b.id,
    seasonYear: year,
    session: b.round,
    matchNumber: b.box_number,
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
        Assign players into matches for each session whose course, format, and tee times are locked. Lock Matchups
        once a session is fully set to make it visible on the Website and Player Portals.
      </p>
      <MatchupsPanel year={year} sessions={sessions} initialMatches={matches} roster={roster} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check just these two files' shape (full check happens after Tasks 9-10 exist)**

Run: `npx tsc --noEmit` — expect errors only inside `CoursesFormatPanel.tsx`/`MatchupsPanel.tsx` now (prop mismatches), which Tasks 9–10 fix.

- [ ] **Step 3: Commit**

```bash
git add "app/portal/admin/master-settings/[year]/courses-format/page.tsx" "app/portal/admin/master-settings/[year]/matchups/page.tsx"
git commit -m "Update Courses & Format / Matchups pages for renamed Session data"
```

---

### Task 9: `CoursesFormatPanel.tsx` — rename + 3 tee-time inputs

**Files:**
- Modify: `components/portal/tiger/CoursesFormatPanel.tsx`

**Interfaces:**
- Consumes: `LiveSessionState`, `LiveCourse`, `LiveTeeSet`, `MatchFormat`, `TournamentSettings` (Task 3); no helper from Task 2 needed here (this panel only stores raw "HH:MM" strings, doesn't need to derive an absolute instant).
- Produces: props `{ year, initialSettings, initialSessions, initialCourses }` (renamed from `initialRounds`) — matches what Task 8 now passes.

- [ ] **Step 1: Rewrite the file**

```typescript
// components/portal/tiger/CoursesFormatPanel.tsx
"use client";
import { availableTeeSets } from "@/lib/live/teeSets";

import { useState } from "react";
import Link from "next/link";
import type { LiveCourse, LiveSessionState, LiveTeeSet, MatchFormat, TournamentSettings } from "@/lib/live/types";

const FORMATS: MatchFormat[] = ["Fourball", "Foursome", "Singles"];

function matchTeeTimeLabels(format: MatchFormat | null): [string, string, string] {
  if (format === "Singles") return ["Match 1 & 2", "Match 3 & 4", "Match 5 & 6"];
  return ["Match 1", "Match 2", "Match 3"];
}

export function CoursesFormatPanel({
  year,
  initialSettings,
  initialSessions,
  initialCourses,
}: {
  year: number;
  initialSettings: TournamentSettings;
  initialSessions: LiveSessionState[];
  initialCourses: LiveCourse[];
}) {
  // null (never configured yet) shows a blank placeholder instead of
  // defaulting to a real number like 8 — picking "8" from a dropdown that
  // already shows "8" fires no onChange event at all (the browser only
  // fires change when the value actually changes), so nothing would ever
  // save on first setup. Every option is a real value once one is chosen,
  // since sessionCount then reflects a real, already-saved number.
  const [sessionCount, setSessionCount] = useState<number | null>(initialSettings.sessionCount);
  const [sessions, setSessions] = useState(initialSessions);
  const courses = initialCourses;
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveSessionCount(count: number) {
    setSessionCount(count);
    const res = await fetch("/api/portal/tiger/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, roundCount: count }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  async function updateSession(session: number, patch: { date?: string; courseId?: string; format?: MatchFormat; courseSetup?: { teeSetId: string; holeTeeSetIds: Record<string, string> }; matchTeeTimes?: (string | null)[] }) {
    setError(null);
    // An empty string from a cleared <input type="date"> means "no date
    // set" — normalize it to null so it matches how a blank date is
    // represented elsewhere in LiveSessionState, instead of sending "" to a
    // Postgres `date` column (which would 500).
    const date = patch.date === "" ? null : patch.date;
    const res = await fetch("/api/portal/tiger/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, session, ...patch, date }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setSessions((current) =>
      current.map((s) => {
        if (s.session !== session) return s;
        return {
          ...s,
          date: patch.date !== undefined ? (date ?? null) : s.date,
          courseId: patch.courseId ?? s.courseId,
          format: patch.format ?? s.format,
          courseSetup: patch.courseSetup ? { teeSetId: patch.courseSetup.teeSetId, teeSetName: "", holes: s.courseSetup?.holes ?? [], rating: s.courseSetup?.rating ?? null, slope: s.courseSetup?.slope ?? null, holeTeeSetIds: patch.courseSetup.holeTeeSetIds } : patch.courseId ? null : s.courseSetup,
          matchTeeTimes: patch.matchTeeTimes ?? s.matchTeeTimes,
        };
      })
    );
  }

  function teeSetsFor(course: LiveCourse): LiveTeeSet[] {
    return availableTeeSets(course.teeSets);
  }

  async function saveCourseSetup(session: LiveSessionState, teeSetId: string, changedHole?: number, changedTeeSetId?: string) {
    const course = courses.find((entry) => entry.id === session.courseId);
    if (!course) return;
    const current = session.courseSetup?.teeSetId ?? teeSetId;
    const holeTeeSetIds = changedHole ? { ...(session.courseSetup?.holeTeeSetIds ?? Object.fromEntries(course.holes.map((hole) => [String(hole.number), current]))) } : Object.fromEntries(course.holes.map((hole) => [String(hole.number), teeSetId]));
    if (changedHole && changedTeeSetId) holeTeeSetIds[String(changedHole)] = changedTeeSetId;
    await updateSession(session.session, { courseId: course.id, courseSetup: { teeSetId, holeTeeSetIds } });
  }

  function updateTeeTimeSlot(session: LiveSessionState, slot: number, value: string) {
    const next = [...session.matchTeeTimes];
    next[slot] = value === "" ? null : value;
    void updateSession(session.session, { matchTeeTimes: next });
  }

  async function toggleLock(session: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/sessions/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, session, lock: "course", value }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setSessions((current) => current.map((s) => (s.session === session ? { ...s, courseLocked: value } : s)));
  }

  async function removeSession(session: number) {
    setError(null);
    const res = await fetch("/api/portal/tiger/sessions/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, session }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      setRemoveTarget(null);
      return;
    }
    setSessions((current) => current.filter((s) => s.session !== session));
    setRemoveTarget(null);
  }

  return (
    <div className="mt-6">
      <p className="mb-4 rounded-sm border border-gold-300 bg-cream-100 px-3 py-2 font-sans text-sm text-ink-700">Courses are selected from the shared <Link href="/portal/admin/course-library" className="font-semibold text-maroon-700 underline">Course Library</Link>, so adding or editing a course never belongs to one season.</p>
      <label className="font-sans text-sm font-semibold text-ink-700">
        Number of sessions:{" "}
        <select
          value={sessionCount ?? ""}
          onChange={(e) => saveSessionCount(Number(e.target.value))}
          className="border-2 border-stone-300 rounded-lg px-2 py-1"
        >
          <option value="" disabled>
            Choose a number
          </option>
          {[6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <div className="mt-6 space-y-4">
        {sessions.map((session) => (
          <div key={session.session} className="rounded-lg border-2 border-stone-300 p-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-lg font-bold text-ink-900">Session {session.session}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleLock(session.session, !session.courseLocked)}
                  className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                >
                  {session.courseLocked ? "Unlock" : "Lock"}
                </button>
                {!session.courseLocked && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(session.session)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-600 underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="date"
                value={session.date ?? ""}
                disabled={session.courseLocked}
                onChange={(e) => updateSession(session.session, { date: e.target.value })}
                className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
              />
              <select
                value={session.courseId ?? ""}
                disabled={session.courseLocked}
                onChange={(e) => updateSession(session.session, { courseId: e.target.value })}
                className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
              >
                <option value="" disabled>
                  Choose a course
                </option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={session.format ?? ""}
                disabled={session.courseLocked}
                onChange={(e) => updateSession(session.session, { format: e.target.value as MatchFormat })}
                className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
              >
                <option value="" disabled>
                  Choose a format
                </option>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 border-t border-gold-200 pt-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {matchTeeTimeLabels(session.format).map((label, slot) => (
                  <label key={slot} className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">
                    {label}
                    <input
                      type="time"
                      value={session.matchTeeTimes[slot] ?? ""}
                      disabled={session.courseLocked}
                      onChange={(e) => updateTeeTimeSlot(session, slot, e.target.value)}
                      className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-2 py-2 font-sans text-sm normal-case text-ink-900"
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 font-sans text-xs text-ink-500">Tee times are Pacific Time.</p>
            </div>

            {!session.courseLocked && session.courseId && (() => {
              const course = courses.find((entry) => entry.id === session.courseId);
              if (!course) return null;
              const teeSets = teeSetsFor(course);
              if (!teeSets.length) return <p className="mt-4 text-sm text-ink-500">Lock a tee set in the Course Library to make it available for this session.</p>;
              const selectedTeeId = session.courseSetup?.teeSetId ?? "";
              return <div className="mt-4 border-t border-gold-200 pt-3">
                <div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-48 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Base tee set<select value={selectedTeeId} onChange={(event) => saveCourseSetup(session, event.target.value)} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-2 py-2 font-sans text-sm normal-case text-ink-900"><option value="" disabled>Choose locked tees</option>{teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name}{tee.rating != null ? ` · ${tee.rating}/${tee.slope ?? "—"}` : ""}</option>)}</select></label><span className="font-sans text-xs text-ink-500">Choose a tee for the whole session, then adjust individual holes below.</span></div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{course.holes.map((hole) => <label key={hole.number} className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Hole {hole.number}<select value={session.courseSetup?.holeTeeSetIds?.[String(hole.number)] ?? selectedTeeId} onChange={(event) => saveCourseSetup(session, selectedTeeId, hole.number, event.target.value)} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-1 py-1.5 font-sans text-xs normal-case text-ink-900"><option value="" disabled>Choose locked tees</option>{teeSets.map((tee) => <option key={tee.id} value={tee.id}>{tee.name} · {tee.holes.find((entry) => entry.number === hole.number)?.yards ?? "—"}</option>)}</select></label>)}</div>
              </div>;
            })()}

            {removeTarget === session.session && (
              <div className="mt-3 rounded-lg bg-red-50 p-3">
                <p className="font-sans text-sm text-red-700">Remove Session {session.session}? This can&apos;t be undone.</p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => removeSession(session.session)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-700 underline"
                  >
                    Yes, remove it
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(null)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Note: the `/api/portal/tiger/settings` request body key stays `roundCount` (that route wasn't in this plan's scope — it's `TournamentSettings.sessionCount`'s backing endpoint, a different route from the ones renamed in Task 6; leave it as-is unless `npx tsc --noEmit` in Task 13 flags a real mismatch, in which case open `app/api/portal/tiger/settings/route.ts` and apply the same field-rename pattern used everywhere else in this plan).

- [ ] **Step 2: Manual check**

Run: `npm run dev`, log in as a host, open Courses & Format for the active season. Confirm: header reads "Session N"; "Number of sessions" label; each session shows 3 tee-time inputs labeled per its format (or "Match 1/2/3" before a format is chosen, since `matchTeeTimeLabels(null)` returns the Fourball/Foursome labels — acceptable, since Singles-specific "1&2" labels only matter once Singles is actually selected); typing a time and reloading shows it persisted; Lock is refused with a clear error if any of the 3 times is blank.

- [ ] **Step 3: Commit**

```bash
git add components/portal/tiger/CoursesFormatPanel.tsx
git commit -m "Rename CoursesFormatPanel to Sessions; add 3 match tee-time inputs"
```

---

### Task 10: `MatchupsPanel.tsx` — rename + read-only tee times + per-format layout

**Files:**
- Modify: `components/portal/tiger/MatchupsPanel.tsx`

**Interfaces:**
- Consumes: `LiveSessionState`, `LiveMatch`, `MatchFormat` (Task 3); `teeTimeSlotForMatch`, `deriveMatchTeeTime`, `formatPacificTeeTime` (Task 2); `matchesPerSession`, `playersPerTeamPerMatch` (Task 4).
- Produces: props `{ year, sessions, initialMatches, roster }` — matches what Task 8 passes.

- [ ] **Step 1: Rewrite the file**

```typescript
// components/portal/tiger/MatchupsPanel.tsx
"use client";

import { useState } from "react";
import { matchesPerSession, playersPerTeamPerMatch } from "@/lib/live/orchestration";
import { deriveMatchTeeTime, formatPacificTeeTime, teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
import type { LiveMatch, LiveSessionState, MatchFormat } from "@/lib/live/types";

export interface RosterPlayer {
  playerSlug: string;
  fullName: string;
  team: "maroon" | "white";
}

interface MatchDraft {
  id: string | null;
  matchNumber: number;
  maroonPlayers: (string | null)[];
  whitePlayers: (string | null)[];
}

function blankMatch(matchNumber: number, format: MatchFormat): MatchDraft {
  const perTeam = playersPerTeamPerMatch(format);
  return { id: null, matchNumber, maroonPlayers: Array(perTeam).fill(null), whitePlayers: Array(perTeam).fill(null) };
}

function availablePlayers(pool: RosterPlayer[], drafts: MatchDraft[], side: "maroonPlayers" | "whitePlayers", currentMatchNumber: number, currentValue: string | null): RosterPlayer[] {
  const usedElsewhere = new Set(
    drafts
      .filter((d) => d.matchNumber !== currentMatchNumber)
      .flatMap((d) => d[side])
      .filter((p): p is string => p !== null)
  );
  return pool.filter((p) => p.playerSlug === currentValue || !usedElsewhere.has(p.playerSlug));
}

/** A left player, "Scoring For", right player — the shape every format's opponent pairing reduces to. */
function OpponentSelectRow({
  maroonValue,
  whiteValue,
  maroonOptions,
  whiteOptions,
  disabled,
  onMaroonChange,
  onWhiteChange,
}: {
  maroonValue: string | null;
  whiteValue: string | null;
  maroonOptions: RosterPlayer[];
  whiteOptions: RosterPlayer[];
  disabled: boolean;
  onMaroonChange: (value: string | null) => void;
  onWhiteChange: (value: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <select
        value={maroonValue ?? ""}
        disabled={disabled}
        onChange={(e) => onMaroonChange(e.target.value || null)}
        className="w-full rounded-lg border-2 border-maroon-700 bg-maroon-50 px-2 py-1 text-sm"
      >
        <option value="">Choose a player</option>
        {maroonOptions.map((p) => (
          <option key={p.playerSlug} value={p.playerSlug}>
            {p.fullName}
          </option>
        ))}
      </select>
      <span className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Scoring For</span>
      <select
        value={whiteValue ?? ""}
        disabled={disabled}
        onChange={(e) => onWhiteChange(e.target.value || null)}
        className="w-full rounded-lg border-2 border-stone-400 bg-stone-50 px-2 py-1 text-sm"
      >
        <option value="">Choose a player</option>
        {whiteOptions.map((p) => (
          <option key={p.playerSlug} value={p.playerSlug}>
            {p.fullName}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MatchupsPanel({
  year,
  sessions,
  initialMatches,
  roster,
}: {
  year: number;
  sessions: LiveSessionState[];
  initialMatches: LiveMatch[];
  roster: RosterPlayer[];
}) {
  // Saved matches only ever change via a full page reload, right after a
  // successful save/remove/lock (see saveMatch/removeMatch/toggleMatchupsLock
  // below) — so in-progress edits never need to live alongside them. They're
  // kept separately here, as plain strings/arrays keyed by "session:matchNumber"
  // and layered onto the saved data in draftFor() on every render. A reload
  // naturally clears this map along with the rest of the component's state.
  const [overrides, setOverrides] = useState<Record<string, Partial<MatchDraft>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const maroonRoster = roster.filter((p) => p.team === "maroon");
  const whiteRoster = roster.filter((p) => p.team === "white");
  const readySessions = sessions.filter((s): s is LiveSessionState & { format: MatchFormat } => s.courseLocked && s.format !== null);

  function draftKey(session: number, matchNumber: number): string {
    return `${session}:${matchNumber}`;
  }

  function draftFor(session: number, format: MatchFormat, matchNumber: number): MatchDraft {
    const saved = initialMatches.find((m) => m.session === session && m.matchNumber === matchNumber);
    const base: MatchDraft = saved
      ? { id: saved.id, matchNumber, maroonPlayers: saved.maroonPlayers, whitePlayers: saved.whitePlayers }
      : blankMatch(matchNumber, format);
    return { ...base, ...overrides[draftKey(session, matchNumber)] };
  }

  function updateDraft(session: number, matchNumber: number, patch: Partial<MatchDraft>) {
    const key = draftKey(session, matchNumber);
    setOverrides((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function teeTimeLabelFor(session: LiveSessionState & { format: MatchFormat }, matchNumber: number): string {
    const slot = teeTimeSlotForMatch(session.format, matchNumber);
    const teeTime = deriveMatchTeeTime(session.date, session.matchTeeTimes[slot] ?? null);
    return teeTime ? formatPacificTeeTime(teeTime) : "Tee time TBD";
  }

  async function saveMatch(session: LiveSessionState & { format: MatchFormat }, draft: MatchDraft) {
    const perTeam = playersPerTeamPerMatch(session.format);
    const maroonPlayers = draft.maroonPlayers.filter((p): p is string => p !== null);
    const whitePlayers = draft.whitePlayers.filter((p): p is string => p !== null);
    if (maroonPlayers.length !== perTeam || whitePlayers.length !== perTeam) {
      setError(`Match ${draft.matchNumber}: fill in ${perTeam} player${perTeam === 1 ? "" : "s"} per side before saving.`);
      return;
    }
    const key = `${session.session}:${draft.matchNumber}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          session: session.session,
          matchNumber: draft.matchNumber,
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

  async function removeMatch(id: string) {
    setError(null);
    const res = await fetch("/api/portal/tiger/matches/remove", {
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

  async function toggleMatchupsLock(session: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/sessions/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, session, lock: "matchups", value }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  async function startMatch(id: string) {
    setBusyKey(`start:${id}`);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/matches/start", {
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
    } finally {
      setBusyKey(null);
    }
  }

  function renderMatchControls(session: LiveSessionState & { format: MatchFormat }, draft: MatchDraft, drafts: MatchDraft[]) {
    const disabled = session.started;
    if (session.format === "Foursome") {
      return (
        <div className="relative grid grid-cols-2 gap-x-6 gap-y-3">
          <select value={draft.maroonPlayers[0] ?? ""} disabled={disabled} onChange={(e) => { const next = [...draft.maroonPlayers]; next[0] = e.target.value || null; updateDraft(session.session, draft.matchNumber, { maroonPlayers: next }); }} className="w-full rounded-lg border-2 border-maroon-700 bg-maroon-50 px-2 py-1 text-sm">
            <option value="">Choose a player</option>
            {availablePlayers(maroonRoster, drafts, "maroonPlayers", draft.matchNumber, draft.maroonPlayers[0]).map((p) => <option key={p.playerSlug} value={p.playerSlug}>{p.fullName}</option>)}
          </select>
          <select value={draft.whitePlayers[0] ?? ""} disabled={disabled} onChange={(e) => { const next = [...draft.whitePlayers]; next[0] = e.target.value || null; updateDraft(session.session, draft.matchNumber, { whitePlayers: next }); }} className="w-full rounded-lg border-2 border-stone-400 bg-stone-50 px-2 py-1 text-sm">
            <option value="">Choose a player</option>
            {availablePlayers(whiteRoster, drafts, "whitePlayers", draft.matchNumber, draft.whitePlayers[0]).map((p) => <option key={p.playerSlug} value={p.playerSlug}>{p.fullName}</option>)}
          </select>
          <select value={draft.maroonPlayers[1] ?? ""} disabled={disabled} onChange={(e) => { const next = [...draft.maroonPlayers]; next[1] = e.target.value || null; updateDraft(session.session, draft.matchNumber, { maroonPlayers: next }); }} className="w-full rounded-lg border-2 border-maroon-700 bg-maroon-50 px-2 py-1 text-sm">
            <option value="">Choose a player</option>
            {availablePlayers(maroonRoster, drafts, "maroonPlayers", draft.matchNumber, draft.maroonPlayers[1]).map((p) => <option key={p.playerSlug} value={p.playerSlug}>{p.fullName}</option>)}
          </select>
          <select value={draft.whitePlayers[1] ?? ""} disabled={disabled} onChange={(e) => { const next = [...draft.whitePlayers]; next[1] = e.target.value || null; updateDraft(session.session, draft.matchNumber, { whitePlayers: next }); }} className="w-full rounded-lg border-2 border-stone-400 bg-stone-50 px-2 py-1 text-sm">
            <option value="">Choose a player</option>
            {availablePlayers(whiteRoster, drafts, "whitePlayers", draft.matchNumber, draft.whitePlayers[1]).map((p) => <option key={p.playerSlug} value={p.playerSlug}>{p.fullName}</option>)}
          </select>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-ink-200 bg-white px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500 shadow-sm">Scoring For</span>
          </div>
        </div>
      );
    }

    // Fourball and Singles both reduce to 1 or 2 opponent rows.
    const rows = playersPerTeamPerMatch(session.format);
    return (
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <OpponentSelectRow
            key={i}
            maroonValue={draft.maroonPlayers[i] ?? null}
            whiteValue={draft.whitePlayers[i] ?? null}
            disabled={disabled}
            maroonOptions={availablePlayers(maroonRoster, drafts, "maroonPlayers", draft.matchNumber, draft.maroonPlayers[i] ?? null)}
            whiteOptions={availablePlayers(whiteRoster, drafts, "whitePlayers", draft.matchNumber, draft.whitePlayers[i] ?? null)}
            onMaroonChange={(value) => { const next = [...draft.maroonPlayers]; next[i] = value; updateDraft(session.session, draft.matchNumber, { maroonPlayers: next }); }}
            onWhiteChange={(value) => { const next = [...draft.whitePlayers]; next[i] = value; updateDraft(session.session, draft.matchNumber, { whitePlayers: next }); }}
          />
        ))}
      </div>
    );
  }

  function renderMatchCard(session: LiveSessionState & { format: MatchFormat }, draft: MatchDraft, drafts: MatchDraft[]) {
    return (
      <div key={draft.matchNumber} className="rounded-lg border border-stone-200 p-3">
        <div className="flex items-center justify-between">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">
            Match {draft.matchNumber} · {teeTimeLabelFor(session, draft.matchNumber)}
          </span>
          <div className="flex items-center gap-3">
            {draft.id && !session.started && (
              <button type="button" onClick={() => removeMatch(draft.id!)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-600 underline">
                Remove
              </button>
            )}
            {draft.id && session.started && (
              <button type="button" disabled={busyKey === `start:${draft.id}`} onClick={() => startMatch(draft.id!)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50">
                {busyKey === `start:${draft.id}` ? "Starting…" : "Start Match"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-2">{renderMatchControls(session, draft, drafts)}</div>

        {!session.started && (
          <button
            type="button"
            disabled={busyKey === `${session.session}:${draft.matchNumber}`}
            onClick={() => saveMatch(session, draft)}
            className="mt-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
          >
            {busyKey === `${session.session}:${draft.matchNumber}` ? "Saving…" : "Save Match"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      {readySessions.length === 0 && (
        <p className="font-sans text-sm text-ink-500">No sessions have their course, format, and tee times locked yet — set that up in Courses & Format first.</p>
      )}

      {readySessions.map((session) => {
        const drafts = Array.from({ length: matchesPerSession(session.format) }, (_, i) => draftFor(session.session, session.format, i + 1));
        return (
          <div key={session.session} className="rounded-lg border-2 border-stone-300 p-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-lg font-bold text-ink-900">
                Session {session.session} — {session.format}
              </span>
              <button
                type="button"
                onClick={() => toggleMatchupsLock(session.session, !session.matchupsLocked)}
                className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
              >
                {session.matchupsLocked ? "Unlock Matchups" : "Lock Matchups"}
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {session.format === "Singles"
                ? [0, 1, 2].map((slot) => (
                    <div key={slot} className={slot > 0 ? "space-y-4 border-t border-stone-200 pt-4" : "space-y-4"}>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {renderMatchCard(session, drafts[slot * 2], drafts)}
                        {renderMatchCard(session, drafts[slot * 2 + 1], drafts)}
                      </div>
                    </div>
                  ))
                : drafts.map((draft) => renderMatchCard(session, draft, drafts))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Design notes for the reviewer: Fourball and Singles share `OpponentSelectRow` (one row per player pair, "Scoring For" between opponents) — Fourball renders 2 rows (`playersPerTeamPerMatch("Fourball") === 2`), Singles renders 1 row per match, with 2 matches grouped visually per tee-time slot (the `[0,1,2].map` grouping, matching `teeTimeSlotForMatch`'s own grouping so the visual grouping and the actual shared-tee-time grouping can never drift apart). Foursome gets its own 2×2 grid with one centered "Scoring For" label spanning all 4 boxes, per spec §4.

- [ ] **Step 2: Manual check**

Run: `npm run dev`, open Matchups for a session locked with each of the 3 formats (create 3 test sessions if the active season doesn't have one of each). Confirm: header "Session N — Format"; each match shows "Match N · <time> PT" (no editable time input); Fourball shows 2 opponent rows with "Scoring For" between each pair; Foursome shows a 2×2 grid with one centered "Scoring For"; Singles shows 6 matches as 3 side-by-side pairs with a divider between pairs, each pair's 2 matches sharing the same displayed tee time.

- [ ] **Step 3: Commit**

```bash
git add components/portal/tiger/MatchupsPanel.tsx
git commit -m "Rename MatchupsPanel to Sessions/Matches; add per-format Scoring For layout"
```

---

### Task 11: Rename `StartRoundBanner` → `StartSessionBanner`

**Files:**
- Create (via `git mv`): `components/portal/tiger/StartSessionBanner.tsx`
- Modify: `app/portal/admin/page.tsx` (its one consumer)

**Interfaces:**
- Produces: `StartSessionBanner({ session: StartableSession })`, `StartableSession { year, session, format, courseName, date }` (renamed from `StartableRound { year, round, format, courseName, date }`).

- [ ] **Step 1: Move and rewrite the file**

```bash
git mv components/portal/tiger/StartRoundBanner.tsx components/portal/tiger/StartSessionBanner.tsx
```

```typescript
// components/portal/tiger/StartSessionBanner.tsx
"use client";

import { useState } from "react";

export interface StartableSession {
  year: number;
  session: number;
  format: string;
  courseName: string | null;
  date: string | null;
}

export function StartSessionBanner({ session }: { session: StartableSession }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: session.year, session: session.session }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border-2 border-maroon-700 bg-maroon-50 p-4">
      <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700">Ready to start</span>
      <div className="mt-1 font-serif text-xl font-bold text-ink-900">
        Session {session.session} — {session.courseName ?? "Course TBD"} ({session.format})
      </div>
      {session.date && <div className="mt-1 font-sans text-sm text-ink-500">{session.date}</div>}
      {error && <p className="mt-2 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={start}
        className="mt-3 rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {busy ? "Starting…" : "Start Session"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/portal/admin/page.tsx`**

Line 7's import and lines 20-26/32 build the banner's data. Apply this exact diff:

```typescript
import { StartSessionBanner, type StartableSession } from "@/components/portal/tiger/StartSessionBanner";
```

```typescript
  const activeYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();
  const [{ data: sessionRows }, { data: courseRows }] = await Promise.all([
    service.from("live_round_state").select("round, date, format, course_id, course_locked, matchups_locked, started").eq("season_year", activeYear).order("round"),
    service.from("live_courses").select("id, name"),
  ]);
  const courseNameById = new Map((courseRows ?? []).map((course) => [course.id, course.name as string]));
  const nextSession = (sessionRows ?? []).find((session) => session.course_locked && session.matchups_locked && !session.started);
  const startable: StartableSession | null = nextSession ? { year: activeYear, session: nextSession.round, format: nextSession.format ?? "", courseName: nextSession.course_id ? courseNameById.get(nextSession.course_id) ?? null : null, date: nextSession.date } : null;
```

```typescript
      {startable && <StartSessionBanner session={startable} />}
```

(The Supabase query itself — table/column names — is unchanged; only the local variable names (`roundRows`→`sessionRows`, `nextRound`→`nextSession`) and the `StartableSession` object's `session:` key change.)

- [ ] **Step 3: Manual check**

Run: `npm run dev`, confirm `/portal/admin` still shows the "Ready to start" banner for a locked, unstarted session, with "Session N" wording and a working "Start Session" button.

- [ ] **Step 4: Commit**

```bash
git add components/portal/tiger/StartSessionBanner.tsx components/portal/tiger/StartRoundBanner.tsx app/portal/admin/page.tsx
git commit -m "Rename StartRoundBanner to StartSessionBanner"
```

---

### Task 12: Sweep remaining Round/Box text and Central→Pacific tee-time displays

**Files:**
- Modify: `components/schedule/VenueSchedulePage.tsx`, `components/portal/tiger/MatchCloseoutCards.tsx`, `components/portal/tiger/BroadcastControlsPanel.tsx`, `components/portal/tiger/TestSeasonPanel.tsx`, `components/portal/ScoringStatusScreen.tsx`, `components/wagers/LiveMatchesList.tsx`, `lib/portal/matchCards.ts`, `lib/data/liveRoundFormatArchive.ts`, `lib/live/matchProfile.ts`, `lib/live/matchProfile.test.ts`, `components/ui/RoundCountdown.tsx`

This task is a precise, itemized list — every change below was confirmed by reading the actual file during planning; there is nothing else to hunt for beyond what's listed.

- [ ] **Step 1: `components/schedule/VenueSchedulePage.tsx`**

Rename the component `RoundBox` → `UpcomingSessionBox` (avoids colliding, even just as a code-reading matter, with the pre-existing `SessionBox` component in the same file that serves *past* years' legacy day/session grid — see spec §1's "known, accepted overlap"). Its prop type `UpcomingRoundScheduleItem` (from `lib/data/activeSeasonOverlay.ts`) and field `round.round` — check `activeSeasonOverlay.ts` for how this type is built; if it's a thin type re-exporting `LiveSessionState`-derived data, rename its `round` field to `session` consistently and update `roundDateLabel` calls accordingly. Inside the component:

```typescript
function UpcomingSessionBox({ session }: { session: UpcomingRoundScheduleItem }) {
  return (
    <div className="rounded-md border border-ink-200 bg-white px-3 py-4 text-center">
      <div className="font-condensed text-[10px] font-semibold uppercase tracking-wide text-maroon-600">
        Session {session.session}{session.date ? ` · ${roundDateLabel(session.date)}` : ""}
      </div>
      <div className="mt-2 font-sans text-sm font-bold text-ink-900">{session.format ?? "Format TBD"}</div>
      <div className="mt-1 font-sans text-xs text-ink-500">{session.courseName ?? "Course TBD"}</div>
    </div>
  );
}
```

(rename its `round` prop to `session`, and rename `UpcomingRoundScheduleItem.round` to `.session` at its source in `lib/data/activeSeasonOverlay.ts`, propagating that one-field rename through whatever builds it). And in `VenueSchedulePage` itself, update the section header and the map call:

```typescript
{rounds.length > 0 ? (
  <section className="mb-9">
    <div className="mb-3 font-condensed text-[11px] font-semibold uppercase tracking-eyebrow text-maroon-600">Sessions</div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {rounds.map((session) => (
        <UpcomingSessionBox key={session.session} session={session} />
      ))}
    </div>
  </section>
) : ...
```

(The `rounds`/`venue.sessions` prop names on `VenueSchedulePage` itself and the legacy `SessionBox`/`venue.sessions` branch for past years are untouched — out of scope.)

- [ ] **Step 2: `components/portal/tiger/MatchCloseoutCards.tsx`**

Line 6's `Entry` type and line 31's display text both use `match.round`/`match.box_number` read directly off the `/api/live/matches` response (not through `LiveMatch` — that endpoint wasn't touched by this plan, confirm by checking `app/api/live/matches/route.ts`; if it already returns camelCase `session`/`matchNumber` after some other change, adjust accordingly, but as read during design it returns raw snake_case). Rename the display text only (data field names stay matching whatever `/api/live/matches` actually returns):

```typescript
<p className="font-sans text-sm font-semibold text-ink-900">Session {match.round}, Match {match.box_number}: {officialState?.leader === "tie" ? "Tied" : `${officialState?.leader} ${officialState?.margin} up`}</p>
```

(Only the literal word "Round" → "Session" changes; `match.round`/`match.box_number` field access is unchanged since it mirrors the API's raw response shape, which is outside this plan's route-rename scope — `/api/live/matches` was never one of the renamed routes.)

- [ ] **Step 3: `components/portal/tiger/BroadcastControlsPanel.tsx`**

Line 1020, the placeholder text only:

```typescript
placeholder="e.g. Session 1 tee times pushed back 15 minutes"
```

- [ ] **Step 4: `components/portal/tiger/TestSeasonPanel.tsx`**

Line 52 only (the ordinal reference; "Start the round" stays — that's the generic "Start Round"/now "Start Session" action, already covered by Task 11's rename of the button itself, so update this line to match the new button label too):

```typescript
<li>In Open Test Setup, lock a course and matchups for Session 1 using two players you can log in as, then Start the session from this page.</li>
```

Leave line 55 ("presses Submit Round") and line 50's heading ("Begin Round... Submit Round") untouched — generic golf-round vocabulary, per Global Constraints.

- [ ] **Step 5: `components/portal/ScoringStatusScreen.tsx`**

Two changes: the ordinal rename on line 51, and the Central→Pacific conversion of `formatTeeTime`:

```typescript
function formatTeeTime(date: Date): string {
  return `${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })} PT`;
}
```

```typescript
const { matchBox, session } = result; // was: const { matchBox, round } = result; — CurrentRoundResult.round is now CurrentSessionResult.session (Task 5)
...
<p className="font-sans text-base text-cream-50/80">Session {session.session} &middot; {matchBox.format}{progress?.courseName ? ` · ${progress.courseName}` : ""}</p>
```

Leave `"Upcoming Round"`/`"Round Submitted"`/`"Round Live"` (line 45) untouched — generic status headings, per Global Constraints.

- [ ] **Step 6: `components/wagers/LiveMatchesList.tsx`**

Line 43, ordinal rename only (same caveat as Step 2 — this reads the same `/api/live/matches` raw response, field names unchanged):

```typescript
<p className="mt-1 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Session {match.round} · {match.format} · {state}</p>
```

- [ ] **Step 7: `lib/portal/matchCards.ts`**

Rename `LiveMatchCardInput.round` → `.session` (this type is built by this plan's own renamed `LiveMatch`-consuming code, so it's safe to rename fully), update `roundFormatLabel` to `Session ${input.session} · ${input.format}`, and convert the tee-time timezone:

```typescript
export interface LiveMatchCardInput {
  id: string;
  status: "Live" | "Upcoming" | "Past";
  course: string | null;
  session: number;
  format: string;
  maroonPlayers: string[];
  whitePlayers: string[];
  teeTime: Date;
  official: { leader: "maroon" | "white" | "tie"; margin: number; thru: number; mathematicallyComplete: boolean } | null;
  maroonOdds: number | null;
  whiteOdds: number | null;
}

export function liveMatchCard(input: LiveMatchCardInput): PortalMatchCard {
  const base = {
    id: input.id,
    status: input.status,
    course: input.course,
    roundFormatLabel: `Session ${input.session} · ${input.format}`,
    maroonPlayers: input.maroonPlayers,
    whitePlayers: input.whitePlayers,
    maroonOdds: input.maroonOdds,
    whiteOdds: input.whiteOdds,
  };

  if (input.status === "Upcoming") {
    const teeTimeLabel = input.teeTime.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    });
    return { ...base, statusLabel: "VS", progressLabel: `${teeTimeLabel} PT`, leader: null };
  }
  // ...rest of the function unchanged
```

Find every caller that builds a `LiveMatchCardInput` (grep for `LiveMatchCardInput` and `liveMatchCard(`) and rename the `round:` key they pass to `session:`.

- [ ] **Step 8: `lib/data/liveRoundFormatArchive.ts`**

This function reads the **live** snapshot (`snapshot.matchBoxes`) to publish freshly-completed live sessions into the archive format — it is not touching any hand-typed historical per-year file. Rename `box.round` → `box.session` (both occurrences, lines 6 and 8) and convert both `America/Chicago` timezones to `America/Los_Angeles`:

```typescript
export function liveRoundFormatArchive(snapshot: LiveTournamentSnapshot, slug: string, year: number, setups: RoundFormatSetup[]) {
  const rounds = [...new Set(snapshot.matchBoxes.map(box => box.session))].sort((a, b) => a - b);
  const dateFor = (round: number) => setups.find(setup => setup.seasonYear === year && setup.round === round)?.datePlayed ??
    snapshot.matchBoxes.find(box => box.session === round)?.teeTime.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) ?? "";
  // ... (the `round` local variable name and `setups`' own `.round` field are the RoundFormatSetup/archive shape — out of scope, unchanged)
```

And further down (originally line 17):

```typescript
        teeTime: box.teeTime.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) })) };
```

(and line 11/12/13's `box.round` → `box.session`, `boxes[0].format` unchanged, `setups.find(setup => setup.seasonYear === year && setup.round === round)` — leave `setup.round`/the local `round` variable alone, that's `RoundFormatSetup`'s own field, a different, unrenamed type).

- [ ] **Step 9: `lib/live/matchProfile.ts`'s `profileMatch()` — Pacific conversion**

Convert the one `America/Chicago` occurrence (the field name `teeTimeCst` on the shared `RealMatch` type stays exactly as-is — it's out of scope per Global Constraints, and this is the *live* computation path feeding that field, not the hand-typed historical data):

```typescript
teeTimeCst: match.tee_time && Number.isFinite(Date.parse(match.tee_time)) ? `${new Date(match.tee_time).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" })} PT` : undefined,
```

Update `matchProfile.test.ts` line 26 to match: the input `"2027-01-06T15:30:00Z"` is 7:30 AM Pacific (winter, PST, UTC-8) rather than 9:30 AM Central:

```typescript
entry.match.tee_time = "2027-01-06T15:30:00Z";
assert.equal(profileMatch(entry).teeTimeCst, "7:30 AM PT");
```

- [ ] **Step 10: `components/ui/RoundCountdown.tsx`**

This is a hardcoded homepage countdown constant, not wired to real session data — out of scope to make it dynamic (a separate, bigger change nobody asked for). Fix only its display text for the rename + timezone decisions, leaving `ROUND_ONE_START`'s actual UTC value untouched (it already correctly represents 7:30 AM Pacific / 9:30 AM Central — same instant):

```typescript
aria-label="Countdown to Session 1 at 7:30 AM PST on January 6, 2027"
```

(both `aria-label` occurrences, compact and full).

- [ ] **Step 11: Run the affected tests**

Run: `node --experimental-strip-types --test lib/live/matchProfile.test.ts` and any test files touching `lib/portal/matchCards.ts` or `lib/data/liveRoundFormatArchive.ts` (check for `matchCards.test.ts`/`liveRoundFormatArchive.test.ts`).
Expected: PASS with the updated Pacific-time assertions.

- [ ] **Step 12: Commit**

```bash
git add components/schedule/VenueSchedulePage.tsx components/portal/tiger/MatchCloseoutCards.tsx components/portal/tiger/BroadcastControlsPanel.tsx components/portal/tiger/TestSeasonPanel.tsx components/portal/ScoringStatusScreen.tsx components/wagers/LiveMatchesList.tsx lib/portal/matchCards.ts lib/data/liveRoundFormatArchive.ts lib/live/matchProfile.ts lib/live/matchProfile.test.ts components/ui/RoundCountdown.tsx lib/data/activeSeasonOverlay.ts
git commit -m "Sweep remaining Round->Session text; convert live tee-time displays to Pacific"
```

---

### Task 13: Full verification and project_specs.md

**Files:**
- Modify: `project_specs.md`

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass, same or greater total count than before this plan (Task 2 added 6 new tests).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. If any remain, they are leftover renames this plan's tasks didn't reach (most likely `app/api/live/matches/route.ts` or another untouched consumer of `LiveRoundState`/`LiveMatchBox`) — grep for the old type names (`LiveRoundState`, `LiveMatchBox`) repo-wide, confirm every remaining hit is intentionally out of scope per Global Constraints (historical/archive files), and fix any that aren't.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean on every file this plan touched (pre-existing unrelated lint errors elsewhere are not this plan's concern, per this repo's established convention).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean build; confirm the route list in the build output shows `/api/portal/tiger/sessions*` and `/api/portal/tiger/matches*` and no longer shows `/rounds*`/`/matchboxes*`.

- [ ] **Step 5: Manual walkthrough**

Run: `npm run dev`, log in as host, and walk the whole flow once: Courses & Format → set date/course/format + 3 tee times for a Fourball session, a Foursome session, and a Singles session → Lock each → Matchups → assign players to every match in each → Lock Matchups → confirm each format's layout matches spec §4 → `/portal/admin` shows the "Ready to start" `StartSessionBanner` for a locked-but-unstarted session → Start Session → confirm matches auto-flip to Live at their derived tee times (or use the existing "Start Match" override to confirm it still works) → public Schedule page shows "Session N" boxes.

- [ ] **Step 6: Update `project_specs.md`**

Add a new entry under "Previously shipped rounds" (that section's own name is unrelated to this task's "Round" rename — it's this file's own historical changelog heading, out of scope) summarizing: the Round→Session rename and its exact boundary (live/upcoming only, not historical/handicap), the 3 Pacific-Time match tee times per session, that locking still requires a manual Start Session/Start Match as before, and the per-format Matchups layout. Follow the file's existing entry style (see the entries already there for tone/length/what to call out as "not yet verified").

- [ ] **Step 7: Commit**

```bash
git add project_specs.md
git commit -m "Document Session rename, session tee times, and Matchups redesign"
```
