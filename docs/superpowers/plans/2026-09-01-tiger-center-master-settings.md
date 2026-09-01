# Tiger Center Master Settings (multi-year) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Tiger Center into a per-year operator screen covering
2027–2034. Each year gets a Master Settings page (Course Upload,
lockable Tournament Dates and Venue Name, a universal Save) with the four
existing setup boxes relocated inside it; the Tiger Center home screen
collapses to a year picker plus one "`{year}` Master Settings" box; Edit
Scores is deleted; the public site's venue/dates become database-driven
for whichever year is marked active.

**Architecture:** Adds a `season_year` column (folded into primary/unique
keys) to every `live_*` table that currently assumes a single tournament,
plus a new one-row `live_active_season` table recording which year is
live for the public site and player scoring. Every existing Tiger Center
Route Handler that touches those tables gains a required `year` field.
Player live-scoring routes (a separate, already-shipped feature) are
**not** given a `year` field — they resolve the active season server-side
so their existing request contract is untouched. The public site's
venue-name/date-label rendering switches from a static import to an
async database read, threaded down as props through the two client-side
chrome trees (`SiteChrome` and `HomeDashboard`) that currently import the
static values directly.

**Tech Stack:** Next.js 16 App Router (Route Handlers, Server Components),
TypeScript, Supabase (`@supabase/ssr`), `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-01-tiger-center-master-settings-design.md`

## Global Constraints

- Every Tiger-only Route Handler resolves identity via
  `lib/portal/requireHost.ts` (`requireHost()`) — never write a new inline
  check. Player-facing routes keep using `lib/portal/requirePlayer.ts`
  (`requirePlayer()`), unchanged.
- All writes go through `createSupabaseServiceRoleClient()` (bypasses
  RLS) — never trust a client-supplied `year`/`round`/id without
  validating it against real data server-side where the existing code
  already does so.
- `season_year` is always an integer 2027–2034 — validate with
  `Number.isInteger(year) && year >= 2027 && year <= 2034` everywhere a
  route accepts one from the client.
- Match existing code style: Tailwind utility classes matching
  `components/portal/tiger/CoursesFormatPanel.tsx`'s look (font-serif
  headers, font-sans body, maroon-700 accents, font-condensed uppercase
  small text for buttons/labels, `rounded-lg border-2 border-stone-300`
  panels).
- Run `npm test && npx tsc --noEmit && npm run lint && npm run build`
  clean before considering any task done.

---

### Task 1: Schema migration — multi-year `live_*` tables

**Files:**
- Modify: `supabase/schema.sql` (append after the "Archived Scorecards &
  Shot Video" section)

**Interfaces:**
- Produces (consumed by every later task): `season_year integer` on
  `live_tournament_settings` (now keyed by `season_year` alone, plus
  `venue_name text`, `venue_locked boolean`, `begin_date date`,
  `end_date date`, `dates_locked boolean`), `live_round_state` (keyed by
  `(season_year, round)`), `live_roster` (keyed by
  `(season_year, player_slug)`), `live_match_boxes` (`season_year`
  column, FK to `live_round_state(season_year, round)`, unique on
  `(season_year, round, box_number)`), `live_hole_scores` (`season_year`
  column, unique on `(season_year, player_slug, round, hole)`). New table
  `live_active_season(id boolean primary key default true, season_year
  integer not null)`, one seed row `season_year = 2027`.

- [ ] **Step 1: Append the migration**

```sql
-- === Tiger Center: Master Settings (multi-year) ==========================
-- Every table below moves from "one live tournament, implicitly 2027" to
-- "one row per season_year, 2027-2034." Existing real rows (the 2027
-- tournament actually being set up) are backfilled to season_year = 2027
-- before any not-null/key constraint is added, so nothing is lost. See
-- docs/superpowers/specs/2026-09-01-tiger-center-master-settings-design.md.

-- live_tournament_settings: singleton -> one row per year, gains venue/dates
alter table live_tournament_settings drop constraint if exists live_tournament_settings_singleton;
alter table live_tournament_settings add column if not exists season_year integer;
update live_tournament_settings set season_year = 2027 where season_year is null;
alter table live_tournament_settings alter column season_year set not null;
alter table live_tournament_settings drop constraint if exists live_tournament_settings_pkey;
alter table live_tournament_settings drop column if exists id;
alter table live_tournament_settings add constraint live_tournament_settings_season_year_check check (season_year between 2027 and 2034);
alter table live_tournament_settings add primary key (season_year);

alter table live_tournament_settings add column if not exists venue_name text;
alter table live_tournament_settings add column if not exists venue_locked boolean not null default false;
alter table live_tournament_settings add column if not exists begin_date date;
alter table live_tournament_settings add column if not exists end_date date;
alter table live_tournament_settings add column if not exists dates_locked boolean not null default false;

-- Seed 2027's row with what the static files already say, so the public
-- site shows the same thing before and after this migration.
update live_tournament_settings
  set venue_name = coalesce(venue_name, 'Mission Hills CC'),
      begin_date = coalesce(begin_date, '2027-01-06'),
      end_date = coalesce(end_date, '2027-01-09')
  where season_year = 2027;

-- live_round_state: round -> (season_year, round)
alter table live_round_state add column if not exists season_year integer;
update live_round_state set season_year = 2027 where season_year is null;
alter table live_round_state alter column season_year set not null;
alter table live_round_state drop constraint if exists live_round_state_pkey;
alter table live_round_state add constraint live_round_state_season_year_check check (season_year between 2027 and 2034);
alter table live_round_state add primary key (season_year, round);

-- live_roster: player_slug -> (season_year, player_slug)
alter table live_roster add column if not exists season_year integer;
update live_roster set season_year = 2027 where season_year is null;
alter table live_roster alter column season_year set not null;
alter table live_roster drop constraint if exists live_roster_pkey;
alter table live_roster add constraint live_roster_season_year_check check (season_year between 2027 and 2034);
alter table live_roster add primary key (season_year, player_slug);

-- live_match_boxes: gains season_year, FK repointed at the new composite key
alter table live_match_boxes add column if not exists season_year integer;
update live_match_boxes set season_year = 2027 where season_year is null;
alter table live_match_boxes alter column season_year set not null;
alter table live_match_boxes drop constraint if exists live_match_boxes_round_fkey;
alter table live_match_boxes add constraint live_match_boxes_season_year_round_fkey
  foreign key (season_year, round) references live_round_state (season_year, round);
alter table live_match_boxes drop constraint if exists live_match_boxes_round_box_number_key;
alter table live_match_boxes add constraint live_match_boxes_season_round_box_number_key
  unique (season_year, round, box_number);
drop index if exists live_match_boxes_round_idx;
create index if not exists live_match_boxes_season_round_idx on live_match_boxes (season_year, round);

-- live_hole_scores: gains season_year, widens the unique key
alter table live_hole_scores add column if not exists season_year integer;
update live_hole_scores set season_year = 2027 where season_year is null;
alter table live_hole_scores alter column season_year set not null;
alter table live_hole_scores drop constraint if exists live_hole_scores_player_slug_round_hole_key;
alter table live_hole_scores add constraint live_hole_scores_season_year_player_slug_round_hole_key
  unique (season_year, player_slug, round, hole);
drop index if exists live_hole_scores_round_idx;
create index if not exists live_hole_scores_season_round_idx on live_hole_scores (season_year, round);

-- New: which year is actually live for the public site / player scoring —
-- independent of whichever year Tiger happens to be viewing in Master
-- Settings.
create table if not exists live_active_season (
  id boolean primary key default true,
  season_year integer not null check (season_year between 2027 and 2034),
  constraint live_active_season_singleton check (id)
);
insert into live_active_season (id, season_year) values (true, 2027) on conflict (id) do nothing;

alter table live_active_season enable row level security;
drop policy if exists live_active_season_select_all on live_active_season;
create policy live_active_season_select_all on live_active_season for select using (true);
```

- [ ] **Step 2: Run it against your Supabase project**

This step is for the operator, not the implementer — same as every prior
Tiger Center schema task. Note in your report that Step 2 is a manual
step; do not attempt it (no DB credentials are configured in this
environment).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(tiger): multi-year live_* schema for Master Settings"
```

---

### Task 2: Types and the active-season helper

**Files:**
- Modify: `lib/live/types.ts`
- Create: `lib/live/activeSeason.ts`
- Create: `lib/live/activeSeason.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Tasks 3-13): `TournamentSettings` gains
  `venueName: string | null`, `venueLocked: boolean`, `beginDate: string
  | null`, `endDate: string | null`, `datesLocked: boolean`.
  `LiveRoundState` and `RosterEntry` gain `seasonYear: number`.
  `LiveMatchBox` and `LiveHoleScore` gain `seasonYear: number`.
  `getActiveSeasonYear(): Promise<number>` — reads `live_active_season`,
  returns its `season_year` (throws if the row is somehow missing, which
  should never happen after Task 1's seed insert).
  `SEASON_YEARS: number[]` — `[2027, 2028, ..., 2034]`.
  `isValidSeasonYear(value: unknown): value is number`.

- [ ] **Step 1: Update `lib/live/types.ts`**

```typescript
// lib/live/types.ts
// Add seasonYear to these three existing interfaces (keep every other
// field as-is):

export interface LiveRoundState {
  seasonYear: number;
  round: number;
  started: boolean;
  courseId: string | null;
  date: string | null; // ISO date (YYYY-MM-DD)
  format: MatchFormat | null;
  courseLocked: boolean;
  matchupsLocked: boolean;
}

export interface RosterEntry {
  seasonYear: number;
  playerSlug: string;
  team: Team;
}

export interface LiveMatchBox {
  id: string | null;
  seasonYear: number;
  round: number;
  boxNumber: number;
  format: MatchFormat;
  teeTime: Date;
  maroonPlayers: string[]; // player_slug[]
  whitePlayers: string[]; // player_slug[]
  state: MatchState;
  started: boolean;
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

export interface TournamentSettings {
  roundCount: number | null;
  completedAt: string | null; // ISO timestamp, null until the tournament is done
  venueName: string | null;
  venueLocked: boolean;
  beginDate: string | null; // ISO date (YYYY-MM-DD)
  endDate: string | null; // ISO date (YYYY-MM-DD)
  datesLocked: boolean;
}
```

Also update `scoreKey`/`scoreFor`/`readScore`/`courseForRound` — these
operate on `LiveTournamentSnapshot`, which is built fresh per-request
from already-year-filtered Supabase rows (Tasks 4 and 9-13 filter at the
query, not inside the snapshot), so their signatures don't change. The
blank `LiveHoleScore` literals they construct need a `seasonYear` field
added:

```typescript
// was: const blank: LiveHoleScore = { player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false };
// lib/live/types.ts — scoreFor()
export function scoreFor(snapshot: LiveTournamentSnapshot, player: string, round: number, hole: number): LiveHoleScore {
  const key = scoreKey(player, round, hole);
  const existing = snapshot.scores.get(key);
  if (existing) return existing;
  const blank: LiveHoleScore = { seasonYear: 0, player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false };
  snapshot.scores.set(key, blank);
  return blank;
}

// lib/live/types.ts — readScore()
export function readScore(snapshot: LiveTournamentSnapshot, player: string, round: number, hole: number): LiveHoleScore {
  const key = scoreKey(player, round, hole);
  return (
    snapshot.scores.get(key) ?? { seasonYear: 0, player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false }
  );
}
```

`seasonYear: 0` here is a real placeholder value, not a bug — these two
functions build a scratch object for orchestration logic that never
reads `seasonYear` (it operates within one already-year-scoped snapshot),
matching how the pre-existing fields on that same blank object (e.g.
`hostEdited: false`) are already just filler for a shape the caller
overwrites piecemeal.

- [ ] **Step 2: Create the active-season helper**

```typescript
// lib/live/activeSeason.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const SEASON_YEARS: number[] = [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];

export function isValidSeasonYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && SEASON_YEARS.includes(value);
}

/**
 * Which season year is live right now for the public site and player
 * scoring — independent of whatever year a host happens to be viewing in
 * Master Settings. Always resolves (Task 1 seeds one row); a service-role
 * read, safe to call from Server Components and Route Handlers alike.
 */
export async function getActiveSeasonYear(): Promise<number> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_active_season").select("season_year").eq("id", true).single();
  if (error || !data) {
    throw new Error("No active season is configured.");
  }
  return data.season_year;
}
```

- [ ] **Step 3: Write the test**

```typescript
// lib/live/activeSeason.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SEASON_YEARS, isValidSeasonYear } from "./activeSeason.ts";

test("SEASON_YEARS covers 2027 through 2034", () => {
  assert.deepEqual(SEASON_YEARS, [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034]);
});

test("isValidSeasonYear accepts only integers in range", () => {
  assert.equal(isValidSeasonYear(2027), true);
  assert.equal(isValidSeasonYear(2034), true);
  assert.equal(isValidSeasonYear(2026), false);
  assert.equal(isValidSeasonYear(2035), false);
  assert.equal(isValidSeasonYear(2027.5), false);
  assert.equal(isValidSeasonYear("2027"), false);
});
```

- [ ] **Step 4: Run the tests**

Run: `npx tsx --test lib/live/activeSeason.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add lib/live/types.ts lib/live/activeSeason.ts lib/live/activeSeason.test.ts
git commit -m "feat(tiger): season_year types and the active-season helper"
```

---

### Task 3: Year-scope player live scoring to the active season

**Files:**
- Modify: `app/api/portal/scoring/stroke/route.ts`
- Modify: `app/api/portal/scoring/submit/route.ts`
- Modify: `app/api/portal/scoring/state/route.ts`
- Modify: `app/api/portal/scoring/stats/route.ts`

**Interfaces:**
- Consumes: `getActiveSeasonYear()` (Task 2).
- Produces: nothing new — these routes' request/response shapes are
  **unchanged**; players never pick a year.

Player scoring only ever happens against whatever tournament is
currently live, so these four routes resolve the active season
server-side rather than taking a `year` field from the client — this
keeps a separate, already-shipped feature's contract untouched. Every
`live_match_boxes`/`live_hole_scores` query in these files needs
`.eq("season_year", seasonYear)` added (Task 1's schema means `round`
numbers repeat across years, so a query without this filter can now
match the wrong year's rows once a second year has data), and every
`live_hole_scores` insert needs `season_year: seasonYear` added.

- [ ] **Step 1: Update `app/api/portal/scoring/stroke/route.ts`**

```typescript
// app/api/portal/scoring/stroke/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { canScoreStrokesFor, scoresAgree } from "@/lib/live/orchestration";
import type { LiveMatchBox, MatchFormat, MatchState } from "@/lib/live/types";

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

function rowToMatchBox(row: MatchBoxRow, seasonYear: number): LiveMatchBox {
  return {
    id: row.id,
    seasonYear,
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

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, hole, targetPlayerSlugs, score } = await request.json();
  if (
    typeof round !== "number" ||
    !Number.isInteger(round) ||
    typeof hole !== "number" ||
    !Number.isInteger(hole) ||
    hole < 1 ||
    hole > 18 ||
    !Array.isArray(targetPlayerSlugs) ||
    targetPlayerSlugs.some((s: unknown) => typeof s !== "string") ||
    typeof score !== "number" ||
    !Number.isInteger(score) ||
    score < 1
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  const { data: boxRow } = await service
    .from("live_match_boxes")
    .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
    .eq("season_year", seasonYear)
    .eq("round", round);
  const box = (boxRow as MatchBoxRow[] | null ?? [])
    .map((row) => rowToMatchBox(row, seasonYear))
    .find((b) => b.maroonPlayers.includes(player.playerSlug) || b.whitePlayers.includes(player.playerSlug));
  if (!box || !box.id) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
  }

  const { data: roundState } = await service
    .from("live_round_state")
    .select("course_locked, matchups_locked, started")
    .eq("season_year", seasonYear)
    .eq("round", round)
    .single();
  if (!roundState?.course_locked || !roundState?.matchups_locked || !roundState?.started) {
    return NextResponse.json({ ok: false, error: "This round isn't live yet." }, { status: 400 });
  }

  const { data: existingSubmission } = await service
    .from("live_match_box_submissions")
    .select("player_slug")
    .eq("match_box_id", box.id)
    .eq("player_slug", player.playerSlug)
    .maybeSingle();
  if (existingSubmission) {
    return NextResponse.json({ ok: false, error: "You've already submitted your scores for this round." }, { status: 400 });
  }

  if (!canScoreStrokesFor(box, player.playerSlug, targetPlayerSlugs)) {
    return NextResponse.json({ ok: false, error: "You're not the assigned scorer for that player." }, { status: 403 });
  }

  for (const target of targetPlayerSlugs as string[]) {
    const { data: existingRow } = await service
      .from("live_hole_scores")
      .select("id, self_reported_score")
      .eq("season_year", seasonYear)
      .eq("player_slug", target)
      .eq("round", round)
      .eq("hole", hole)
      .maybeSingle();
    const confirmedBy = scoresAgree(score, existingRow?.self_reported_score ?? null) ? target : null;
    if (existingRow) {
      const { error } = await service.from("live_hole_scores").update({ score, confirmed_by: confirmedBy }).eq("id", existingRow.id);
      if (error) return NextResponse.json({ ok: false, error: "Could not save that score." }, { status: 500 });
    } else {
      const { error } = await service
        .from("live_hole_scores")
        .insert({ season_year: seasonYear, player_slug: target, round, hole, score, confirmed_by: confirmedBy });
      if (error) return NextResponse.json({ ok: false, error: "Could not save that score." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Update `app/api/portal/scoring/submit/route.ts`**

Apply the same pattern: add `import { getActiveSeasonYear } from
"@/lib/live/activeSeason";`, compute `const seasonYear = await
getActiveSeasonYear();` right after the field-validation block, add
`.eq("season_year", seasonYear)` to the `live_match_boxes` select and the
`live_hole_scores` select, and add `seasonYear` as a second parameter to
`rowToMatchBox` exactly as in Step 1 (this file has its own identical
copy of that helper).

```typescript
// app/api/portal/scoring/submit/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { canScoreStrokesFor } from "@/lib/live/orchestration";
import type { LiveMatchBox, MatchFormat, MatchState } from "@/lib/live/types";

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

function rowToMatchBox(row: MatchBoxRow, seasonYear: number): LiveMatchBox {
  return {
    id: row.id,
    seasonYear,
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

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round } = await request.json();
  if (typeof round !== "number" || !Number.isInteger(round)) {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  const { data: boxRows } = await service
    .from("live_match_boxes")
    .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
    .eq("season_year", seasonYear)
    .eq("round", round);
  const box = (boxRows as MatchBoxRow[] | null ?? [])
    .map((row) => rowToMatchBox(row, seasonYear))
    .find((b) => b.maroonPlayers.includes(player.playerSlug) || b.whitePlayers.includes(player.playerSlug));
  if (!box || !box.id) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
  }

  const { data: roundState } = await service
    .from("live_round_state")
    .select("course_locked, matchups_locked, started")
    .eq("season_year", seasonYear)
    .eq("round", round)
    .single();
  if (!roundState?.course_locked || !roundState?.matchups_locked || !roundState?.started) {
    return NextResponse.json({ ok: false, error: "This round isn't live yet." }, { status: 400 });
  }

  const { data: existingSubmission } = await service
    .from("live_match_box_submissions")
    .select("player_slug")
    .eq("match_box_id", box.id)
    .eq("player_slug", player.playerSlug)
    .maybeSingle();
  if (existingSubmission) {
    return NextResponse.json({ ok: false, error: "You've already submitted your scores for this round." }, { status: 400 });
  }

  const everyone = [...box.maroonPlayers, ...box.whitePlayers];
  const responsibleFor = everyone.filter((candidate) => canScoreStrokesFor(box, player.playerSlug, [candidate]))
    .concat(canScoreStrokesFor(box, player.playerSlug, box.maroonPlayers) ? box.maroonPlayers : [])
    .concat(canScoreStrokesFor(box, player.playerSlug, box.whitePlayers) ? box.whitePlayers : []);
  const uniqueResponsibleFor = [...new Set(responsibleFor)];

  const { data: scoreRows } = await service
    .from("live_hole_scores")
    .select("player_slug, hole, score, putts, fir, gir")
    .eq("season_year", seasonYear)
    .eq("round", round)
    .in("player_slug", everyone);
  const rows = scoreRows ?? [];

  const { data: roundRow } = await service
    .from("live_round_state")
    .select("course_id")
    .eq("season_year", seasonYear)
    .eq("round", round)
    .single();
  const { data: course } = roundRow?.course_id
    ? await service.from("live_courses").select("holes").eq("id", roundRow.course_id).single()
    : { data: null };
  const holes = (course?.holes as { number: number; par: number }[] | undefined) ?? [];

  for (let hole = 1; hole <= 18; hole++) {
    for (const target of uniqueResponsibleFor) {
      const row = rows.find((r) => r.player_slug === target && r.hole === hole);
      if (!row || row.score === null || row.score <= 0) {
        return NextResponse.json({ ok: false, error: `Finish entering all 18 holes before submitting (missing hole ${hole}).` }, { status: 400 });
      }
    }
    if (box.format !== "Foursome") {
      const ownRow = rows.find((r) => r.player_slug === player.playerSlug && r.hole === hole);
      const isPar3 = holes.find((h) => h.number === hole)?.par === 3;
      if (!ownRow || ownRow.putts === null || ownRow.gir === null || (!isPar3 && ownRow.fir === null)) {
        return NextResponse.json({ ok: false, error: `Finish entering your own stats for all 18 holes before submitting (missing hole ${hole}).` }, { status: 400 });
      }
    }
  }

  const { error } = await service.from("live_match_box_submissions").insert({ match_box_id: box.id, player_slug: player.playerSlug });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not submit your scores." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Update `app/api/portal/scoring/state/route.ts`**

```typescript
// app/api/portal/scoring/state/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import type { MatchFormat, MatchState } from "@/lib/live/types";

interface MatchBoxRow {
  id: string;
  box_number: number;
  format: string;
  tee_time: string;
  maroon_players: string[];
  white_players: string[];
  state: string;
  started: boolean;
}

interface HoleScoreRow {
  player_slug: string;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  self_reported_score: number | null;
  confirmed_by: string | null;
}

export async function GET(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const round = Number(url.searchParams.get("round"));
  if (!Number.isInteger(round)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid round." }, { status: 400 });
  }

  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  const { data: boxRows } = await service
    .from("live_match_boxes")
    .select("id, box_number, format, tee_time, maroon_players, white_players, state, started")
    .eq("season_year", seasonYear)
    .eq("round", round);
  const box = (boxRows as MatchBoxRow[] | null ?? []).find(
    (b) => b.maroon_players.includes(player.playerSlug) || b.white_players.includes(player.playerSlug)
  );
  if (!box) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
  }

  const allPlayers = [...box.maroon_players, ...box.white_players];
  const [{ data: scoreRows }, { data: submissionRows }] = await Promise.all([
    service
      .from("live_hole_scores")
      .select("player_slug, hole, score, putts, fir, gir, self_reported_score, confirmed_by")
      .eq("season_year", seasonYear)
      .eq("round", round)
      .in("player_slug", allPlayers),
    service.from("live_match_box_submissions").select("player_slug").eq("match_box_id", box.id),
  ]);

  return NextResponse.json(
    {
      ok: true,
      matchBox: {
        id: box.id,
        boxNumber: box.box_number,
        format: box.format as MatchFormat,
        teeTime: box.tee_time,
        maroonPlayers: box.maroon_players,
        whitePlayers: box.white_players,
        state: box.state as MatchState,
      },
      scores: (scoreRows as HoleScoreRow[] | null ?? []).map((r) => ({
        player: r.player_slug,
        hole: r.hole,
        score: r.score,
        putts: r.putts,
        fir: r.fir,
        gir: r.gir,
        selfReportedScore: r.self_reported_score,
        confirmedBy: r.confirmed_by,
      })),
      submittedPlayers: (submissionRows ?? []).map((r) => r.player_slug as string),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
```

- [ ] **Step 4: Update `app/api/portal/scoring/stats/route.ts`**

```typescript
// app/api/portal/scoring/stats/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { scoresAgree } from "@/lib/live/orchestration";

interface MatchBoxRow {
  id: string;
  maroon_players: string[];
  white_players: string[];
}

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, hole, putts, fir, gir, selfReportedScore } = await request.json();
  if (
    typeof round !== "number" ||
    !Number.isInteger(round) ||
    typeof hole !== "number" ||
    !Number.isInteger(hole) ||
    hole < 1 ||
    hole > 18 ||
    typeof putts !== "number" ||
    !Number.isInteger(putts) ||
    putts < 0 ||
    (fir !== null && typeof fir !== "boolean") ||
    typeof gir !== "boolean" ||
    (selfReportedScore !== undefined && selfReportedScore !== null && (typeof selfReportedScore !== "number" || !Number.isInteger(selfReportedScore) || selfReportedScore < 1))
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  const { data: boxRows } = await service
    .from("live_match_boxes")
    .select("id, maroon_players, white_players")
    .eq("season_year", seasonYear)
    .eq("round", round);
  const box = (boxRows as MatchBoxRow[] | null ?? []).find(
    (b) => b.maroon_players.includes(player.playerSlug) || b.white_players.includes(player.playerSlug)
  );
  if (!box) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
  }

  const { data: roundState } = await service
    .from("live_round_state")
    .select("course_locked, matchups_locked, started")
    .eq("season_year", seasonYear)
    .eq("round", round)
    .single();
  if (!roundState?.course_locked || !roundState?.matchups_locked || !roundState?.started) {
    return NextResponse.json({ ok: false, error: "This round isn't live yet." }, { status: 400 });
  }

  const { data: existingSubmission } = await service
    .from("live_match_box_submissions")
    .select("player_slug")
    .eq("match_box_id", box.id)
    .eq("player_slug", player.playerSlug)
    .maybeSingle();
  if (existingSubmission) {
    return NextResponse.json({ ok: false, error: "You've already submitted your scores for this round." }, { status: 400 });
  }

  const { data: roundRow } = await service
    .from("live_round_state")
    .select("course_id")
    .eq("season_year", seasonYear)
    .eq("round", round)
    .single();
  let isPar3 = false;
  if (roundRow?.course_id) {
    const { data: course } = await service.from("live_courses").select("holes").eq("id", roundRow.course_id).single();
    const holeInfo = (course?.holes as { number: number; par: number }[] | undefined)?.find((h) => h.number === hole);
    isPar3 = holeInfo?.par === 3;
  }
  const normalizedFir = isPar3 ? null : fir;

  const { data: existingRow } = await service
    .from("live_hole_scores")
    .select("id, score, self_reported_score")
    .eq("season_year", seasonYear)
    .eq("player_slug", player.playerSlug)
    .eq("round", round)
    .eq("hole", hole)
    .maybeSingle();

  const nextSelfReported = selfReportedScore === undefined ? (existingRow?.self_reported_score ?? null) : selfReportedScore;
  const officialScore = existingRow?.score ?? null;
  const confirmedBy = scoresAgree(officialScore, nextSelfReported) ? player.playerSlug : null;

  if (existingRow) {
    const { error } = await service
      .from("live_hole_scores")
      .update({ putts, fir: normalizedFir, gir, self_reported_score: nextSelfReported, confirmed_by: confirmedBy })
      .eq("id", existingRow.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 500 });
  } else {
    const { error } = await service
      .from("live_hole_scores")
      .insert({ season_year: seasonYear, player_slug: player.playerSlug, round, hole, putts, fir: normalizedFir, gir, self_reported_score: nextSelfReported, confirmed_by: confirmedBy });
    if (error) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add app/api/portal/scoring
git commit -m "fix(scoring): year-scope live scoring reads/writes to the active season"
```

---

### Task 4: Async `getNextTournament()`/`getNextVenue()` overlay

**Files:**
- Modify: `lib/data/index.ts`
- Modify: `lib/data/types.ts`
- Create: `lib/data/index.test.ts` (append — check the existing file first;
  if it already covers other exports, add these tests alongside them
  rather than replacing the file)

**Interfaces:**
- Consumes: `getActiveSeasonYear()` (Task 2, indirectly — via a new
  `getActiveSeasonOverride()` in this task).
- Produces (consumed by Task 10): `getNextTournament():
  Promise<UpcomingTournament>`, `getNextVenue(): Promise<VenueSchedule>`,
  both overlaying database venue/dates onto the static per-year base for
  whichever year `live_active_season` names. `getVenueBySlug` becomes
  `async` (same name, same slug-matching logic, now returns the
  overlaid venue for the live year). The existing sync `nextTournament`/
  `nextVenue` exports are **unchanged** — every one of their existing
  callers uses only `.slug`/`.year`/`.roster`/`.location`/`.editionLabel`
  (verified in the design spec's research), none of which this task
  touches.

- [ ] **Step 1: Add the override type to `lib/data/types.ts`**

```typescript
// lib/data/types.ts — add near UpcomingTournament
export interface NextTournamentOverride {
  venue: string;
  dateLabel: string;
}
```

- [ ] **Step 2: Add the overlay functions to `lib/data/index.ts`**

```typescript
// lib/data/index.ts
// Add these imports at the top, alongside the existing ones:
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { NextTournamentOverride } from "./types";

// Add near the bottom of the file, after the existing exports:

interface ActiveSeasonSettings {
  seasonYear: number;
  venueName: string | null;
  beginDate: string | null;
  endDate: string | null;
}

async function getActiveSeasonSettings(): Promise<ActiveSeasonSettings | null> {
  const service = createSupabaseServiceRoleClient();
  const { data: active } = await service.from("live_active_season").select("season_year").eq("id", true).maybeSingle();
  if (!active) return null;
  const { data: settings } = await service
    .from("live_tournament_settings")
    .select("venue_name, begin_date, end_date")
    .eq("season_year", active.season_year)
    .maybeSingle();
  return {
    seasonYear: active.season_year,
    venueName: settings?.venue_name ?? null,
    beginDate: settings?.begin_date ?? null,
    endDate: settings?.end_date ?? null,
  };
}

// Formats an inclusive date range the same way the hand-written
// dateLabel strings in lib/data/*-upcoming.ts already read (e.g.
// "January 6–9, 2027"). Both dates are "YYYY-MM-DD".
function formatDateLabel(begin: string, end: string): string {
  const b = new Date(`${begin}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long" });
  if (b.getFullYear() === e.getFullYear() && b.getMonth() === e.getMonth()) {
    return `${monthFmt.format(b)} ${b.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  }
  const dayFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });
  return `${dayFmt.format(b)} – ${dayFmt.format(e)}, ${e.getFullYear()}`;
}

/**
 * `nextTournament`, with venue and dates overlaid from the database for
 * whichever year is currently marked active — everything else (slug,
 * roster, location, notes) stays exactly what the static per-year file
 * says, same as `nextTournament` today. Falls back to the static value
 * untouched if no active-season row/settings exist yet.
 */
export async function getNextTournament(): Promise<UpcomingTournament> {
  const override = await getActiveSeasonSettings();
  if (!override || override.seasonYear !== nextTournament.year) return nextTournament;
  return {
    ...nextTournament,
    venue: override.venueName ?? nextTournament.venue,
    startDate: override.beginDate ?? nextTournament.startDate,
    endDate: override.endDate ?? nextTournament.endDate,
    dateLabel: override.beginDate && override.endDate ? formatDateLabel(override.beginDate, override.endDate) : nextTournament.dateLabel,
  };
}

/** Same overlay, applied to `nextVenue`'s `venueName`. */
export async function getNextVenue(): Promise<VenueSchedule> {
  const override = await getActiveSeasonSettings();
  if (!override || override.seasonYear !== nextVenue.year || !override.venueName) return nextVenue;
  return { ...nextVenue, venueName: override.venueName };
}

/** Async counterpart of getVenueBySlug — same slug match, live-overlaid venue. */
export async function getVenueBySlugAsync(slug: string): Promise<VenueSchedule | undefined> {
  if (slug === nextTournament.slug) return getNextVenue();
  return pastVenues[slug];
}

/** Just the two fields the public-site chrome components need, for
 * threading through client component props (see Task 10). */
export async function getNextTournamentOverride(): Promise<NextTournamentOverride> {
  const t = await getNextTournament();
  return { venue: t.venue, dateLabel: t.dateLabel };
}
```

`override.seasonYear !== nextTournament.year` guards the case where the
active year has moved past 2027 with no static file for it yet (Task 1's
seed keeps it at 2027, so this only matters once a host uses "Set as
Active Year" in Task 11 — at that point `getNextTournament()` correctly
falls back to the 2027 static data rather than silently mixing a 2028
venue into a 2027-shaped object).

- [ ] **Step 3: Test `formatDateLabel` indirectly through a same-file case**

Check whether `lib/data/index.test.ts` already exists; if so open it and
add this test alongside the existing ones (same `import`/`test` style
already in that file). If it doesn't exist, create it with just this
test.

```typescript
// lib/data/index.test.ts (add this test; keep any existing tests in the file)
import { test } from "node:test";
import assert from "node:assert/strict";
import { getNextTournament } from "./index.ts";

// No Supabase credentials in the test environment, so
// createSupabaseServiceRoleClient() throws before any network call —
// this documents that getNextTournament() propagates that rather than
// silently swallowing it. Real behavior (falling back to the static
// nextTournament when no override row exists) is exercised by hand in
// Task 4's manual walkthrough, same limitation every other Supabase-backed
// route/helper in this codebase already has in its own tests.
test("getNextTournament rejects with no Supabase configuration in the test environment", async () => {
  await assert.rejects(() => getNextTournament());
});
```

- [ ] **Step 4: Run the test**

Run: `npx tsx --test lib/data/index.test.ts`
Expected: PASS

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add lib/data/index.ts lib/data/types.ts lib/data/index.test.ts
git commit -m "feat(data): async getNextTournament/getNextVenue overlay for the active season"
```

---

### Task 5: Master Settings and Active Season API routes

**Files:**
- Create: `app/api/portal/tiger/master-settings/route.ts`
- Create: `app/api/portal/tiger/master-settings/route.test.ts`
- Create: `app/api/portal/tiger/active-season/route.ts`
- Create: `app/api/portal/tiger/active-season/route.test.ts`

**Interfaces:**
- Consumes: `isValidSeasonYear` (Task 2).
- Produces (consumed by Task 11): `POST /api/portal/tiger/master-settings`
  body `{ year, beginDate, endDate, datesLocked, venueName, venueLocked }`
  → `{ ok: true }` or `{ ok: false, error }`. `POST
  /api/portal/tiger/active-season` body `{ year }` → `{ ok: true }` or
  `{ ok: false, error }`.

- [ ] **Step 1: Master Settings route**

```typescript
// app/api/portal/tiger/master-settings/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, beginDate, endDate, datesLocked, venueName, venueLocked } = await request.json();
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }
  if (typeof datesLocked !== "boolean" || typeof venueLocked !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }
  if (beginDate !== null && typeof beginDate !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid begin date." }, { status: 400 });
  }
  if (endDate !== null && typeof endDate !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid end date." }, { status: 400 });
  }
  if (venueName !== null && typeof venueName !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid venue name." }, { status: 400 });
  }
  if (datesLocked && (!beginDate || !endDate)) {
    return NextResponse.json({ ok: false, error: "Set both dates before locking them." }, { status: 400 });
  }
  if (venueLocked && !venueName?.trim()) {
    return NextResponse.json({ ok: false, error: "Set a venue name before locking it." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("live_tournament_settings").upsert({
    season_year: year,
    begin_date: beginDate,
    end_date: endDate,
    dates_locked: datesLocked,
    venue_name: venueName,
    venue_locked: venueLocked,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save Master Settings." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Master Settings route test**

```typescript
// app/api/portal/tiger/master-settings/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// Same limitation every other Tiger Route Handler test in this codebase
// documents: requireHost() needs a real request lifecycle, unavailable in
// this test environment, so the whole call rejects before reaching
// Supabase.
test("POST /api/portal/tiger/master-settings rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/master-settings", {
    method: "POST",
    body: JSON.stringify({ year: 2027, beginDate: "2027-01-06", endDate: "2027-01-09", datesLocked: false, venueName: "Mission Hills CC", venueLocked: false }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 3: Active Season route**

```typescript
// app/api/portal/tiger/active-season/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year } = await request.json();
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("live_active_season").update({ season_year: year }).eq("id", true);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not set the active year." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Active Season route test**

```typescript
// app/api/portal/tiger/active-season/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/active-season rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/active-season", {
    method: "POST",
    body: JSON.stringify({ year: 2028 }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add app/api/portal/tiger/master-settings app/api/portal/tiger/active-season
git commit -m "feat(tiger): Master Settings and Active Season API routes"
```

---

### Task 6: Year-scope the Settings route

**Files:**
- Modify: `app/api/portal/tiger/settings/route.ts`

**Interfaces:**
- Consumes: `isValidSeasonYear` (Task 2).
- Produces (consumed by Task 12): `GET
  /api/portal/tiger/settings?year=2027` → `{ ok, settings:
  { roundCount, completedAt } }` (unchanged shape — venue/dates live on
  the new Master Settings route, not this one). `POST
  /api/portal/tiger/settings` body gains a required `year` field.

- [ ] **Step 1: Update the route**

```typescript
// app/api/portal/tiger/settings/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import type { TournamentSettings } from "@/lib/live/types";

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
  const { data } = await service
    .from("live_tournament_settings")
    .select("round_count, completed_at, venue_name, venue_locked, begin_date, end_date, dates_locked")
    .eq("season_year", year)
    .maybeSingle();

  const settings: TournamentSettings = {
    roundCount: data?.round_count ?? null,
    completedAt: data?.completed_at ?? null,
    venueName: data?.venue_name ?? null,
    venueLocked: data?.venue_locked ?? false,
    beginDate: data?.begin_date ?? null,
    endDate: data?.end_date ?? null,
    datesLocked: data?.dates_locked ?? false,
  };
  return NextResponse.json({ ok: true, settings }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, roundCount } = await request.json();
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }
  if (typeof roundCount !== "number" || roundCount < 6 || roundCount > 10) {
    return NextResponse.json({ ok: false, error: "Round count must be between 6 and 10." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { error: settingsError } = await service.from("live_tournament_settings").upsert({ season_year: year, round_count: roundCount });
  if (settingsError) {
    return NextResponse.json({ ok: false, error: "Could not save the round count." }, { status: 500 });
  }

  const { data: existing } = await service.from("live_round_state").select("round").eq("season_year", year);
  const existingRounds = new Set((existing ?? []).map((r) => r.round));
  const missing = Array.from({ length: roundCount }, (_, i) => i + 1).filter((round) => !existingRounds.has(round));

  if (missing.length > 0) {
    const { error: insertError } = await service.from("live_round_state").insert(missing.map((round) => ({ season_year: year, round })));
    if (insertError) {
      return NextResponse.json({ ok: false, error: "Could not create the new round slots." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

I note that `TournamentSettings.venueName`/`venueLocked`/`beginDate`/
`endDate`/`datesLocked` are included in this GET response even though
the Master Settings screen (Task 11) reads them via its own
server-rendered page fetch rather than this endpoint — leaving them out
here would make `TournamentSettings` an inconsistent shape depending on
which caller built it. Nothing currently calls this GET route from the
client (Courses & Format's page fetches `live_tournament_settings`
directly server-side, matching the pattern already in
`app/portal/admin/courses-format/page.tsx`), so this is a safe superset.

- [ ] **Step 2: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add app/api/portal/tiger/settings/route.ts
git commit -m "feat(tiger): year-scope the Settings route"
```

---

### Task 7: Year-scope the Roster route

**Files:**
- Modify: `app/api/portal/tiger/roster/route.ts`

**Interfaces:**
- Consumes: `isValidSeasonYear` (Task 2).
- Produces (consumed by Task 12): `GET
  /api/portal/tiger/roster?year=2027` → `{ ok, roster: RosterEntry[] }`.
  `POST` body gains a required `year` field.

- [ ] **Step 1: Update the route**

```typescript
// app/api/portal/tiger/roster/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import type { RosterEntry, Team } from "@/lib/live/types";

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
  const { data, error } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the roster." }, { status: 500 });
  }

  const roster: RosterEntry[] = (data ?? []).map((row) => ({ seasonYear: year, playerSlug: row.player_slug, team: row.team as Team }));
  return NextResponse.json({ ok: true, roster }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, playerSlug, team } = await request.json();
  if (!isValidSeasonYear(year) || typeof playerSlug !== "string" || (team !== "maroon" && team !== "white")) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: slot } = await service.from("player_slots").select("player_slug").eq("player_slug", playerSlug).single();
  if (!slot) {
    return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 400 });
  }

  const { error } = await service.from("live_roster").upsert({ season_year: year, player_slug: playerSlug, team });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that team assignment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add app/api/portal/tiger/roster/route.ts
git commit -m "feat(tiger): year-scope the Roster route"
```

---

### Task 8: Year-scope the Rounds routes

**Files:**
- Modify: `app/api/portal/tiger/rounds/route.ts`
- Modify: `app/api/portal/tiger/rounds/lock/route.ts`
- Modify: `app/api/portal/tiger/rounds/remove/route.ts`
- Modify: `app/api/portal/tiger/rounds/start/route.ts`

**Interfaces:**
- Consumes: `isValidSeasonYear` (Task 2).
- Produces (consumed by Task 12): every request body in these four
  routes gains a required `year` field; every `live_round_state`/
  `live_match_boxes` query gains `.eq("season_year", year)`.

- [ ] **Step 1: Update `app/api/portal/tiger/rounds/route.ts`**

```typescript
// app/api/portal/tiger/rounds/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import type { LiveRoundState, MatchFormat } from "@/lib/live/types";

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
    .select("round, started, course_id, date, format, course_locked, matchups_locked")
    .eq("season_year", year)
    .order("round");
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the rounds." }, { status: 500 });
  }

  const rounds: LiveRoundState[] = (data ?? []).map((row) => ({
    seasonYear: year,
    round: row.round,
    started: row.started,
    courseId: row.course_id,
    date: row.date,
    format: row.format as MatchFormat | null,
    courseLocked: row.course_locked,
    matchupsLocked: row.matchups_locked,
  }));
  return NextResponse.json({ ok: true, rounds }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round, date, courseId, format } = await request.json();
  if (!isValidSeasonYear(year) || typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }
  if (format !== undefined && !VALID_FORMATS.includes(format)) {
    return NextResponse.json({ ok: false, error: "Invalid format." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (date !== undefined) update.date = date;
  if (courseId !== undefined) update.course_id = courseId;
  if (format !== undefined) update.format = format;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (format !== undefined) {
    const { data: current } = await service.from("live_round_state").select("format").eq("season_year", year).eq("round", round).single();
    if (current && current.format !== format) {
      const { error: boxesError } = await service.from("live_match_boxes").delete().eq("season_year", year).eq("round", round);
      if (boxesError) {
        return NextResponse.json({ ok: false, error: "Could not clear this round's match boxes for the new format." }, { status: 500 });
      }
    }
  }

  const { error } = await service.from("live_round_state").update(update).eq("season_year", year).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that round." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Update `app/api/portal/tiger/rounds/lock/route.ts`**

```typescript
// app/api/portal/tiger/rounds/lock/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { roundIsComplete, validateMatchBox } from "@/lib/live/orchestration";
import type { LiveMatchBox, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round, lock, value } = await request.json();
  if (!isValidSeasonYear(year) || typeof round !== "number" || (lock !== "course" && lock !== "matchups") || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (lock === "course") {
    if (value) {
      const { data: current } = await service.from("live_round_state").select("date, course_id, format").eq("season_year", year).eq("round", round).single();
      if (!current?.date || !current?.course_id || !current?.format) {
        return NextResponse.json({ ok: false, error: "Set a date, course, and format before locking this round." }, { status: 400 });
      }
    }
    const { error } = await service
      .from("live_round_state")
      .update(value ? { course_locked: value } : { course_locked: value, matchups_locked: false })
      .eq("season_year", year)
      .eq("round", round);
    if (error) {
      return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // lock === "matchups"
  if (value) {
    const { data: current } = await service.from("live_round_state").select("course_locked, format").eq("season_year", year).eq("round", round).single();
    if (!current?.course_locked || !current.format) {
      return NextResponse.json({ ok: false, error: "Lock this round's course and format before locking matchups." }, { status: 400 });
    }

    const { data: boxRows } = await service
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("season_year", year)
      .eq("round", round);
    const matchBoxes: LiveMatchBox[] = (boxRows ?? []).map((row) => ({
      id: row.id,
      seasonYear: year,
      round: row.round,
      boxNumber: row.box_number,
      format: row.format as MatchFormat,
      teeTime: new Date(row.tee_time),
      maroonPlayers: row.maroon_players,
      whitePlayers: row.white_players,
      state: row.state as MatchState,
      started: row.started,
    }));
    const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
    const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

    const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes };
    if (!roundIsComplete(snapshot, round, current.format as MatchFormat)) {
      return NextResponse.json({ ok: false, error: "Every match box for this round needs to be filled before locking matchups." }, { status: 400 });
    }

    const boxErrors = matchBoxes.flatMap((box) => validateMatchBox(snapshot, box).map((message) => `Match ${box.boxNumber}: ${message}`));
    if (boxErrors.length > 0) {
      return NextResponse.json({ ok: false, error: boxErrors.join(" ") }, { status: 400 });
    }
  }

  const { error } = await service.from("live_round_state").update({ matchups_locked: value }).eq("season_year", year).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Update `app/api/portal/tiger/rounds/remove/route.ts`**

```typescript
// app/api/portal/tiger/rounds/remove/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round } = await request.json();
  if (!isValidSeasonYear(year) || typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: current } = await service.from("live_round_state").select("course_locked, matchups_locked").eq("season_year", year).eq("round", round).single();
  if (current?.course_locked || current?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this round before removing it." }, { status: 400 });
  }

  const { error: boxesError } = await service.from("live_match_boxes").delete().eq("season_year", year).eq("round", round);
  if (boxesError) {
    return NextResponse.json({ ok: false, error: "Could not remove that round's match boxes." }, { status: 500 });
  }

  const { error } = await service.from("live_round_state").delete().eq("season_year", year).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that round." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Update `app/api/portal/tiger/rounds/start/route.ts`**

```typescript
// app/api/portal/tiger/rounds/start/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round } = await request.json();
  if (!isValidSeasonYear(year) || typeof round !== "number" || !Number.isInteger(round)) {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: current } = await service.from("live_round_state").select("course_locked, matchups_locked, started").eq("season_year", year).eq("round", round).single();
  if (!current) {
    return NextResponse.json({ ok: false, error: "Round not found." }, { status: 404 });
  }
  if (!current.course_locked || !current.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Lock both Courses & Format and Matchups before starting this round." }, { status: 400 });
  }
  if (current.started) {
    return NextResponse.json({ ok: false, error: "This round has already started." }, { status: 400 });
  }

  const { error } = await service.from("live_round_state").update({ started: true }).eq("season_year", year).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not start that round." }, { status: 500 });
  }

  const { error: boxesError } = await service.from("live_match_boxes").update({ started: true }).eq("season_year", year).eq("round", round);
  if (boxesError) {
    return NextResponse.json({ ok: false, error: "Round was marked started, but could not open its match boxes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add app/api/portal/tiger/rounds
git commit -m "feat(tiger): year-scope the Rounds routes"
```

---

### Task 9: Year-scope the Matchboxes routes

**Files:**
- Modify: `app/api/portal/tiger/matchboxes/route.ts`
- Modify: `app/api/portal/tiger/matchboxes/remove/route.ts`

**Interfaces:**
- Consumes: `isValidSeasonYear` (Task 2).
- Produces (consumed by Task 12): request bodies gain a required `year`
  field; GET gains a required `?year=` query param.

- [ ] **Step 1: Update `app/api/portal/tiger/matchboxes/route.ts`**

```typescript
// app/api/portal/tiger/matchboxes/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
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

function rowToMatchBox(row: MatchBoxRow, seasonYear: number): LiveMatchBox {
  return {
    id: row.id,
    seasonYear,
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
  const year = Number(url.searchParams.get("year"));
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }
  const roundParam = url.searchParams.get("round");

  const service = createSupabaseServiceRoleClient();
  let query = service.from("live_match_boxes").select(MATCH_BOX_COLUMNS).eq("season_year", year).order("round").order("box_number");
  if (roundParam) query = query.eq("round", Number(roundParam));

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the match boxes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matchBoxes: (data ?? []).map((row) => rowToMatchBox(row, year)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round, boxNumber, teeTime, maroonPlayers, whitePlayers } = await request.json();
  if (
    !isValidSeasonYear(year) ||
    typeof round !== "number" ||
    typeof boxNumber !== "number" ||
    typeof teeTime !== "string" ||
    !Array.isArray(maroonPlayers) ||
    !Array.isArray(whitePlayers)
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: roundRow } = await service.from("live_round_state").select("format, course_locked, matchups_locked").eq("season_year", year).eq("round", round).single();
  if (!roundRow?.course_locked || !roundRow.format) {
    return NextResponse.json({ ok: false, error: "Lock this round's course and format before building matchups." }, { status: 400 });
  }
  if (roundRow.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this round's matchups before editing." }, { status: 400 });
  }
  const format = roundRow.format as MatchFormat;

  const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
  const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

  const { data: existingRows } = await service.from("live_match_boxes").select(MATCH_BOX_COLUMNS).eq("season_year", year).eq("round", round);
  const existingBoxes = (existingRows as MatchBoxRow[] | null ?? []).map((row) => rowToMatchBox(row, year)).filter((box) => box.boxNumber !== boxNumber);

  const candidate: LiveMatchBox = {
    id: null,
    seasonYear: year,
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

  const { data: currentBox } = await service.from("live_match_boxes").select("id").eq("season_year", year).eq("round", round).eq("box_number", boxNumber).maybeSingle();
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
    .insert({ season_year: year, round, box_number: boxNumber, format, tee_time: teeTime, maroon_players: maroonPlayers, white_players: whitePlayers })
    .select("id")
    .single();
  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: "Could not save that match box." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
```

- [ ] **Step 2: Update `app/api/portal/tiger/matchboxes/remove/route.ts`**

This route only ever looks up a box by its `id` (a UUID, already globally
unique regardless of year), so it needs no `year` input — but its
follow-up lookup of the box's round now needs the box's own
`season_year` to check that round's lock state correctly.

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

  const { data: box } = await service.from("live_match_boxes").select("season_year, round").eq("id", id).single();
  if (!box) {
    return NextResponse.json({ ok: false, error: "Match box not found." }, { status: 404 });
  }

  const { data: roundRow } = await service.from("live_round_state").select("matchups_locked").eq("season_year", box.season_year).eq("round", box.round).single();
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

- [ ] **Step 3: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add app/api/portal/tiger/matchboxes
git commit -m "feat(tiger): year-scope the Matchboxes routes"
```

---

### Task 10: Public site wiring — venue/dates from the active season

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/nav/SiteChrome.tsx`
- Modify: `components/Header.tsx`
- Modify: `components/Footer.tsx`
- Modify: `app/page.tsx`
- Modify: `components/home/VideoHero.tsx`
- Modify: `components/home/HomeDashboard.tsx`
- Modify: `components/home/QuickScheduleCard.tsx`
- Modify: `app/teams/[slug]/page.tsx`
- Modify: `components/UpcomingNotice.tsx`
- Modify: `app/schedule/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getNextTournamentOverride()`, `getVenueBySlugAsync()` (Task
  4).
- Produces: nothing new — this is pure prop-threading, no new exported
  functions.

`Header`, `SiteChrome`, `QuickScheduleCard`, and `HomeDashboard` are all
Client Components (`"use client"`), so none of them can call the new
async `getNextTournament()` directly — a Client Component can't render
an async component inline. Each fetches once in its nearest true Server
Component ancestor (`app/layout.tsx` for Header/Footer, `app/page.tsx`
for VideoHero/QuickScheduleCard) and receives the two fields
(`venue`, `dateLabel`) as a plain prop. `Footer`, `VideoHero`,
`UpcomingNotice` have no `"use client"` directive today, but `Footer`
and (transitively, via `SiteChrome`) any component rendered inline by a
Client Component can't become `async` either — same prop-threading
treatment.

- [ ] **Step 1: Thread the override through `app/layout.tsx` → `SiteChrome` → `Header`/`Footer`**

```typescript
// app/layout.tsx
// Add this import:
import { getNextTournamentOverride } from "@/lib/data";
// ... existing imports/font setup unchanged ...

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nextTournamentOverride = await getNextTournamentOverride();
  return (
    <html
      lang="en"
      className={`${spectral.variable} ${barlow.variable} ${barlowCondensed.variable}`}
    >
      <body className="min-h-screen bg-cream-50 font-sans text-ink-900 antialiased">
        <SiteChrome nextTournamentOverride={nextTournamentOverride}>{children}</SiteChrome>
      </body>
    </html>
  );
}
```

```typescript
// components/nav/SiteChrome.tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PortalHeader } from "@/components/nav/PortalHeader";
import { PlayerAreaNav } from "@/components/nav/PlayerAreaNav";
import type { NextTournamentOverride } from "@/lib/data/types";

export function SiteChrome({ children, nextTournamentOverride }: { children: ReactNode; nextTournamentOverride: NextTournamentOverride }) {
  const pathname = usePathname();
  const inPortal = pathname.startsWith("/portal");

  if (inPortal) {
    return (
      <>
        <PortalHeader />
        <PlayerAreaNav />
        {children}
      </>
    );
  }

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+2.5vh)] lg:pb-0">
      <Header nextTournamentOverride={nextTournamentOverride} />
      <PlayerAreaNav />
      {children}
      <Footer nextTournamentOverride={nextTournamentOverride} />
    </div>
  );
}
```

- [ ] **Step 2: Update `Header.tsx` to take the override as a prop**

Add `nextTournamentOverride: NextTournamentOverride` to `Header`'s props
and use it wherever `nextTournament.venue`/`nextTournament.dateLabel`
appear (`nextTournament.editionLabel` stays from the static import,
unaffected).

```typescript
// components/Header.tsx
// Change the import line:
// was: import { latestCompleted, nextTournament, champion, isLiveNow, fmtPt } from "@/lib/data";
import { latestCompleted, nextTournament, champion, isLiveNow, fmtPt } from "@/lib/data";
import type { NextTournamentOverride } from "@/lib/data/types";

// ... nav/InstagramGlyph/isSet/HOME_PAGES/isHomePage unchanged ...

export function Header({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  const pathname = usePathname();
  const router = useRouter();
  const live = isLiveNow();
  const champ = champion(latestCompleted);
  const nextVenueKnown = isSet(nextTournamentOverride.venue);
  // ... session/showBack/moreOpen/etc. unchanged ...

  // In the JSX, replace every nextTournament.venue / nextTournament.dateLabel:
  // was: {nextTournament.editionLabel} &middot; {nextTournament.venue} &middot; Underway now
  // becomes:
  //   {nextTournament.editionLabel} &middot; {nextTournamentOverride.venue} &middot; Underway now
  //
  // was: {nextVenueKnown ? `${nextTournament.venue} - ${nextTournament.dateLabel}` : nextTournament.dateLabel}
  // becomes:
  //   {nextVenueKnown ? `${nextTournamentOverride.venue} - ${nextTournamentOverride.dateLabel}` : nextTournamentOverride.dateLabel}
}
```

Apply those two JSX replacements at their exact locations in the file
(the "Underway now" `<span>` and the "Next up" `<span>`); every other
line in `Header.tsx` — imports of `nextTournament` for
`.editionLabel`/`.slug`, the desktop/mobile header rows, `MobileTabBar`,
`MorePanel`, `AccountMenu` — is untouched.

- [ ] **Step 3: Update `Footer.tsx`**

```typescript
// components/Footer.tsx
import Image from "next/image";
import { AccountBadge } from "@/components/AccountBadge";
import type { NextTournamentOverride } from "@/lib/data/types";

export function Footer({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  return (
    <footer className="hidden bg-maroon-900 text-maroon-200 lg:block">
      <div className="max-w-(--container-mm-lg) mx-auto px-7 py-7 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <Image src="/assets/wordmark-light.svg" alt="The Maroon Masters" width={520} height={92} className="h-[26px] w-auto" />
        <span className="font-sans text-xs text-maroon-300 text-center sm:text-left">
          The Maroon Masters · An annual match-play golf trip · Next up {nextTournamentOverride.dateLabel}
        </span>
        <AccountBadge position="footer" />
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Thread the override through `app/page.tsx` → `VideoHero` / `HomeDashboard` → `QuickScheduleCard`**

```typescript
// app/page.tsx
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { HomeEntrySplash } from "@/components/home/HomeEntrySplash";
import { VideoHero } from "@/components/home/VideoHero";
import { LiveLeaderboardStripSection } from "@/components/home/LiveLeaderboardStripSection";
import { getNextTournamentOverride } from "@/lib/data";

export default async function Home() {
  const nextTournamentOverride = await getNextTournamentOverride();
  return (
    <HomeEntrySplash>
      <div>
        <VideoHero nextTournamentOverride={nextTournamentOverride} />
        <LiveLeaderboardStripSection />
        <HomeDashboard nextTournamentOverride={nextTournamentOverride} />
      </div>
    </HomeEntrySplash>
  );
}
```

- [ ] **Step 5: Update `VideoHero.tsx`**

```typescript
// components/home/VideoHero.tsx
import Image from "next/image";
import { Radio } from "lucide-react";
import Link from "next/link";
import { latestCompleted, nextTournament, champion, isLiveNow, fmtPt } from "@/lib/data";
import type { NextTournamentOverride } from "@/lib/data/types";

function isSet(value: string): boolean {
  return value.trim().length > 0 && value.trim().toLowerCase() !== "tbd";
}

export function VideoHero({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  const live = isLiveNow();
  const champ = champion(latestCompleted);
  const nextVenueKnown = isSet(nextTournamentOverride.venue);

  // Rest of the JSX unchanged, except every nextTournament.venue and
  // nextTournament.dateLabel becomes nextTournamentOverride.venue /
  // nextTournamentOverride.dateLabel:
  //
  // was: {nextTournament.editionLabel} is live at {nextTournament.venue}, {nextTournament.dateLabel}. Results...
  // becomes:
  //   {nextTournament.editionLabel} is live at {nextTournamentOverride.venue}, {nextTournamentOverride.dateLabel}. Results...
  //
  // was: Next up: {nextTournament.editionLabel}{nextVenueKnown ? ` at ${nextTournament.venue}` : ""}, {nextTournament.dateLabel}.
  // becomes:
  //   Next up: {nextTournament.editionLabel}{nextVenueKnown ? ` at ${nextTournamentOverride.venue}` : ""}, {nextTournamentOverride.dateLabel}.
}
```

`nextTournament.editionLabel` (both occurrences, including the "Underway"
label at the top of the section) stays from the static import —
unaffected by this task.

- [ ] **Step 6: Update `HomeDashboard.tsx` to pass the override to `QuickScheduleCard`**

Add `nextTournamentOverride: NextTournamentOverride` to
`HomeDashboard`'s props, and pass it to both existing
`<QuickScheduleCard />` call sites (line 217 and line 390 today) as
`<QuickScheduleCard nextTournamentOverride={nextTournamentOverride} />`.
No other change to `HomeDashboard.tsx` — it doesn't read venue/date
fields itself.

- [ ] **Step 7: Update `QuickScheduleCard.tsx`**

```typescript
// components/home/QuickScheduleCard.tsx
"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament } from "@/lib/data";
import type { NextTournamentOverride } from "@/lib/data/types";

function placeholderDateLabel(startDate: string): string {
  const [year, month, day] = startDate.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

export function QuickScheduleCard({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  const { tournament } = useLiveTournament();
  const liveMatch = tournament.matches.find((match) => match.status === "live");

  return (
    <Link
      href="/schedule"
      className="group flex flex-col gap-2 rounded-md border border-gold-400 bg-cream-50 px-3 py-2 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg sm:gap-3 sm:px-4 sm:py-3"
    >
      <div className="flex items-center gap-1.5 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">
        <CalendarDays size={14} />
        Schedule
      </div>
      {liveMatch ? (
        <div>
          <div className="font-sans text-xs font-bold text-ink-900 sm:text-sm">
            Round {liveMatch.day} &mdash; {liveMatch.session}
          </div>
          <div className="font-sans text-2xs text-ink-500 sm:text-xs">{liveMatch.format}</div>
        </div>
      ) : (
        <div>
          <div className="font-sans text-xs font-bold text-ink-900 sm:text-sm">
            Round 1 starts {placeholderDateLabel(nextTournament.startDate)}
          </div>
          <div className="font-sans text-2xs text-ink-500 sm:text-xs">{nextTournamentOverride.venue}</div>
        </div>
      )}
    </Link>
  );
}
```

`nextTournament.startDate` (the raw ISO date fed to
`placeholderDateLabel`) is intentionally left reading the static import
here, not the override — the override only carries `venue`/`dateLabel`
(Task 4's `NextTournamentOverride` shape). Widening it to include
`startDate` is unnecessary: this line only ever shows before a live
match exists, i.e. before the tournament starts, so the static file's
`startDate` and the database's `beginDate` are expected to already
agree once Tiger sets them in Master Settings (Task 11's manual
walkthrough covers confirming this).

- [ ] **Step 8: Update `app/teams/[slug]/page.tsx` and `UpcomingNotice.tsx`**

```typescript
// app/teams/[slug]/page.tsx
// Add this import:
import { getNextTournamentOverride } from "@/lib/data";
// ... existing imports unchanged ...

export default async function TeamsYearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === nextTournament.slug) {
    const nextTournamentOverride = await getNextTournamentOverride();
    return (
      <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
        <YearTabs basePath="/teams" activeSlug={slug} includeLive />
        <UpcomingNotice what="A roster" nextTournamentOverride={nextTournamentOverride} />
      </div>
    );
  }

  // ... rest unchanged ...
}
```

```typescript
// components/UpcomingNotice.tsx
import { CalendarClock } from "lucide-react";
import { nextTournament } from "@/lib/data";
import type { NextTournamentOverride } from "@/lib/data/types";

function isSet(value: string): boolean {
  return value.trim().length > 0 && value.trim().toLowerCase() !== "tbd";
}

export function UpcomingNotice({ what, nextTournamentOverride }: { what: string; nextTournamentOverride: NextTournamentOverride }) {
  const rosterKnown = !!nextTournament.roster && (nextTournament.roster.maroon.length > 0 || nextTournament.roster.white.length > 0);
  const details = [nextTournamentOverride.venue, nextTournament.location].filter(isSet).join(" · ");

  return (
    <div className="bg-cream-100 border border-dashed border-ink-300 rounded-lg p-8 text-center">
      <CalendarClock className="mx-auto mb-3 text-maroon-600" width={28} height={28} />
      <div className="font-serif text-2xl font-semibold text-ink-900 mb-2">{nextTournament.editionLabel}</div>
      {details && (
        <div className="font-condensed text-[13px] font-semibold tracking-wide uppercase text-maroon-700 mb-2">
          {details} · {nextTournamentOverride.dateLabel}
        </div>
      )}
      <p className="font-sans text-sm text-ink-500 max-w-[420px] mx-auto">
        {rosterKnown
          ? `${what} for ${nextTournamentOverride.dateLabel} hasn’t been posted yet — check back closer to the trip.`
          : `${what} for ${nextTournamentOverride.dateLabel} hasn’t been set yet — the roster and pairings will appear here once they’re finalized.`}
      </p>
    </div>
  );
}
```

- [ ] **Step 9: Update `app/schedule/[slug]/page.tsx` to use the async venue overlay**

```typescript
// app/schedule/[slug]/page.tsx
import { notFound } from "next/navigation";
import { VenueSchedulePage } from "@/components/schedule/VenueSchedulePage";
import { pastTournaments, nextTournament, getVenueBySlugAsync } from "@/lib/data";

export function generateStaticParams() {
  return [...pastTournaments.map((t) => ({ slug: t.slug })), { slug: nextTournament.slug }];
}

export default async function ScheduleYearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const venue = await getVenueBySlugAsync(slug);
  if (!venue) notFound();

  return (
    <div className="max-w-[1360px] mx-auto px-7 pt-8 pb-16">
      <VenueSchedulePage venue={venue} />
    </div>
  );
}
```

`generateStaticParams` keeps using the sync `nextTournament.slug` —
unaffected, matches every other route's `generateStaticParams` in this
codebase.

- [ ] **Step 10: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add app/layout.tsx components/nav/SiteChrome.tsx components/Header.tsx components/Footer.tsx app/page.tsx components/home/VideoHero.tsx components/home/HomeDashboard.tsx components/home/QuickScheduleCard.tsx app/teams/\[slug\]/page.tsx components/UpcomingNotice.tsx app/schedule/\[slug\]/page.tsx
git commit -m "feat(site): wire venue/dates to the active season's database row"
```

Manually verify after `npm run build`: run `npm run dev`, load `/`, and
confirm the homepage still shows "Mission Hills CC" and "January 6–9,
2027" exactly as before this task (Task 1's backfill seeded the database
with those same values, so nothing should visually change yet).

---

### Task 11: `MasterSettingsPanel` and the Master Settings page

**Files:**
- Create: `components/portal/tiger/MasterSettingsPanel.tsx`
- Create: `app/portal/admin/master-settings/[year]/page.tsx`

**Interfaces:**
- Consumes: `AddCourseForm` (existing, unchanged), `isValidSeasonYear`,
  `SEASON_YEARS`, `getActiveSeasonYear` (Task 2), `TournamentSettings`,
  `LiveCourse` (Task 2/existing).
- Produces (consumed by Task 13): the page at
  `/portal/admin/master-settings/[year]`, and the 4-box grid this page
  renders (Players & Teams / Courses & Format / Matchups link into Task
  12's moved pages; Scorecards & Video links to the existing, unmoved
  `/portal/admin/scorecards` — that screen manages already-completed past
  tournaments by their own slug, not by `season_year`, so it doesn't move).

- [ ] **Step 1: Create `MasterSettingsPanel`**

```typescript
// components/portal/tiger/MasterSettingsPanel.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { LiveCourse, TournamentSettings } from "@/lib/live/types";
import { AddCourseForm } from "./AddCourseForm";

const SETUP_BOXES = [
  { label: "Players & Teams", path: "players-teams" },
  { label: "Courses & Format", path: "courses-format" },
  { label: "Matchups", path: "matchups" },
];

export function MasterSettingsPanel({
  year,
  initialSettings,
  initialCourses,
  isActiveYear,
}: {
  year: number;
  initialSettings: TournamentSettings;
  initialCourses: LiveCourse[];
  isActiveYear: boolean;
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [addingCourse, setAddingCourse] = useState(false);

  const [beginDate, setBeginDate] = useState(initialSettings.beginDate ?? "");
  const [endDate, setEndDate] = useState(initialSettings.endDate ?? "");
  const [datesLocked, setDatesLocked] = useState(initialSettings.datesLocked);
  const [venueName, setVenueName] = useState(initialSettings.venueName ?? "");
  const [venueLocked, setVenueLocked] = useState(initialSettings.venueLocked);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingActive, setSettingActive] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/master-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          beginDate: beginDate || null,
          endDate: endDate || null,
          datesLocked,
          venueName: venueName.trim() || null,
          venueLocked,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  async function setActiveYear() {
    if (!window.confirm(`Make ${year} the active year? This is what the public site and player scoring will follow.`)) return;
    setSettingActive(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/active-season", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } finally {
      setSettingActive(false);
    }
  }

  return (
    <div className="mt-6">
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <div className="mt-3">
        {isActiveYear ? (
          <span className="rounded-full bg-maroon-700 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white">Active Year</span>
        ) : (
          <button
            type="button"
            disabled={settingActive}
            onClick={setActiveYear}
            className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50"
          >
            {settingActive ? "Setting…" : "Set as Active Year"}
          </button>
        )}
      </div>

      <section className="mt-6 rounded-lg border-2 border-stone-300 p-4">
        <h2 className="font-serif text-lg font-bold text-ink-900">Course Upload</h2>
        <ul className="mt-3 font-sans text-sm text-ink-700">
          {courses.map((c) => (
            <li key={c.id} className="border-b border-stone-200 py-1 last:border-b-0">
              {c.name}
              {c.rating != null && c.slope != null && <span className="text-ink-500"> — Rating {c.rating}, Slope {c.slope}</span>}
            </li>
          ))}
          {courses.length === 0 && <li className="text-ink-500">No courses uploaded yet.</li>}
        </ul>
        <button
          type="button"
          onClick={() => setAddingCourse((v) => !v)}
          className="mt-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
        >
          {addingCourse ? "Cancel" : "Add Course"}
        </button>
        {addingCourse && (
          <AddCourseForm
            onSaved={(course) => {
              setCourses((current) => [...current, course]);
              setAddingCourse(false);
            }}
          />
        )}
      </section>

      <section className="mt-4 rounded-lg border-2 border-stone-300 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold text-ink-900">Tournament Dates</h2>
          <button
            type="button"
            disabled={!datesLocked && (!beginDate || !endDate)}
            onClick={() => setDatesLocked((v) => !v)}
            className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50"
          >
            {datesLocked ? "Unlock" : "Lock"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
            Begin Date
            <input
              type="date"
              value={beginDate}
              disabled={datesLocked}
              onChange={(e) => setBeginDate(e.target.value)}
              className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
            End Date
            <input
              type="date"
              value={endDate}
              disabled={datesLocked}
              onChange={(e) => setEndDate(e.target.value)}
              className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      <section className="mt-4 rounded-lg border-2 border-stone-300 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold text-ink-900">Venue Name</h2>
          <button
            type="button"
            disabled={!venueLocked && !venueName.trim()}
            onClick={() => setVenueLocked((v) => !v)}
            className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50"
          >
            {venueLocked ? "Unlock" : "Lock"}
          </button>
        </div>
        <input
          type="text"
          value={venueName}
          disabled={venueLocked}
          onChange={(e) => setVenueName(e.target.value)}
          placeholder="e.g. Mission Hills CC"
          className="mt-3 w-full border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
        />
      </section>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="mt-4 rounded-lg bg-maroon-700 px-5 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SETUP_BOXES.map((box) => (
          <Link
            key={box.path}
            href={`/portal/admin/master-settings/${year}/${box.path}`}
            className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
          >
            {box.label}
          </Link>
        ))}
        <Link
          href="/portal/admin/scorecards"
          className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
        >
          Scorecards & Video
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the Master Settings page**

```typescript
// app/portal/admin/master-settings/[year]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear, getActiveSeasonYear } from "@/lib/live/activeSeason";
import { MasterSettingsPanel } from "@/components/portal/tiger/MasterSettingsPanel";
import type { LiveCourse, TournamentSettings } from "@/lib/live/types";

export default async function MasterSettingsPage({ params }: { params: Promise<{ year: string }> }) {
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
  const [{ data: settingsRow }, { data: courseRows }, activeYear] = await Promise.all([
    service
      .from("live_tournament_settings")
      .select("round_count, completed_at, venue_name, venue_locked, begin_date, end_date, dates_locked")
      .eq("season_year", year)
      .maybeSingle(),
    service.from("live_courses").select("id, name, holes, rating, slope").order("name"),
    getActiveSeasonYear(),
  ]);

  const settings: TournamentSettings = {
    roundCount: settingsRow?.round_count ?? null,
    completedAt: settingsRow?.completed_at ?? null,
    venueName: settingsRow?.venue_name ?? null,
    venueLocked: settingsRow?.venue_locked ?? false,
    beginDate: settingsRow?.begin_date ?? null,
    endDate: settingsRow?.end_date ?? null,
    datesLocked: settingsRow?.dates_locked ?? false,
  };
  const courses: LiveCourse[] = (courseRows ?? []).map((c) => ({ id: c.id, name: c.name, holes: c.holes, rating: c.rating, slope: c.slope }));

  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">{year} Master Settings</h1>
      <MasterSettingsPanel year={year} initialSettings={settings} initialCourses={courses} isActiveYear={activeYear === year} />
    </div>
  );
}
```

- [ ] **Step 3: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add components/portal/tiger/MasterSettingsPanel.tsx app/portal/admin/master-settings
git commit -m "feat(tiger): Master Settings page — Course Upload, Dates, Venue, Save"
```

Manually verify after `npm run build`: `npm run dev`, sign in as the
host, visit `/portal/admin/master-settings/2027` — Tournament Dates and
Venue Name should show the real, backfilled 2027 values, both unlocked
(Task 1 seeded the values but not the locks); the "Active Year" badge
should show (not the button). Visit
`/portal/admin/master-settings/2030` — everything blank, no badge, "Set
as Active Year" button present. Lock both dates, lock venue, Save,
reload — read-only and persisted. Visit `/portal/admin/master-settings/2035`
— 404.

---

### Task 12: Move Players & Teams, Courses & Format, and Matchups under `[year]`

**Files:**
- Delete: `app/portal/admin/players-teams/page.tsx`
- Create: `app/portal/admin/master-settings/[year]/players-teams/page.tsx`
- Delete: `app/portal/admin/courses-format/page.tsx`
- Create: `app/portal/admin/master-settings/[year]/courses-format/page.tsx`
- Delete: `app/portal/admin/matchups/page.tsx`
- Create: `app/portal/admin/master-settings/[year]/matchups/page.tsx`
- Modify: `components/portal/PlayerSlotsAdmin.tsx`
- Modify: `components/portal/tiger/CoursesFormatPanel.tsx`
- Modify: `components/portal/tiger/MatchupsPanel.tsx`

**Interfaces:**
- Consumes: `isValidSeasonYear` (Task 2), the now-year-scoped routes from
  Tasks 6-9.
- Produces: nothing new — these are leaf pages nothing else in this plan
  depends on.

- [ ] **Step 1: Move and update the Players & Teams page**

```bash
git mv app/portal/admin/players-teams/page.tsx app/portal/admin/master-settings/\[year\]/players-teams/page.tsx
```

```typescript
// app/portal/admin/master-settings/[year]/players-teams/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { playerProfiles } from "@/lib/data/players";
import { PlayerSlotsAdmin, type PlayerSlotAdminRow } from "@/components/portal/PlayerSlotsAdmin";

export default async function PortalAdminPage({ params }: { params: Promise<{ year: string }> }) {
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
  const { data: slots } = await service.from("player_slots").select("player_slug, username, claimed_by");
  const byslug = new Map((slots ?? []).map((s) => [s.player_slug, s]));

  const { data: roster } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
  const rosterBySlug = new Map((roster ?? []).map((r) => [r.player_slug, r.team as "maroon" | "white"]));

  const { data: pendingRows } = await service
    .from("player_profile_edits")
    .select("player_slug, field, proposed_value, submitted_at");
  const pendingBySlug = new Map<string, { field: string; proposedValue: string | string[]; submittedAt: string }[]>();
  for (const row of pendingRows ?? []) {
    const list = pendingBySlug.get(row.player_slug) ?? [];
    list.push({ field: row.field, proposedValue: row.proposed_value, submittedAt: row.submitted_at });
    pendingBySlug.set(row.player_slug, list);
  }

  const rows: PlayerSlotAdminRow[] = playerProfiles.map((p) => ({
    playerSlug: p.slug,
    fullName: p.fullName,
    username: byslug.get(p.slug)?.username ?? null,
    claimedBy: byslug.get(p.slug)?.claimed_by ?? null,
    team: rosterBySlug.get(p.slug) ?? null,
    pendingEdits: pendingBySlug.get(p.slug) ?? [],
  }));

  return <PlayerSlotsAdmin year={year} rows={rows} />;
}
```

- [ ] **Step 2: Update `PlayerSlotsAdmin.tsx` to take and use `year`**

Add `year: number` to its props type and pass `year` in the
`handleSetTeam` fetch body:

```typescript
// components/portal/PlayerSlotsAdmin.tsx
// Add `year: number` to the component's props destructuring/type
// (wherever the existing props like `rows` are declared), then:

  async function handleSetTeam(playerSlug: string, team: "maroon" | "white") {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, playerSlug, team }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }
```

Every other function in `PlayerSlotsAdmin.tsx`
(`handleUnlink`/`profile-edits` approve/deny/set) is untouched — those
routes have no year dimension.

- [ ] **Step 3: Move and update the Courses & Format page**

```bash
git mv app/portal/admin/courses-format/page.tsx app/portal/admin/master-settings/\[year\]/courses-format/page.tsx
```

```typescript
// app/portal/admin/master-settings/[year]/courses-format/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { CoursesFormatPanel } from "@/components/portal/tiger/CoursesFormatPanel";
import type { LiveCourse, LiveRoundState, MatchFormat, TournamentSettings } from "@/lib/live/types";

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
  const [{ data: settingsRow }, { data: roundRows }, { data: courseRows }] = await Promise.all([
    service
      .from("live_tournament_settings")
      .select("round_count, completed_at, venue_name, venue_locked, begin_date, end_date, dates_locked")
      .eq("season_year", year)
      .maybeSingle(),
    service
      .from("live_round_state")
      .select("round, started, course_id, date, format, course_locked, matchups_locked")
      .eq("season_year", year)
      .order("round"),
    service.from("live_courses").select("id, name, holes, rating, slope").order("name"),
  ]);

  const settings: TournamentSettings = {
    roundCount: settingsRow?.round_count ?? null,
    completedAt: settingsRow?.completed_at ?? null,
    venueName: settingsRow?.venue_name ?? null,
    venueLocked: settingsRow?.venue_locked ?? false,
    beginDate: settingsRow?.begin_date ?? null,
    endDate: settingsRow?.end_date ?? null,
    datesLocked: settingsRow?.dates_locked ?? false,
  };
  const rounds: LiveRoundState[] = (roundRows ?? []).map((r) => ({
    seasonYear: year,
    round: r.round,
    started: r.started,
    courseId: r.course_id,
    date: r.date,
    format: r.format as MatchFormat | null,
    courseLocked: r.course_locked,
    matchupsLocked: r.matchups_locked,
  }));
  const courses: LiveCourse[] = (courseRows ?? []).map((c) => ({ id: c.id, name: c.name, holes: c.holes, rating: c.rating, slope: c.slope }));

  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Courses & Format</h1>
      <CoursesFormatPanel year={year} initialSettings={settings} initialRounds={rounds} initialCourses={courses} />
    </div>
  );
}
```

- [ ] **Step 4: Update `CoursesFormatPanel.tsx` to take and use `year`**

Add `year: number` to its props, and add `year` to every fetch body:

```typescript
// components/portal/tiger/CoursesFormatPanel.tsx
"use client";

import { useState } from "react";
import type { LiveCourse, LiveRoundState, MatchFormat, TournamentSettings } from "@/lib/live/types";
import { AddCourseForm } from "./AddCourseForm";

const FORMATS: MatchFormat[] = ["Fourball", "Foursome", "Singles"];

export function CoursesFormatPanel({
  year,
  initialSettings,
  initialRounds,
  initialCourses,
}: {
  year: number;
  initialSettings: TournamentSettings;
  initialRounds: LiveRoundState[];
  initialCourses: LiveCourse[];
}) {
  const [roundCount, setRoundCount] = useState<number | null>(initialSettings.roundCount);
  const [rounds, setRounds] = useState(initialRounds);
  const [courses, setCourses] = useState(initialCourses);
  const [addingCourseFor, setAddingCourseFor] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveRoundCount(count: number) {
    setRoundCount(count);
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

  async function updateRound(round: number, patch: { date?: string; courseId?: string; format?: MatchFormat }) {
    setError(null);
    const date = patch.date === "" ? null : patch.date;
    const res = await fetch("/api/portal/tiger/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, round, ...patch, date }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setRounds((current) =>
      current.map((r) => {
        if (r.round !== round) return r;
        return {
          ...r,
          date: patch.date !== undefined ? (date ?? null) : r.date,
          courseId: patch.courseId ?? r.courseId,
          format: patch.format ?? r.format,
        };
      })
    );
  }

  async function toggleLock(round: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/rounds/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, round, lock: "course", value }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setRounds((current) => current.map((r) => (r.round === round ? { ...r, courseLocked: value } : r)));
  }

  async function removeRound(round: number) {
    setError(null);
    const res = await fetch("/api/portal/tiger/rounds/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, round }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      setRemoveTarget(null);
      return;
    }
    setRounds((current) => current.filter((r) => r.round !== round));
    setRemoveTarget(null);
  }

  // Render tree unchanged from the current file — no JSX edits needed
  // here, only the four functions above gained `year`.
}
```

(The full `return (...)` JSX block from the existing file is unchanged —
only the four `async function`s above it change, each gaining `year` in
its `fetch` body.)

- [ ] **Step 5: Move and update the Matchups page**

```bash
git mv app/portal/admin/matchups/page.tsx app/portal/admin/master-settings/\[year\]/matchups/page.tsx
```

```typescript
// app/portal/admin/master-settings/[year]/matchups/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { playerProfiles } from "@/lib/data/players";
import { MatchupsPanel, type RosterPlayer } from "@/components/portal/tiger/MatchupsPanel";
import type { LiveMatchBox, LiveRoundState, MatchFormat, MatchState } from "@/lib/live/types";

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
  const [{ data: roundRows }, { data: boxRows }, { data: rosterRows }] = await Promise.all([
    service
      .from("live_round_state")
      .select("round, started, course_id, date, format, course_locked, matchups_locked")
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

  const rounds: LiveRoundState[] = (roundRows ?? []).map((r) => ({
    seasonYear: year,
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
    seasonYear: year,
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
      <MatchupsPanel year={year} rounds={rounds} initialMatchBoxes={matchBoxes} roster={roster} />
    </div>
  );
}
```

- [ ] **Step 6: Update `MatchupsPanel.tsx` to take and use `year`**

Add `year: number` to its props, and add `year` to the three fetch
bodies (`saveBox`, `removeBox`'s call doesn't need it — `matchboxes/remove`
takes only `id`, per Task 9 — and `toggleMatchupsLock`):

```typescript
// components/portal/tiger/MatchupsPanel.tsx
// Change the component signature:
export function MatchupsPanel({
  year,
  rounds,
  initialMatchBoxes,
  roster,
}: {
  year: number;
  rounds: LiveRoundState[];
  initialMatchBoxes: LiveMatchBox[];
  roster: RosterPlayer[];
}) {
  // ... existing body unchanged until saveBox/toggleMatchupsLock ...

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
          year,
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

  // removeBox unchanged — matchboxes/remove takes only { id }.

  async function toggleMatchupsLock(round: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/rounds/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, round, lock: "matchups", value }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  // Rest of the file (draftFor/updateDraft/availablePlayers/timeInputValue
  // and the whole JSX return) unchanged.
}
```

- [ ] **Step 7: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
git add app/portal/admin/master-settings components/portal/PlayerSlotsAdmin.tsx components/portal/tiger/CoursesFormatPanel.tsx components/portal/tiger/MatchupsPanel.tsx
git commit -m "feat(tiger): move Players & Teams, Courses & Format, Matchups under Master Settings"
```

Manually verify after `npm run build`: `npm run dev`, visit
`/portal/admin/master-settings/2027/players-teams` — real 2027 roster
shows (proving the `season_year` backfill preserved it). Assign a player
to a team, reload, confirm it stuck. Same for
`/portal/admin/master-settings/2027/courses-format` (real rounds show)
and `/portal/admin/master-settings/2027/matchups` (real match boxes
show). Visit the old URLs (`/portal/admin/players-teams`,
`/portal/admin/courses-format`, `/portal/admin/matchups`) and confirm
they now 404 (the files were moved, not copied).

---

### Task 13: Rework the Tiger Center home screen

**Files:**
- Create: `components/portal/tiger/YearAndMasterSettingsNav.tsx`
- Modify: `app/portal/admin/page.tsx`
- Modify: `components/portal/tiger/StartRoundBanner.tsx` (no code
  change — see note below; listed so the reviewer checks it)
- Delete: `components/portal/tiger/TigerCenterNav.tsx`

**Interfaces:**
- Consumes: `SEASON_YEARS`, `getActiveSeasonYear` (Task 2).
- Produces: nothing else in this plan depends on this task — it's the
  final piece.

`StartRoundBanner` itself needs no code change (it already just takes a
`round: StartableRound | null` prop and POSTs `{ round: round.round }` to
`/api/portal/tiger/rounds/start` — Task 8 already added a required
`year` field to that route). What changes is **what its caller passes
it**: Step 2 below scopes the round it looks up to the active season
year, and includes that `year` in the POST body
`StartRoundBanner` already sends (via a small prop addition), so this
task does touch `StartRoundBanner.tsx` after all — see Step 2.

- [ ] **Step 1: Create the year/Master Settings nav**

```typescript
// components/portal/tiger/YearAndMasterSettingsNav.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { SEASON_YEARS } from "@/lib/live/activeSeason";

export function YearAndMasterSettingsNav({ initialYear }: { initialYear: number }) {
  const [year, setYear] = useState(initialYear);

  return (
    <div>
      <label className="font-sans text-sm font-semibold text-ink-700">
        Year:{" "}
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border-2 border-stone-300 rounded-lg px-2 py-1"
        >
          {SEASON_YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      <Link
        href={`/portal/admin/master-settings/${year}`}
        className="mt-4 block rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
      >
        {year} Master Settings
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/portal/admin/page.tsx`**

```typescript
// app/portal/admin/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { YearAndMasterSettingsNav } from "@/components/portal/tiger/YearAndMasterSettingsNav";
import { StartRoundBanner, type StartableRound } from "@/components/portal/tiger/StartRoundBanner";

export default async function TigerCenterPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const activeYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();
  const [{ data: roundRows }, { data: courseRows }] = await Promise.all([
    service
      .from("live_round_state")
      .select("round, date, format, course_id, course_locked, matchups_locked, started")
      .eq("season_year", activeYear)
      .order("round"),
    service.from("live_courses").select("id, name"),
  ]);
  const courseNameById = new Map((courseRows ?? []).map((c) => [c.id, c.name as string]));
  const nextRound = (roundRows ?? []).find((r) => r.course_locked && r.matchups_locked && !r.started);
  const startable: StartableRound | null = nextRound
    ? { year: activeYear, round: nextRound.round, format: nextRound.format ?? "", courseName: nextRound.course_id ? courseNameById.get(nextRound.course_id) ?? null : null, date: nextRound.date }
    : null;

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">The Tiger Center</h1>
      {startable && <StartRoundBanner round={startable} />}
      <div className="mt-6">
        <YearAndMasterSettingsNav initialYear={activeYear} />
      </div>
      <Link
        href="/portal/admin/wagers"
        className="mt-8 block font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
      >
        MM Coins Settlement →
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Add `year` to `StartRoundBanner`**

```typescript
// components/portal/tiger/StartRoundBanner.tsx
"use client";

import { useState } from "react";

export interface StartableRound {
  year: number;
  round: number;
  format: string;
  courseName: string | null;
  date: string | null;
}

export function StartRoundBanner({ round }: { round: StartableRound }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/rounds/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: round.year, round: round.round }),
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
        Round {round.round} — {round.courseName ?? "Course TBD"} ({round.format})
      </div>
      {round.date && <div className="mt-1 font-sans text-sm text-ink-500">{round.date}</div>}
      {error && <p className="mt-2 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={start}
        className="mt-3 rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {busy ? "Starting…" : "Start Round"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Delete `TigerCenterNav.tsx`**

```bash
git rm components/portal/tiger/TigerCenterNav.tsx
```

It's fully superseded: its box grid (minus Edit Scores, which is gone)
now lives in `MasterSettingsPanel` (Task 11), and its only import site
(`app/portal/admin/page.tsx`) was replaced in Step 2 above.

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
grep -rn "TigerCenterNav" app components || echo "no remaining references"
git add components/portal/tiger/YearAndMasterSettingsNav.tsx app/portal/admin/page.tsx components/portal/tiger/StartRoundBanner.tsx
git commit -m "feat(tiger): year picker + single Master Settings box on the Tiger Center home screen"
```

Manually verify after `npm run build`: `npm run dev`, visit
`/portal/admin` — shows a year dropdown (defaulting to 2027, the active
year) and one "2027 Master Settings" box, no Edit Scores anywhere,
`StartRoundBanner` still appears/works exactly as before if a round is
ready to start. Switch the dropdown to 2030 — the box relabels to "2030
Master Settings" without navigating. Click it — lands on the (blank,
unlocked) 2030 Master Settings page. Go back to `/portal/admin`, confirm
it's still 2027 selected by default (state doesn't leak between visits).
This is also the point to re-run the full walkthrough from the spec's
Testing section end-to-end: lock/unlock, Save, "Set as Active Year" on
a second year with confirmation, then flip back to 2027 to leave
production in its real state.
