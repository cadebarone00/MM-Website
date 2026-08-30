# Tiger Center Player Live Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Tiger start a fully-locked round, and let players actually play it — each match box's players enter each other's official strokes and their own personal stats hole by hole, watch it update live, and submit once done — so real data lands in Supabase ready for Tiger's official review (a later, separate phase).

**Architecture:** Extends `lib/live/orchestration.ts`/`scoring.ts`'s pure rules with the two pieces they were missing (real Foursome match math, an individual-stats format exclusion), adds host/player Route Handlers following the exact patterns every prior Tiger Center phase established (`requireHost`/`requirePlayer`, service-role writes, server-side validation of every client-supplied value), and adds the first client-side Supabase usage this codebase has ever needed — a browser client plus Postgres Changes subscriptions — so the scoring screen updates instantly as players enter data. Wires the already-shipped (but inert) "Scorecard" box on `/portal/scoring` to a real hole-by-hole entry screen, and adds a "Start Round" banner to the Tiger Center landing page.

**Tech Stack:** Next.js 16 App Router (Route Handlers, Server + Client Components), TypeScript, Supabase (`@supabase/ssr`, `@supabase/supabase-js` for the new browser client and Realtime), `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-30-tiger-center-player-live-scoring-design.md` (also see `docs/superpowers/specs/2026-08-29-tiger-center-operations-design.md`'s "The live round cycle" section, which this implements the first half of).

## A note on this repo's current state

Other people/sessions are actively committing directly to `main` in parallel with this plan (unrelated feature work — scorecards, stats, profile pages). Before trusting this plan's stated branch base, **re-run `git log --oneline -5 main` and re-check that the files this plan touches (`lib/live/orchestration.ts`, `lib/live/scoring.ts`, `components/portal/ScoringStatusScreen.tsx`, `app/portal/admin/page.tsx`, `supabase/schema.sql`) haven't drifted from what this plan assumes** — read each one fresh before your first edit to it, not just this plan's excerpts. If something has genuinely changed shape, that's a real finding for the pre-flight conflict scan, not a reason to guess.

## Global Constraints

- Every Route Handler is host-only or player-only per its purpose: resolve identity via `lib/portal/requireHost.ts` or `lib/portal/requirePlayer.ts` (do not write a new inline check).
- All writes go through `createSupabaseServiceRoleClient()` (bypasses RLS) — never trust a client-supplied player/round/hole/score value without validating it against real data server-side (which match box a player is really in, which player they're really allowed to score, whether they've already submitted).
- A hole's stroke score is written only by the caller's assigned scoring opponent (or, for Foursome, any player on the opposing side); a hole's putts/fairway/green are written only by the player themselves. Never trust the client's claim about which of these it's doing — re-derive the caller's real relationship to the target(s) from the locked match box server-side every time.
- Match existing code style: Tailwind utility classes matching `components/portal/tiger/MatchupsPanel.tsx`'s look (font-serif headers, font-sans body, maroon-700 accents, font-condensed uppercase small text for buttons/labels, `border-2 border-stone-300 rounded-lg` inputs).
- Follow the existing per-file convention for mapping Supabase rows to types (a local `interface FooRow` + a local mapping function in the file that queries it) rather than introducing a shared abstraction.
- No React component test framework exists in this repo — UI tasks are verified via `npx tsc --noEmit`, `npm run lint`, `npm run build`, and a manual/structural check. Only pure logic (no Supabase I/O) gets `node:test` unit tests, matching every existing `lib/live/*.test.ts`'s documented limitation that Supabase-touching code needs a real request lifecycle to test — Route Handler tests stay limited to the auth-gate check already standard in this codebase (`rejects when requireHost/requirePlayer resolves null`).
- Run `npm test && npx tsc --noEmit && npm run lint && npm run build` clean before considering any task done.

---

### Task 1: Schema — match box submissions table, Realtime publication

**Files:**
- Modify: `supabase/schema.sql` (append after the "Tiger Center: Matchups" section)
- Modify: `.env.example` (document the two new public env vars)

**Interfaces:**
- Produces (consumed by Tasks 5-7): `live_match_box_submissions(match_box_id uuid references live_match_boxes(id) on delete cascade, player_slug text references player_slots(player_slug), submitted_at timestamptz, primary key (match_box_id, player_slug))`.
- Produces (consumed by Task 9's Realtime subscription): `live_hole_scores` and `live_match_box_submissions` added to the `supabase_realtime` publication.

- [ ] **Step 1: Append the migration**

```sql
-- === Tiger Center: Player Live Scoring ====================================
-- Tracks each player's own final submission for a match box (the ops
-- spec's "Submit Scores" action — one row per player once they've entered
-- everything they're responsible for and hit Submit). `on delete cascade`
-- is included from the start this time — the Matchups migration shipped
-- without one on `live_match_boxes.round` and it took two real bugs
-- (a stuck "Remove round" and a stale-format hazard) to fix; this table
-- inherits that lesson.

create table if not exists live_match_box_submissions (
  match_box_id uuid not null references live_match_boxes(id) on delete cascade,
  player_slug text not null references player_slots(player_slug),
  submitted_at timestamptz not null default now(),
  primary key (match_box_id, player_slug)
);

alter table live_match_box_submissions enable row level security;

drop policy if exists live_match_box_submissions_select_all on live_match_box_submissions;
create policy live_match_box_submissions_select_all on live_match_box_submissions for select using (true);

-- Postgres has no "add table if not exists" for publications, so this is
-- guarded manually — safe to re-run. Both tables need to be in this
-- publication for the scoring screen's Supabase Realtime subscriptions
-- (Task 9) to receive any events at all; RLS alone does not enable that.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'live_hole_scores'
  ) then
    alter publication supabase_realtime add table live_hole_scores;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'live_match_box_submissions'
  ) then
    alter publication supabase_realtime add table live_match_box_submissions;
  end if;
end $$;
```

- [ ] **Step 2: Document the new browser env vars**

Append to `.env.example`:

```
# Public — safe to expose to the browser. Same Supabase project/anon key
# the server already uses (SUPABASE_URL/SUPABASE_ANON_KEY above), just
# re-exposed under the NEXT_PUBLIC_ prefix Next.js requires to bundle a
# value into client code. Used by lib/supabase/client.ts (Task 9) for the
# scoring screen's live-update subscriptions. Every table it subscribes to
# has a public-read RLS policy and no write policy at all, so this key
# cannot write anything from the browser.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Run the SQL against your Supabase project, and set the two new env vars**

This step is for the operator, not the implementer — same as every prior schema task in this project. Note in your report that this step is manual (no DB credentials are configured in this environment): (a) run the Step 1 SQL in the Supabase SQL Editor, (b) add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same values as the existing `SUPABASE_URL`/`SUPABASE_ANON_KEY`) to both local `.env` and the Vercel project's environment variables. Do not attempt either.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql .env.example
git commit -m "feat(scoring): add match box submissions table and Realtime publication"
```

---

### Task 2: Real Foursome match scoring + scoring-assignment authorization

**Files:**
- Modify: `lib/live/orchestration.ts`
- Modify: `lib/live/orchestration.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Tasks 6-9): `holeComplete`/`matchBoxResult` now compute real results for Foursome instead of the `format === "Foursome"` stub; new `canScoreStrokesFor(matchBox: LiveMatchBox, scorerSlug: string, targetSlugs: string[]): boolean`.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/live/orchestration.test.ts
// Update the existing import line to add the two new names this file's
// new tests call directly (holeComplete, matchBoxStartedThru) plus the
// new canScoreStrokesFor:
// was: import { effectiveMatchState, matchBoxResult, roundIsComplete, thruLabel, validateMatchBox } from "./orchestration.ts";
import { canScoreStrokesFor, effectiveMatchState, holeComplete, matchBoxResult, matchBoxStartedThru, roundIsComplete, thruLabel, validateMatchBox } from "./orchestration.ts";

// Then add these tests (seedSnapshot()/box() are this file's existing
// helpers, unchanged):

test("holeComplete and matchBoxResult treat Foursome like a 1v1 with one shared score per side", () => {
  const snapshot = seedSnapshot();
  const foursome = box(1, 1, ["cam", "drew"], ["cade", "collin"], "Foursome");
  // Both players on a side always hold the identical value (the write
  // path guarantees this — see Task 6) — a real fixture reflects that.
  for (const hole of [1, 2, 3]) {
    updateScore(snapshot, "cam", 1, hole, 4, 0, null, false);
    updateScore(snapshot, "drew", 1, hole, 4, 0, null, false);
    updateScore(snapshot, "cade", 1, hole, 5, 0, null, false);
    updateScore(snapshot, "collin", 1, hole, 5, 0, null, false);
  }
  assert.equal(holeComplete(snapshot, foursome, 1), true);
  assert.equal(matchBoxStartedThru(snapshot, foursome), 3);
  const result = matchBoxResult(snapshot, foursome);
  assert.equal(result.leader, "maroon");
  assert.equal(result.margin, 3);
});

test("canScoreStrokesFor requires the exact opposing pair position for Fourball/Singles", () => {
  const snapshot = seedSnapshot();
  const fourball = box(1, 1, ["cam", "drew"], ["cade", "collin"]);
  assert.equal(canScoreStrokesFor(fourball, "cam", ["cade"]), true);
  assert.equal(canScoreStrokesFor(fourball, "drew", ["collin"]), true);
  assert.equal(canScoreStrokesFor(fourball, "cam", ["collin"]), false, "cam is paired with cade, not collin");
  assert.equal(canScoreStrokesFor(fourball, "cam", ["cade", "collin"]), false, "exactly one target for Fourball");
  assert.equal(canScoreStrokesFor(fourball, "cam", ["cam"]), false, "cannot score your own strokes");

  const singles: LiveMatchBox = { ...fourball, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["cade"] };
  assert.equal(canScoreStrokesFor(singles, "cam", ["cade"]), true);
  assert.equal(canScoreStrokesFor(singles, "cade", ["cam"]), true);
});

test("canScoreStrokesFor requires the whole opposing side for Foursome", () => {
  const snapshot = seedSnapshot();
  const foursome = box(1, 1, ["cam", "drew"], ["cade", "collin"], "Foursome");
  assert.equal(canScoreStrokesFor(foursome, "cam", ["cade", "collin"]), true);
  assert.equal(canScoreStrokesFor(foursome, "drew", ["cade", "collin"]), true, "either player on your side can enter the opposing side's shared score");
  assert.equal(canScoreStrokesFor(foursome, "cade", ["cam", "drew"]), true);
  assert.equal(canScoreStrokesFor(foursome, "cam", ["cade"]), false, "must name the whole opposing side, not one player");
  assert.equal(canScoreStrokesFor(foursome, "cam", ["cam", "drew"]), false, "cannot score your own side");
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- lib/live/orchestration.test.ts`
Expected: FAIL (`canScoreStrokesFor` doesn't exist yet; the Foursome test's assertions don't match the current stub's always-zero output).

- [ ] **Step 3: Update `orchestration.ts`**

Remove the two `Foursome` early-return stubs — the existing generic logic is already correct for Foursome once both players on a side always hold the same value (guaranteed by Task 6's write path, which writes one score to every target slug in a single call):

```typescript
// was:
// export function holeComplete(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox, hole: number): boolean {
//   if ((matchBox.format as string) === "Foursome") return false;
//   const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];
//   ...
export function holeComplete(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox, hole: number): boolean {
  const players = [...matchBox.maroonPlayers, ...matchBox.whitePlayers];
  return players.every((player) => {
    const score = readScore(snapshot, player, matchBox.round, hole);
    return score.score !== null && score.score > 0;
  });
}
```

```typescript
// was:
// export function matchBoxResult(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): MatchBoxResult {
//   if ((matchBox.format as string) === "Foursome") {
//     return { maroonPts: 0, whitePts: 0, leader: "tie", margin: 0, holesRemaining: 18 };
//   }
//
//   const round = matchBox.round;
export function matchBoxResult(snapshot: LiveTournamentSnapshot, matchBox: LiveMatchBox): MatchBoxResult {
  const round = matchBox.round;
  // (everything else in this function is unchanged — maroonBest/whiteBest's
  // Math.min already reduces to "the one shared value" for Foursome, since
  // both of a side's players hold the same score by construction)
```

Add `canScoreStrokesFor` (place it near `validateMatchBox`, the other authorization-shaped function):

```typescript
/**
 * Whether `scorerSlug` is allowed to enter `targetSlugs`' shared stroke
 * count for a hole in this match box. Fourball/Singles: `scorerSlug` and
 * the sole entry in `targetSlugs` must be the direct opposing pair at the
 * same box position (maroonPlayers[i] <-> whitePlayers[i] — Tiger already
 * sets this just by the order players are picked in Matchups). Foursome:
 * `targetSlugs` must be exactly the whole opposing side (either player on
 * your side may enter it, since it's one shared real-world number).
 */
export function canScoreStrokesFor(
  matchBox: Pick<LiveMatchBox, "format" | "maroonPlayers" | "whitePlayers">,
  scorerSlug: string,
  targetSlugs: string[]
): boolean {
  const onMaroon = matchBox.maroonPlayers.includes(scorerSlug);
  const onWhite = matchBox.whitePlayers.includes(scorerSlug);
  if (!onMaroon && !onWhite) return false;

  const opposingSide = onMaroon ? matchBox.whitePlayers : matchBox.maroonPlayers;

  if (matchBox.format === "Foursome") {
    return targetSlugs.length === opposingSide.length && opposingSide.every((slug) => targetSlugs.includes(slug));
  }

  const ownSide = onMaroon ? matchBox.maroonPlayers : matchBox.whitePlayers;
  const position = ownSide.indexOf(scorerSlug);
  const expectedTarget = opposingSide[position];
  return targetSlugs.length === 1 && targetSlugs[0] === expectedTarget;
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npm test -- lib/live/orchestration.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/live/orchestration.ts lib/live/orchestration.test.ts
git commit -m "feat(scoring): real Foursome match math, add canScoreStrokesFor"
```

---

### Task 3: Individual stats exclude Foursome rounds

**Files:**
- Modify: `lib/live/scoring.ts`
- Modify: `lib/live/scoring.test.ts`

**Interfaces:**
- Consumes: `LiveMatchBox`, `LiveTournamentSnapshot` (existing).
- Produces (consumed by nothing in this plan directly — feeds the future individual leaderboard/career-stats aggregation): `summarizePlayer` no longer counts a Foursome round's holes toward personal stats.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/live/scoring.test.ts
// This file's seedSnapshot() only registers "cade" and "cam" — use those
// two (Singles is a natural fit, 1 player per side) rather than inventing
// unregistered names; summarizePlayer() only inspects the one player
// passed in, so the box's roster doesn't need to be exhaustively valid.
test("summarizePlayer excludes Foursome rounds from individual stats", () => {
  const snapshot = seedSnapshot();
  snapshot.matchBoxes = [
    { id: null, round: 1, boxNumber: 1, format: "Singles", teeTime: new Date(), maroonPlayers: ["cade"], whitePlayers: ["cam"], state: "Scheduled", started: false },
    { id: null, round: 2, boxNumber: 1, format: "Foursome", teeTime: new Date(), maroonPlayers: ["cade"], whitePlayers: ["cam"], state: "Scheduled", started: false },
  ];
  updateScore(snapshot, "cade", 1, 1, 4, 1, true, true); // Singles round — counts
  updateScore(snapshot, "cade", 2, 1, 5, 2, true, true); // Foursome round — excluded

  const summary = summarizePlayer(snapshot, "cade");
  assert.equal(summary.played, 1, "only the Singles-round hole counts");
  assert.equal(summary.gross, 4);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/live/scoring.test.ts`
Expected: FAIL (`summary.played` is 2, not 1 — the Foursome hole isn't excluded yet).

- [ ] **Step 3: Update `scoring.ts`**

```typescript
// lib/live/scoring.ts
// Add near the top, alongside the other small helpers:

/**
 * Alt-shot (Foursome) rounds have one shared score per side, not a real
 * personal gross score — they count fully toward the team match result
 * (lib/live/orchestration.ts) but never toward an individual player's own
 * stats. Derives the round's format from its match boxes rather than
 * adding a new field to LiveTournamentSnapshot — a box's format always
 * equals its round's format (the plan's own long-standing invariant).
 */
function isIndividualStatsExcluded(snapshot: LiveTournamentSnapshot, round: number): boolean {
  return snapshot.matchBoxes.find((box) => box.round === round)?.format === "Foursome";
}
```

In `summarizePlayer`, add the exclusion to the existing `played` filter:

```typescript
// was:
//   for (const score of snapshot.scores.values()) {
//     if (score.player !== player) continue;
//     if (score.score === null || score.score <= 0) continue;
//     if (roundFilter && !roundFilter.has(score.round)) continue;
//     played.push(score);
//   }
  for (const score of snapshot.scores.values()) {
    if (score.player !== player) continue;
    if (score.score === null || score.score <= 0) continue;
    if (roundFilter && !roundFilter.has(score.round)) continue;
    if (isIndividualStatsExcluded(snapshot, score.round)) continue;
    played.push(score);
  }
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npm test -- lib/live/scoring.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/live/scoring.ts lib/live/scoring.test.ts
git commit -m "feat(scoring): exclude Foursome rounds from individual stats"
```

---

### Task 4: Start Round Route Handler

**Files:**
- Create: `app/api/portal/tiger/rounds/start/route.ts`
- Test: `app/api/portal/tiger/rounds/start/route.test.ts`

**Interfaces:**
- Consumes: `requireHost` (`lib/portal/requireHost.ts`).
- Produces (consumed by Task 8's UI): `POST /api/portal/tiger/rounds/start` with `{ round: number }` → `{ ok: true } | { ok: false, error: string }` — sets `live_round_state.started = true` for a round that has both locks and isn't already started; rejects otherwise with a clear error.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/portal/tiger/rounds/start/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/rounds/start rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/rounds/start", {
    method: "POST",
    body: JSON.stringify({ round: 1 }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app/api/portal/tiger/rounds/start/route.test.ts`
Expected: FAIL (`Cannot find module './route.ts'`)

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/portal/tiger/rounds/start/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round } = await request.json();
  if (typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: current } = await service.from("live_round_state").select("course_locked, matchups_locked, started").eq("round", round).single();
  if (!current) {
    return NextResponse.json({ ok: false, error: "Round not found." }, { status: 404 });
  }
  if (!current.course_locked || !current.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Lock both Courses & Format and Matchups before starting this round." }, { status: 400 });
  }
  if (current.started) {
    return NextResponse.json({ ok: false, error: "This round has already started." }, { status: 400 });
  }

  const { error } = await service.from("live_round_state").update({ started: true }).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not start that round." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- app/api/portal/tiger/rounds/start/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/rounds/start
git commit -m "feat(scoring): add Start Round Route Handler"
```

---

### Task 5: Scoring state Route Handler (player)

**Files:**
- Create: `app/api/portal/scoring/state/route.ts`
- Test: `app/api/portal/scoring/state/route.test.ts`

**Interfaces:**
- Consumes: `requirePlayer` (`lib/portal/requirePlayer.ts`).
- Produces (consumed by Task 9's `ScoringPanel`): `GET /api/portal/scoring/state?round=N` → `{ ok: true, matchBox: { id, boxNumber, format, teeTime, maroonPlayers, whitePlayers }, scores: { player, hole, score, putts, fir, gir }[], submittedPlayers: string[] } | { ok: false, error: string }`. 404s (as `{ ok: false }`) if the caller has no match box in that round.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/portal/scoring/state/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /api/portal/scoring/state rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/scoring/state?round=1");
  await assert.rejects(() => GET(request));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app/api/portal/scoring/state/route.test.ts`
Expected: FAIL (`Cannot find module './route.ts'`)

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/portal/scoring/state/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
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

  const service = createSupabaseServiceRoleClient();

  const { data: boxRows } = await service
    .from("live_match_boxes")
    .select("id, box_number, format, tee_time, maroon_players, white_players, state, started")
    .eq("round", round);
  const box = (boxRows as MatchBoxRow[] | null ?? []).find(
    (b) => b.maroon_players.includes(player.playerSlug) || b.white_players.includes(player.playerSlug)
  );
  if (!box) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
  }

  const allPlayers = [...box.maroon_players, ...box.white_players];
  const [{ data: scoreRows }, { data: submissionRows }] = await Promise.all([
    service.from("live_hole_scores").select("player_slug, hole, score, putts, fir, gir").eq("round", round).in("player_slug", allPlayers),
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
      })),
      submittedPlayers: (submissionRows ?? []).map((r) => r.player_slug as string),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- app/api/portal/scoring/state/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/scoring/state
git commit -m "feat(scoring): add scoring state Route Handler"
```

---

### Task 6: Score-writing Route Handlers (stroke + stats)

**Files:**
- Create: `app/api/portal/scoring/stroke/route.ts`
- Create: `app/api/portal/scoring/stats/route.ts`
- Test: `app/api/portal/scoring/stroke/route.test.ts`
- Test: `app/api/portal/scoring/stats/route.test.ts`

**Interfaces:**
- Consumes: `requirePlayer`, `canScoreStrokesFor` (Task 2's `lib/live/orchestration.ts`).
- Produces (consumed by Task 9's `ScoringPanel`):
  - `POST /api/portal/scoring/stroke` with `{ round: number, hole: number, targetPlayerSlugs: string[], score: number }` → `{ ok: true } | { ok: false, error: string }` — writes the same `score` into every named target's `live_hole_scores` row for that round/hole, without touching their existing putts/fir/gir.
  - `POST /api/portal/scoring/stats` with `{ round: number, hole: number, putts: number, fir: boolean | null, gir: boolean }` → `{ ok: true } | { ok: false, error: string }` — writes the caller's own putts/fir/gir for that round/hole, without touching their existing score. `fir` is forced to `null` server-side on a par-3 hole regardless of what's sent, matching `lib/live/scoring.ts`'s existing `updateScore()` convention.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/portal/scoring/stroke/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/scoring/stroke rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/scoring/stroke", {
    method: "POST",
    body: JSON.stringify({ round: 1, hole: 1, targetPlayerSlugs: ["cade-barone"], score: 4 }),
  });
  await assert.rejects(() => POST(request));
});
```

```typescript
// app/api/portal/scoring/stats/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/scoring/stats rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/scoring/stats", {
    method: "POST",
    body: JSON.stringify({ round: 1, hole: 1, putts: 2, fir: true, gir: true }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- app/api/portal/scoring/stroke app/api/portal/scoring/stats`
Expected: FAIL (modules don't exist)

- [ ] **Step 3: Write `app/api/portal/scoring/stroke/route.ts`**

```typescript
// app/api/portal/scoring/stroke/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
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

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, hole, targetPlayerSlugs, score } = await request.json();
  if (
    typeof round !== "number" ||
    typeof hole !== "number" ||
    hole < 1 ||
    hole > 18 ||
    !Array.isArray(targetPlayerSlugs) ||
    targetPlayerSlugs.some((s: unknown) => typeof s !== "string") ||
    typeof score !== "number" ||
    score < 1
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: boxRow } = await service
    .from("live_match_boxes")
    .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
    .eq("round", round);
  const box = (boxRow as MatchBoxRow[] | null ?? [])
    .map(rowToMatchBox)
    .find((b) => b.maroonPlayers.includes(player.playerSlug) || b.whitePlayers.includes(player.playerSlug));
  if (!box || !box.id) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
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
    const { data: existingRow } = await service.from("live_hole_scores").select("id").eq("player_slug", target).eq("round", round).eq("hole", hole).maybeSingle();
    if (existingRow) {
      const { error } = await service.from("live_hole_scores").update({ score }).eq("id", existingRow.id);
      if (error) return NextResponse.json({ ok: false, error: "Could not save that score." }, { status: 500 });
    } else {
      const { error } = await service.from("live_hole_scores").insert({ player_slug: target, round, hole, score });
      if (error) return NextResponse.json({ ok: false, error: "Could not save that score." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write `app/api/portal/scoring/stats/route.ts`**

```typescript
// app/api/portal/scoring/stats/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

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

  const { round, hole, putts, fir, gir } = await request.json();
  if (
    typeof round !== "number" ||
    typeof hole !== "number" ||
    hole < 1 ||
    hole > 18 ||
    typeof putts !== "number" ||
    putts < 0 ||
    (fir !== null && typeof fir !== "boolean") ||
    typeof gir !== "boolean"
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: boxRows } = await service.from("live_match_boxes").select("id, maroon_players, white_players").eq("round", round);
  const box = (boxRows as MatchBoxRow[] | null ?? []).find(
    (b) => b.maroon_players.includes(player.playerSlug) || b.white_players.includes(player.playerSlug)
  );
  if (!box) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
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

  const { data: roundRow } = await service.from("live_round_state").select("course_id").eq("round", round).single();
  let isPar3 = false;
  if (roundRow?.course_id) {
    const { data: course } = await service.from("live_courses").select("holes").eq("id", roundRow.course_id).single();
    const holeInfo = (course?.holes as { number: number; par: number }[] | undefined)?.find((h) => h.number === hole);
    isPar3 = holeInfo?.par === 3;
  }
  const normalizedFir = isPar3 ? null : fir;

  const { data: existingRow } = await service
    .from("live_hole_scores")
    .select("id")
    .eq("player_slug", player.playerSlug)
    .eq("round", round)
    .eq("hole", hole)
    .maybeSingle();
  if (existingRow) {
    const { error } = await service.from("live_hole_scores").update({ putts, fir: normalizedFir, gir }).eq("id", existingRow.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 500 });
  } else {
    const { error } = await service.from("live_hole_scores").insert({ player_slug: player.playerSlug, round, hole, putts, fir: normalizedFir, gir });
    if (error) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run to verify tests pass**

Run: `npm test -- app/api/portal/scoring/stroke app/api/portal/scoring/stats`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/portal/scoring/stroke app/api/portal/scoring/stats
git commit -m "feat(scoring): add stroke and stats Route Handlers"
```

---

### Task 7: Submit Route Handler

**Files:**
- Create: `app/api/portal/scoring/submit/route.ts`
- Test: `app/api/portal/scoring/submit/route.test.ts`

**Interfaces:**
- Consumes: `requirePlayer`, `canScoreStrokesFor` (Task 2).
- Produces (consumed by Task 9's `ScoringPanel`): `POST /api/portal/scoring/submit` with `{ round: number }` → `{ ok: true } | { ok: false, error: string }` — validates every hole (1-18) of the caller's own responsibility is filled in, then inserts a `live_match_box_submissions` row. Rejects if already submitted, or if anything's incomplete.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/portal/scoring/submit/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/scoring/submit rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/scoring/submit", {
    method: "POST",
    body: JSON.stringify({ round: 1 }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app/api/portal/scoring/submit/route.test.ts`
Expected: FAIL (`Cannot find module './route.ts'`)

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/portal/scoring/submit/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
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

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round } = await request.json();
  if (typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: boxRows } = await service
    .from("live_match_boxes")
    .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
    .eq("round", round);
  const box = (boxRows as MatchBoxRow[] | null ?? [])
    .map(rowToMatchBox)
    .find((b) => b.maroonPlayers.includes(player.playerSlug) || b.whitePlayers.includes(player.playerSlug));
  if (!box || !box.id) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
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

  // Figure out exactly which players' strokes this caller is responsible
  // for, by asking canScoreStrokesFor about every plausible target set —
  // simplest correct way to invert "who can I score" into "who must I score"
  // without duplicating the format-specific pairing rule a second time.
  const everyone = [...box.maroonPlayers, ...box.whitePlayers];
  const responsibleFor = everyone.filter((candidate) => canScoreStrokesFor(box, player.playerSlug, [candidate]))
    .concat(canScoreStrokesFor(box, player.playerSlug, box.maroonPlayers) ? box.maroonPlayers : [])
    .concat(canScoreStrokesFor(box, player.playerSlug, box.whitePlayers) ? box.whitePlayers : []);
  const uniqueResponsibleFor = [...new Set(responsibleFor)];

  const { data: scoreRows } = await service
    .from("live_hole_scores")
    .select("player_slug, hole, score, putts, fir, gir")
    .eq("round", round)
    .in("player_slug", everyone);
  const rows = scoreRows ?? [];

  const { data: roundRow } = await service.from("live_round_state").select("course_id").eq("round", round).single();
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
    const ownRow = rows.find((r) => r.player_slug === player.playerSlug && r.hole === hole);
    const isPar3 = holes.find((h) => h.number === hole)?.par === 3;
    if (!ownRow || ownRow.putts === null || ownRow.gir === null || (!isPar3 && ownRow.fir === null)) {
      return NextResponse.json({ ok: false, error: `Finish entering your own stats for all 18 holes before submitting (missing hole ${hole}).` }, { status: 400 });
    }
  }

  const { error } = await service.from("live_match_box_submissions").insert({ match_box_id: box.id, player_slug: player.playerSlug });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not submit your scores." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- app/api/portal/scoring/submit/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/scoring/submit
git commit -m "feat(scoring): add Submit Scores Route Handler"
```

---

### Task 8: Start Round banner on the Tiger Center landing page

**Files:**
- Modify: `app/portal/admin/page.tsx`
- Create: `components/portal/tiger/StartRoundBanner.tsx`

**Interfaces:**
- Consumes: Task 4's `POST /api/portal/tiger/rounds/start`.
- Produces: nothing downstream in this plan — this is Tiger's side of the trigger; Task 9's `ScoringPanel` is what players see once it's used.

- [ ] **Step 1: Write `components/portal/tiger/StartRoundBanner.tsx`**

```typescript
// components/portal/tiger/StartRoundBanner.tsx
"use client";

import { useState } from "react";

export interface StartableRound {
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
        body: JSON.stringify({ round: round.round }),
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

- [ ] **Step 2: Wire it into `app/portal/admin/page.tsx`**

Read the current file first (its exact content may have shifted since other work landed on `main` — the Global Constraints note at the top of this plan applies here specifically). Add a query for the lowest-numbered round that's fully locked and not yet started, and render the banner above `<TigerCenterNav />` when one exists:

```typescript
// app/portal/admin/page.tsx
// Add alongside the existing imports:
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { StartRoundBanner, type StartableRound } from "@/components/portal/tiger/StartRoundBanner";

// Inside TigerCenterPage, after the existing auth guard, before the return:
const service = createSupabaseServiceRoleClient();
const [{ data: roundRows }, { data: courseRows }] = await Promise.all([
  service.from("live_round_state").select("round, date, format, course_id, course_locked, matchups_locked, started").order("round"),
  service.from("live_courses").select("id, name"),
]);
const courseNameById = new Map((courseRows ?? []).map((c) => [c.id, c.name as string]));
const nextRound = (roundRows ?? []).find((r) => r.course_locked && r.matchups_locked && !r.started);
const startable: StartableRound | null = nextRound
  ? { round: nextRound.round, format: nextRound.format ?? "", courseName: nextRound.course_id ? courseNameById.get(nextRound.course_id) ?? null : null, date: nextRound.date }
  : null;
```

Render it: find the existing `<div className="mt-6"><TigerCenterNav /></div>` block and add the banner directly above it:

```tsx
{startable && <StartRoundBanner round={startable} />}
<div className="mt-6">
  <TigerCenterNav />
</div>
```

- [ ] **Step 3: Manual walkthrough**

Run `npm run dev`, log in as Tiger. With a round that has both Courses & Format and Matchups locked (built in the prior two phases) and not yet started, visit `/portal/admin` — confirm the banner shows the right round/course/format, and clicking **Start Round** succeeds and the banner disappears after reload (since the round is now `started`). Confirm no banner shows when no round qualifies, and confirm starting a round that's missing a lock is rejected with a clear error (test this by calling the route directly, since the UI only offers the button when a round already qualifies).

- [ ] **Step 4: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add app/portal/admin/page.tsx components/portal/tiger/StartRoundBanner.tsx
git commit -m "feat(scoring): add the Start Round banner to the Tiger Center"
```

---

### Task 9: The scoring screen — browser Supabase client, live updates, hole-by-hole entry

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `components/portal/ScoringPanel.tsx`
- Create: `app/portal/scoring/play/page.tsx`
- Modify: `components/portal/ScoringStatusScreen.tsx` (make the "Scorecard" box a real link when live)

**Interfaces:**
- Consumes: every route from Tasks 4-7, `canScoreStrokesFor` (Task 2's `lib/live/orchestration.ts`), `getPlayerProfileBySlug`/`playerProfiles` (`lib/data/players`), `findCurrentRoundForPlayer` (already-shipped `lib/live/currentRoundForPlayer.ts`).
- Produces: nothing downstream in this plan — this is the last task.

- [ ] **Step 1: Write `lib/supabase/client.ts`**

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

/**
 * The first browser-side Supabase client this codebase has needed — every
 * prior screen ran entirely through server-side cookie sessions
 * (lib/supabase/server.ts) plus fetch calls to our own Route Handlers.
 * Used only for read-only Realtime subscriptions (Postgres Changes) on
 * this scoring screen; every actual write still goes through a Route
 * Handler. Safe to expose NEXT_PUBLIC_SUPABASE_ANON_KEY to the browser —
 * every table this subscribes to (live_hole_scores,
 * live_match_box_submissions) has a public-read RLS policy and no write
 * policy at all, so this key cannot write anything.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
```

- [ ] **Step 2: Write `app/portal/scoring/play/page.tsx`**

```typescript
// app/portal/scoring/play/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug, playerProfiles } from "@/lib/data/players";
import { findCurrentRoundForPlayer } from "@/lib/live/currentRoundForPlayer";
import { ScoringPanel } from "@/components/portal/ScoringPanel";

export default async function ScoringPlayPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host, player_slug").eq("id", user.id).single();
  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");
  if (profile.is_host) redirect("/portal/admin");

  const playerSlug = profile.player_slug!;
  const result = await findCurrentRoundForPlayer(playerSlug);
  if (!result || result.state !== "Live") redirect("/portal/scoring");

  const nameBySlug = new Map(playerProfiles.map((p) => [p.slug, p.fullName]));

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-7">
      <ScoringPanel
        playerSlug={playerSlug}
        playerFullName={getPlayerProfileBySlug(playerSlug)?.fullName ?? playerSlug}
        round={result.round.round}
        matchBox={{
          id: result.matchBox.id!,
          format: result.matchBox.format,
          maroonPlayers: result.matchBox.maroonPlayers,
          whitePlayers: result.matchBox.whitePlayers,
        }}
        nameBySlug={Object.fromEntries(nameBySlug)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Write `components/portal/ScoringPanel.tsx`**

```typescript
// components/portal/ScoringPanel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { canScoreStrokesFor } from "@/lib/live/orchestration";
import type { LiveMatchBox, MatchFormat } from "@/lib/live/types";

interface HoleScore {
  player: string;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
}

interface ScoringState {
  matchBox: { id: string; boxNumber: number; format: MatchFormat; teeTime: string; maroonPlayers: string[]; whitePlayers: string[]; state: string };
  scores: HoleScore[];
  submittedPlayers: string[];
}

export function ScoringPanel({
  playerSlug,
  playerFullName,
  round,
  matchBox,
  nameBySlug,
}: {
  playerSlug: string;
  playerFullName: string;
  round: number;
  matchBox: Pick<LiveMatchBox, "id" | "format" | "maroonPlayers" | "whitePlayers">;
  nameBySlug: Record<string, string>;
}) {
  const [state, setState] = useState<ScoringState | null>(null);
  const [selectedHole, setSelectedHole] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/portal/scoring/state?round=${round}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setState(data);
  }, [round]);

  useEffect(() => {
    load();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`scoring-round-${round}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_hole_scores", filter: `round=eq.${round}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_match_box_submissions", filter: `match_box_id=eq.${matchBox.id}` }, load)
      .subscribe();

    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
    };
  }, [round, matchBox.id, load]);

  if (!state) return <p className="font-sans text-sm text-ink-400">Loading…</p>;

  const alreadySubmitted = state.submittedPlayers.includes(playerSlug);
  const scoreFor = (player: string, hole: number) => state.scores.find((s) => s.player === player && s.hole === hole) ?? null;

  async function submitStroke(targetPlayerSlugs: string[], score: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/scoring/stroke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, hole: selectedHole, targetPlayerSlugs, score }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error);
      else load();
    } finally {
      setBusy(false);
    }
  }

  async function submitStats(putts: number, fir: boolean | null, gir: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/scoring/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, hole: selectedHole, putts, fir, gir }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error);
      else load();
    } finally {
      setBusy(false);
    }
  }

  async function submitScores() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/scoring/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setConfirmingSubmit(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  const isFoursome = matchBox.format === "Foursome";
  const displayPlayers = isFoursome ? [] : [...matchBox.maroonPlayers, ...matchBox.whitePlayers];

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold text-ink-900">Round {round} — Hole {selectedHole}</h1>
      <p className="mt-1 font-sans text-sm text-ink-500">Welcome, {playerFullName}</p>

      <div className="mt-4 flex flex-wrap gap-1">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
          <button
            key={hole}
            type="button"
            onClick={() => setSelectedHole(hole)}
            className={[
              "h-8 w-8 rounded-sm font-condensed text-xs font-bold",
              hole === selectedHole ? "bg-maroon-700 text-white" : "bg-stone-100 text-ink-700",
            ].join(" ")}
          >
            {hole}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      {isFoursome ? (
        <div className="mt-4 space-y-3">
          {(["maroon", "white"] as const).map((side) => {
            const sidePlayers = side === "maroon" ? matchBox.maroonPlayers : matchBox.whitePlayers;
            const canScore = !alreadySubmitted && canScoreStrokesFor(matchBox, playerSlug, sidePlayers);
            const existing = scoreFor(sidePlayers[0], selectedHole);
            return (
              <div key={side} className="rounded-lg border-2 border-stone-300 p-3">
                <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">
                  {side === "maroon" ? "Maroon" : "White"} side ({sidePlayers.map((p) => nameBySlug[p] ?? p).join(" & ")})
                </span>
                <div className="mt-2">
                  <input
                    type="number"
                    min={1}
                    disabled={!canScore || busy}
                    defaultValue={existing?.score ?? ""}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (value >= 1) submitStroke(sidePlayers, value);
                    }}
                    className="w-20 rounded-lg border-2 border-stone-300 px-2 py-1 text-sm"
                    placeholder="Score"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {displayPlayers.map((slug) => {
            const existing = scoreFor(slug, selectedHole);
            const isSelf = slug === playerSlug;
            const canScoreThis = !alreadySubmitted && canScoreStrokesFor(matchBox, playerSlug, [slug]);
            return (
              <div key={slug} className="rounded-lg border-2 border-stone-300 p-3">
                <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">{nameBySlug[slug] ?? slug}</span>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1 font-sans text-xs text-ink-700">
                    Score
                    <input
                      type="number"
                      min={1}
                      disabled={!canScoreThis || busy}
                      defaultValue={existing?.score ?? ""}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value >= 1) submitStroke([slug], value);
                      }}
                      className="w-16 rounded-lg border-2 border-stone-300 px-2 py-1 text-sm"
                    />
                  </label>
                  {isSelf && (
                    <>
                      <label className="flex items-center gap-1 font-sans text-xs text-ink-700">
                        Putts
                        <input
                          type="number"
                          min={0}
                          disabled={alreadySubmitted || busy}
                          defaultValue={existing?.putts ?? ""}
                          onBlur={(e) => {
                            const value = Number(e.target.value);
                            submitStats(value, existing?.fir ?? null, existing?.gir ?? false);
                          }}
                          className="w-16 rounded-lg border-2 border-stone-300 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-1 font-sans text-xs text-ink-700">
                        <input
                          type="checkbox"
                          disabled={alreadySubmitted || busy}
                          defaultChecked={existing?.fir ?? false}
                          onChange={(e) => submitStats(existing?.putts ?? 0, e.target.checked, existing?.gir ?? false)}
                        />
                        FIR
                      </label>
                      <label className="flex items-center gap-1 font-sans text-xs text-ink-700">
                        <input
                          type="checkbox"
                          disabled={alreadySubmitted || busy}
                          defaultChecked={existing?.gir ?? false}
                          onChange={(e) => submitStats(existing?.putts ?? 0, existing?.fir ?? null, e.target.checked)}
                        />
                        GIR
                      </label>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 border-t border-stone-200 pt-4">
        {alreadySubmitted ? (
          <p className="font-sans text-sm text-ink-500">You've submitted your scores for this round.</p>
        ) : confirmingSubmit ? (
          <div className="rounded-lg bg-red-50 p-3">
            <p className="font-sans text-sm text-red-700">Submit your scores? You can't edit after this.</p>
            <div className="mt-2 flex gap-3">
              <button type="button" disabled={busy} onClick={submitScores} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-700 underline">
                Yes, submit
              </button>
              <button type="button" onClick={() => setConfirmingSubmit(false)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingSubmit(true)}
            className="rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-white"
          >
            Submit Scores
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the "Scorecard" box into a real link**

Read `components/portal/ScoringStatusScreen.tsx`'s current content first (check it against what this plan assumes — it may have shifted). Change the Scorecard `<div>` in the `live` branch to a real link:

```tsx
// was (the div rendered unconditionally, non-interactive, for both live and non-live states):
//       <div
//         className={[...]}
//       >
//         <span className={[...]}>Scorecard</span>
//       </div>
// now: keep the exact same div/span markup and classes for the NOT-live case
// (still just a visual placeholder), but when live, render it as a Link:
import Link from "next/link";
// ...
{live ? (
  <Link
    href="/portal/scoring/play"
    className="mt-4 flex h-16 w-40 items-center justify-center rounded-md border-2 border-cream-50 bg-cream-50"
  >
    <span className="font-condensed text-sm font-bold uppercase tracking-wide text-maroon-700">Scorecard</span>
  </Link>
) : (
  <div className="mt-4 flex h-16 w-40 items-center justify-center rounded-md border-2 border-cream-50/40">
    <span className="font-condensed text-sm font-bold uppercase tracking-wide text-cream-50">Scorecard</span>
  </div>
)}
```

Update the doc comment at the top of the file (it currently says "tapping the Scorecard box does nothing for now") to reflect that it now links to `/portal/scoring/play` once live.

- [ ] **Step 5: Manual walkthrough**

Run `npm run dev`. This screen needs a genuinely live, started round with real match box data to test end to end, which needs the operator's Supabase project seeded accordingly — note in your report that a full click-through (two real player logins scoring each other live) is a manual step for the operator, the same limitation every prior phase's UI tasks documented. What you can verify directly: `npx tsc --noEmit` passes with the new component's prop types, `/portal/scoring/play` redirects to `/portal/scoring` when there's no Live round for the signed-in test account, and the "Scorecard" box's two variants (Link vs. plain div) render with no console errors in the dev server for a stubbed non-live state.

- [ ] **Step 6: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add lib/supabase/client.ts components/portal/ScoringPanel.tsx app/portal/scoring/play components/portal/ScoringStatusScreen.tsx
git commit -m "feat(scoring): add the live scoring screen, wire it to the Scorecard box"
```

---

## Definition of done for this phase

- Tiger can start any round that has both Courses & Format and Matchups locked, from a banner on the Tiger Center landing page.
- Each match box's players can enter each other's official strokes (position-paired for Fourball/Singles, whole-opposing-side for Foursome's one shared score) and their own putts/fairway/green hit, hole by hole, watching the match box update live via Supabase Realtime.
- Foursome rounds compute a real match-play result (previously a stub returning zero) and are excluded from individual player stats (previously not excluded at all).
- A player can Submit Scores once everything they're responsible for is filled in, after which they can't edit any of it — enforced server-side, not just hidden in the UI.
- The previously-inert "Scorecard" box on `/portal/scoring` now leads to a real, working scoring screen once a round is Live.
- `npm test && npx tsc --noEmit && npm run lint && npm run build` all clean.
- **Not built in this phase** (separate, later sub-phases per the spec): Tiger's Edit Scores official review/settlement/wager payout, and the public Website/leaderboard reading from any of this live data.
