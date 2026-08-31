# Tiger Center Scorecards & Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Tiger a new Tiger Center screen — "Scorecards & Video" — where he can open any player's scorecard for any played year (2024/2025/2026), correct any hole's score/putts/fairway/green, and attach a shot video to any hole's shot, with those changes immediately visible on the real public site (the same scorecard page fans and players already see).

**Architecture:** Moves the three played years' hole-by-hole scorecards out of hardcoded TypeScript files (`lib/data/scorecards-2025.ts`, `scorecards-2026.ts`, and the inline `2026-palm-springs.ts`/`2025-danzante.ts` assignments) into three new Supabase tables, migrated once from today's static data. A new async data-access layer (`lib/data/archivedScorecards.ts`) reads from those tables; the two public pages that currently read `Tournament.scorecards` synchronously off the static object are updated to fetch from the database instead and merge it in — every downstream component (`PlayerScorecardView`, `StatsSection`/`tournamentStats.ts`, `IndividualLeaderboardTable`) keeps working unchanged, since they all just read whatever `.scorecards` array is already attached to the `Tournament` object they're handed. A new host-only Tiger Center screen reuses the exact same read-only scorecard table components (`CourseInfoHeader`, `ScorecardRow`, `MobileScorecardGrid`) the public bio page already uses, with a new editable layer on top (tap-to-edit score/putts/fairway/green, tap-to-upload shot video) that stages every change locally and commits it all through two Route Handlers on Save. Shot videos land in a new public-read Supabase Storage bucket, organized in folders (`{tournament_slug}/round-{n}/hole-{n}/shot-{n}.mp4`) so they're also downloadable as a real backup outside the website.

**Tech Stack:** Next.js 16 App Router (Route Handlers, Server + Client Components), TypeScript, Supabase (service-role client only — no browser Supabase client needed, this feature has no realtime/multiplayer requirement), `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-30-tiger-center-scorecards-video-design.md` (also see `docs/superpowers/specs/2026-08-29-tiger-center-operations-design.md` for how this differs from the *live* round cycle and official review, which this plan does not touch).

## A note on this repo's current state

Other work is proceeding in parallel: a `worktree-tiger-center-player-live-scoring` branch (not merged) is mid-build on a *different*, unrelated scoring screen (live, in-round entry for the upcoming tournament). This plan's files don't overlap with that branch's files at all (different route trees, different tables), but re-run `git log --oneline -5 main` before your first edit and re-read `app/portal/admin/page.tsx`, `components/portal/tiger/TigerCenterNav.tsx`, `lib/data/index.ts`, `lib/data/2025-danzante.ts`, `lib/data/2026-palm-springs.ts`, and `supabase/schema.sql` fresh rather than trusting this plan's excerpts, in case something drifted.

## Global Constraints

- Every new Route Handler is host-only: resolve identity via `lib/portal/requireHost.ts` (do not write a new inline check). All writes go through `createSupabaseServiceRoleClient()` (bypasses RLS) — this feature has no player-facing write path at all, only Tiger ever writes to these tables.
- Match existing Tiger Center code style: Tailwind utility classes matching `components/portal/tiger/MatchupsPanel.tsx`'s look (font-serif headers, font-sans body, maroon-700 accents, font-condensed uppercase small text for buttons/labels, `border-2 border-stone-300 rounded-lg` inputs).
- Follow the existing per-file convention for mapping Supabase rows to types (a local `interface FooRow` + a local mapping function in the file that queries it) rather than introducing a shared abstraction.
- No React component test framework exists in this repo — UI tasks are verified via `npx tsc --noEmit`, `npm run lint`, `npm run build`, and a manual/structural check. Only pure logic (no Supabase I/O) gets `node:test` unit tests. Route Handler tests stay limited to the auth-gate check already standard in this codebase (`rejects when requireHost resolves null`).
- Run `npm test && npx tsc --noEmit && npm run lint && npm run build` clean before considering any task done.
- A player's identity throughout this feature is their `PlayerProfile.slug` (e.g. `"cam-latto"`, from `lib/data/players`) — **not** `player_slots.player_slug`. The archived-scorecard tables deliberately have no foreign key to `player_slots`, since historical data must be enterable for a player regardless of whether they've ever claimed a site account.

---

### Task 1: Schema — archived scorecard tables and the shot-videos storage bucket

**Files:**
- Modify: `supabase/schema.sql` (append after the existing "Tiger Center: Matchups" section)

**Interfaces:**
- Produces (consumed by Task 2): `archived_scorecard_rounds(id uuid, tournament_slug text, player_slug text, round integer, course text, format text, created_at timestamptz)`, `archived_scorecard_holes(id uuid, round_id uuid, hole integer, par integer, yards integer, score integer, putts integer, fir text, gir boolean, host_edited boolean, updated_at timestamptz)`, `archived_shot_videos(id uuid, round_id uuid, hole integer, shot_number integer, storage_path text, uploaded_at timestamptz)`.
- Produces (consumed by Task 11): a public-read `shot-videos` Storage bucket.

- [ ] **Step 1: Append the migration**

```sql
-- === Tiger Center: Archived Scorecards & Shot Video ========================
-- Historical (already-played) tournaments' hole-by-hole scorecards, editable
-- by Tiger from the "Scorecards & Video" screen. Deliberately separate from
-- the live_* tables above — those track the *current/future* tournament's
-- live round cycle and have no year dimension; these are keyed by
-- tournament_slug because multiple past years coexist. player_slug here is
-- a PlayerProfile.slug (lib/data/players), NOT a player_slots foreign key —
-- historical data must be enterable for a player whether or not they've
-- ever claimed a site account.

create table if not exists archived_scorecard_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_slug text not null,
  player_slug text not null,
  round integer not null,
  course text not null,
  format text,
  created_at timestamptz not null default now(),
  unique (tournament_slug, player_slug, round)
);
create index if not exists archived_scorecard_rounds_tournament_idx on archived_scorecard_rounds (tournament_slug);

create table if not exists archived_scorecard_holes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references archived_scorecard_rounds(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  par integer not null,
  yards integer not null,
  score integer not null,
  putts integer not null,
  -- '0' | '1' | 'X' — 'X' means "not applicable" (a par-3 has no fairway),
  -- the same three-state convention lib/data/types.ts's HoleStat.fir
  -- already uses, kept as text here so that convention carries through
  -- unchanged rather than needing a translation layer on every read.
  fir text not null check (fir in ('0', '1', 'X')),
  gir boolean not null,
  -- Set whenever Tiger changes a value here from its migrated original —
  -- same convention live_hole_scores.host_edited already established.
  host_edited boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (round_id, hole)
);

create table if not exists archived_shot_videos (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references archived_scorecard_rounds(id) on delete cascade,
  hole integer not null check (hole between 1 and 18),
  shot_number integer not null check (shot_number >= 1),
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  unique (round_id, hole, shot_number)
);

alter table archived_scorecard_rounds enable row level security;
alter table archived_scorecard_holes enable row level security;
alter table archived_shot_videos enable row level security;

-- Public read (fans/players see these on the real scorecard pages), no
-- write policy at all — every write goes through a host-only Route Handler
-- using the service-role key, same pattern as every other table above.
drop policy if exists archived_scorecard_rounds_select_all on archived_scorecard_rounds;
create policy archived_scorecard_rounds_select_all on archived_scorecard_rounds for select using (true);

drop policy if exists archived_scorecard_holes_select_all on archived_scorecard_holes;
create policy archived_scorecard_holes_select_all on archived_scorecard_holes for select using (true);

drop policy if exists archived_shot_videos_select_all on archived_shot_videos;
create policy archived_shot_videos_select_all on archived_shot_videos for select using (true);

-- Storage bucket for shot video. Public-read (so a fan's browser can just
-- play the file straight from its public URL), no write policy on
-- storage.objects for this bucket — uploads go through a host-only Route
-- Handler using the service-role key, which bypasses Storage RLS the same
-- way it bypasses table RLS.
insert into storage.buckets (id, name, public)
values ('shot-videos', 'shot-videos', true)
on conflict (id) do nothing;
```

- [ ] **Step 2: Run the SQL against your Supabase project**

This step is for the operator, not the implementer — same as every prior schema task in this project. Note in your report that this step is manual (no DB credentials are configured in this environment): run the Step 1 SQL in the Supabase SQL Editor. If the `storage.buckets` insert is rejected by your project's permissions, create the bucket instead via Dashboard → Storage → New bucket, named exactly `shot-videos`, with "Public bucket" turned on. Do not attempt either yourself.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(scorecards): add archived scorecard tables and shot-videos bucket"
```

---

### Task 2: Archived scorecards data-access layer

**Files:**
- Create: `lib/data/archivedScorecards.ts`

**Interfaces:**
- Consumes: `createSupabaseServiceRoleClient` (`lib/supabase/server.ts`), `RoundScorecard`/`HoleStat`/`Team`/`Tournament` (`lib/data/types.ts`).
- Produces (consumed by Task 4's page wiring, Task 5's public video wiring, Tasks 7-9's Tiger Center pages): `getScorecardsForTournament(tournament: Pick<Tournament, "slug" | "roster">): Promise<PlayerScorecard[]>`, `getArchivedRoundLabels(tournamentSlug: string, playerSlug: string): Promise<{ round: number; course: string; format: string | null }[]>`, `getArchivedRoundScorecard(tournamentSlug: string, playerSlug: string, round: number): Promise<RoundScorecard | null>`, `getShotVideoUrls(tournamentSlug: string, playerSlug: string, round: number): Promise<Record<number, Record<number, string>>>` (hole → shot number → public URL).

No unit tests for this file — every function is a thin Supabase query, and this codebase's established convention (every existing `lib/data/*.ts`/`lib/live/*.ts` file that touches Supabase) is that DB-touching code needs a real request lifecycle to test, so it's verified manually (Task 4's walkthrough) instead.

- [ ] **Step 1: Write the file**

```typescript
// lib/data/archivedScorecards.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { HoleStat, PlayerScorecard, RoundScorecard, Team, Tournament } from "./types";
import { playerProfiles } from "./players";

interface RoundRow {
  id: string;
  player_slug: string;
  round: number;
  course: string;
  format: string | null;
}

interface HoleRow {
  round_id: string;
  hole: number;
  par: number;
  yards: number;
  score: number;
  putts: number;
  fir: string;
  gir: boolean;
}

function toHoleStat(row: HoleRow): HoleStat {
  return {
    hole: row.hole,
    par: row.par,
    yards: row.yards,
    score: row.score,
    putts: row.putts,
    fir: row.fir === "X" ? "X" : Number(row.fir),
    gir: row.gir ? 1 : 0,
    diff: row.score - row.par,
  };
}

function toRoundScorecard(round: RoundRow, holes: HoleRow[]): RoundScorecard {
  const holeStats = holes.filter((h) => h.round_id === round.id).sort((a, b) => a.hole - b.hole).map(toHoleStat);
  const played = holeStats.filter((h) => h.score > 0);
  const firApplicable = holeStats.filter((h) => h.fir !== "X");
  return {
    round: round.round,
    course: round.course,
    format: round.format ?? undefined,
    total: played.reduce((s, h) => s + h.score, 0),
    toPar: played.reduce((s, h) => s + (h.score - h.par), 0),
    putts: played.reduce((s, h) => s + h.putts, 0),
    girHit: holeStats.filter((h) => h.gir === 1).length,
    girTotal: holeStats.length,
    firHit: firApplicable.filter((h) => h.fir === 1).length,
    firTotal: firApplicable.length,
    holes: holeStats,
  };
}

function teamFor(roster: Tournament["roster"], playerId: string): Team {
  return roster.maroon.some((n) => n.toLowerCase() === playerId.toLowerCase()) ? "maroon" : "white";
}

/**
 * Every player's full scorecard for a played tournament, sourced from the
 * database — this is what gets attached as `Tournament.scorecards` at the
 * two public pages that need it (Task 4), replacing the old hardcoded
 * `scorecards2025`/`scorecards2026` file imports.
 */
export async function getScorecardsForTournament(tournament: Pick<Tournament, "slug" | "roster">): Promise<PlayerScorecard[]> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundRows } = await service
    .from("archived_scorecard_rounds")
    .select("id, player_slug, round, course, format")
    .eq("tournament_slug", tournament.slug);
  const rounds = (roundRows ?? []) as RoundRow[];
  if (rounds.length === 0) return [];

  const { data: holeRows } = await service
    .from("archived_scorecard_holes")
    .select("round_id, hole, par, yards, score, putts, fir, gir")
    .in("round_id", rounds.map((r) => r.id));
  const holes = (holeRows ?? []) as HoleRow[];

  const bySlug = new Map<string, RoundRow[]>();
  for (const round of rounds) {
    const arr = bySlug.get(round.player_slug) ?? [];
    arr.push(round);
    bySlug.set(round.player_slug, arr);
  }

  return [...bySlug.entries()].map(([slug, playerRounds]) => {
    const profile = playerProfiles.find((p) => p.slug === slug);
    const playerId = profile?.id ?? slug;
    return {
      player: playerId,
      team: teamFor(tournament.roster, playerId),
      rounds: playerRounds.sort((a, b) => a.round - b.round).map((r) => toRoundScorecard(r, holes)),
    };
  });
}

/** Round labels for the Tiger Center's player → rounds list ("Round 1 — Palmer"). */
export async function getArchivedRoundLabels(
  tournamentSlug: string,
  playerSlug: string
): Promise<{ round: number; course: string; format: string | null }[]> {
  const service = createSupabaseServiceRoleClient();
  const { data } = await service
    .from("archived_scorecard_rounds")
    .select("round, course, format")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .order("round");
  return data ?? [];
}

/** One round's full hole-by-hole scorecard — used by both the public page and the Tiger Center editor. */
export async function getArchivedRoundScorecard(tournamentSlug: string, playerSlug: string, round: number): Promise<RoundScorecard | null> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundRow } = await service
    .from("archived_scorecard_rounds")
    .select("id, player_slug, round, course, format")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (!roundRow) return null;

  const { data: holeRows } = await service
    .from("archived_scorecard_holes")
    .select("round_id, hole, par, yards, score, putts, fir, gir")
    .eq("round_id", roundRow.id);

  return toRoundScorecard(roundRow as RoundRow, (holeRows ?? []) as HoleRow[]);
}

/** hole -> shot number -> public video URL, for a round. Empty object if nothing's uploaded yet. */
export async function getShotVideoUrls(tournamentSlug: string, playerSlug: string, round: number): Promise<Record<number, Record<number, string>>> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundRow } = await service
    .from("archived_scorecard_rounds")
    .select("id")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (!roundRow) return {};

  const { data: videoRows } = await service
    .from("archived_shot_videos")
    .select("hole, shot_number, storage_path")
    .eq("round_id", roundRow.id);

  const result: Record<number, Record<number, string>> = {};
  for (const row of videoRows ?? []) {
    const { data: publicUrl } = service.storage.from("shot-videos").getPublicUrl(row.storage_path);
    result[row.hole] = result[row.hole] ?? {};
    result[row.hole][row.shot_number] = publicUrl.publicUrl;
  }
  return result;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors involving `lib/data/archivedScorecards.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/data/archivedScorecards.ts
git commit -m "feat(scorecards): add archived scorecards data-access layer"
```

---

### Task 3: One-time migration script

**Files:**
- Create: `scripts/migrate-archived-scorecards.ts`

**Interfaces:**
- Consumes: `scorecards2025` (`lib/data/scorecards-2025.ts`), `scorecards2026` (`lib/data/scorecards-2026.ts`), `playerProfiles` (`lib/data/players`), `createSupabaseServiceRoleClient`.
- Produces: populated `archived_scorecard_rounds`/`archived_scorecard_holes` rows for 2025 and 2026 (2024 has no hole-by-hole data in this codebase at all — `lib/data/2024-pinehurst.ts` never had a `scorecards` field — so there's nothing to migrate for it; Tiger will simply see an empty rounds list for any 2024 player until/unless entered by hand later, same as the public page's existing "wasn't reliably recorded" fallback already accounts for).

This script is a one-off operator tool, not app code — it's not wired into any route or build step, and isn't unit tested (it's a thin, one-time data mover; correctness is verified by the Step 3 walkthrough).

- [ ] **Step 1: Write the script**

```typescript
// scripts/migrate-archived-scorecards.ts
// Run once with: npx tsx scripts/migrate-archived-scorecards.ts
// Copies today's hardcoded 2025/2026 scorecards into the database, exactly
// as-is — this only relocates the source of truth, no values change.
// Safe to re-run: every insert is keyed by the same unique constraints the
// schema defines, so a second run just no-ops on rows already present
// rather than duplicating them (see the onConflict below).
import { createSupabaseServiceRoleClient } from "../lib/supabase/server";
import { scorecards2025 } from "../lib/data/scorecards-2025";
import { scorecards2026 } from "../lib/data/scorecards-2026";
import { playerProfiles } from "../lib/data/players";
import type { PlayerScorecard } from "../lib/data/types";

async function migrateTournament(tournamentSlug: string, scorecards: PlayerScorecard[]) {
  const service = createSupabaseServiceRoleClient();

  for (const card of scorecards) {
    const profile = playerProfiles.find((p) => p.id === card.player);
    if (!profile) {
      console.warn(`No PlayerProfile found for scorecard player "${card.player}" in ${tournamentSlug} — skipping.`);
      continue;
    }

    for (const round of card.rounds) {
      const { data: roundRow, error: roundError } = await service
        .from("archived_scorecard_rounds")
        .upsert(
          { tournament_slug: tournamentSlug, player_slug: profile.slug, round: round.round, course: round.course, format: round.format ?? null },
          { onConflict: "tournament_slug,player_slug,round" }
        )
        .select("id")
        .single();
      if (roundError || !roundRow) {
        console.error(`Failed to upsert round ${round.round} for ${profile.slug} in ${tournamentSlug}:`, roundError);
        continue;
      }

      const holeRows = round.holes.map((h) => ({
        round_id: roundRow.id,
        hole: h.hole,
        par: h.par,
        yards: h.yards,
        score: h.score,
        putts: h.putts,
        fir: String(h.fir),
        gir: h.gir === 1,
      }));
      const { error: holesError } = await service.from("archived_scorecard_holes").upsert(holeRows, { onConflict: "round_id,hole" });
      if (holesError) {
        console.error(`Failed to upsert holes for round ${round.round}, ${profile.slug}, ${tournamentSlug}:`, holesError);
      }
    }
  }
  console.log(`Done migrating ${tournamentSlug}: ${scorecards.length} players.`);
}

async function main() {
  await migrateTournament("2025-danzante", scorecards2025);
  await migrateTournament("2026-palm-springs", scorecards2026);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors involving `scripts/migrate-archived-scorecards.ts`.

- [ ] **Step 3: Run it against your Supabase project, and verify**

This step is for the operator (no DB credentials are configured in this environment): run `npx tsx scripts/migrate-archived-scorecards.ts` once, locally, with your real `.env`'s `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` pointed at production. Confirm in the Supabase Table Editor that `archived_scorecard_rounds` now has rows for every 2025 and 2026 player, and `archived_scorecard_holes` has 18 rows per round. **Do not proceed to Task 4 until this has actually been run** — Task 4 removes the old static fallback, so the public site would show empty scorecards for 2025/2026 in the gap between deploying Task 4 and this script having actually run.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-archived-scorecards.ts
git commit -m "feat(scorecards): add one-time archived scorecards migration script"
```

---

### Task 4: Switch the public read paths to the database

**Files:**
- Modify: `app/leaderboard/[slug]/page.tsx`
- Modify: `app/leaderboard/[slug]/players/[player]/page.tsx`
- Modify: `lib/data/2025-danzante.ts`
- Modify: `lib/data/2026-palm-springs.ts`

**Interfaces:**
- Consumes: `getScorecardsForTournament` (Task 2).
- Produces: nothing downstream in this plan — `IndividualLeaderboardTable`, `PlayerScorecardView`, `StatsSection`/`tournamentStats.ts`, and `PlayerBioSection` all keep reading `Tournament.scorecards` exactly as they do today; only where that array's *value* comes from changes.

**⚠️ Do not deploy this task until Task 3's migration script has actually been run against production** (its Step 3 is an explicit gate for exactly this reason).

- [ ] **Step 1: Remove the static `scorecards` field from the two tournament files**

In `lib/data/2025-danzante.ts`, remove the `import { scorecards2025 } from "./scorecards-2025";` line and the `scorecards: scorecards2025,` field from the exported tournament object. Do the same in `lib/data/2026-palm-springs.ts` for `scorecards2026`. (`lib/data/scorecards-2025.ts`/`scorecards-2026.ts` themselves stay on disk — Task 3's migration script is their only remaining reader, and deleting them outright is an explicit non-goal of the spec.)

- [ ] **Step 2: Wire the database into `app/leaderboard/[slug]/page.tsx`**

Read the file fresh first (per this plan's top note). Change:

```typescript
// was:
//   const tournament = getTournament(slug);
//   if (!tournament) notFound();
import { getScorecardsForTournament } from "@/lib/data/archivedScorecards";
// ...
const tournament = getTournament(slug);
if (!tournament) notFound();
const scorecards = await getScorecardsForTournament(tournament);
const tournamentWithScorecards = { ...tournament, scorecards };
```

Then pass `tournamentWithScorecards` (not `tournament`) into `<YearLeaderboardContent tournament={...} .../>`.

- [ ] **Step 3: Wire the database into `app/leaderboard/[slug]/players/[player]/page.tsx`**

Read the file fresh first. Change:

```typescript
// was:
//   const tournament = getTournament(slug);
//   if (!tournament) notFound();
import { getScorecardsForTournament } from "@/lib/data/archivedScorecards";
// ...
const tournament = getTournament(slug);
if (!tournament) notFound();
const scorecards = await getScorecardsForTournament(tournament);
const tournamentWithScorecards = { ...tournament, scorecards };
```

Then use `tournamentWithScorecards` everywhere the rest of the function currently uses `tournament` (the `getPlayerScorecard(tournament, entry.name)` call, `tournament.individualLeaderboard`, `tournament.editionLabel`, and the `<PlayerScorecardView tournament={...} .../>` prop) — every one of those either needs the real scorecards or is harmless to pass the merged object into.

- [ ] **Step 4: Run the full check**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 5: Manual walkthrough**

After Task 3's migration has been run against your Supabase project, run `npm run dev` and visit `/leaderboard/2026-palm-springs` and `/leaderboard/2026-palm-springs/players/cam` (or any real 2026 player). Confirm the leaderboard totals and the player's full scorecard render exactly as they did before this change (same numbers) — they're now coming from the database instead of the old hardcoded file.

- [ ] **Step 6: Commit**

```bash
git add app/leaderboard lib/data/2025-danzante.ts lib/data/2026-palm-springs.ts
git commit -m "feat(scorecards): read historical scorecards from the database"
```

---

### Task 5: Real shot video on the public scorecard page

**Files:**
- Modify: `components/scorecard/ShotVideoPanel.tsx`
- Modify: `components/scorecard/PlayerScorecardView.tsx`
- Modify: `app/leaderboard/[slug]/players/[player]/page.tsx`

**Interfaces:**
- Consumes: `getShotVideoUrls` (Task 2).
- Produces: `ShotVideoPanel` gains an optional `videoUrls?: Record<number, string>` prop (shot number → public URL) — a shot with a URL plays the real video instead of the "awaiting upload" placeholder.

- [ ] **Step 1: Add real-video support to `ShotVideoPanel`**

```typescript
// components/scorecard/ShotVideoPanel.tsx
// was: export function ShotVideoPanel({ shotCount }: { shotCount: number }) {
export function ShotVideoPanel({ shotCount, videoUrls }: { shotCount: number; videoUrls?: Record<number, string> }) {
  const shots = Array.from({ length: shotCount }, (_, i) => i + 1);
  const [currentShot, setCurrentShot] = useState(1);
  const currentUrl = videoUrls?.[currentShot];

  return (
    <div className="-mx-7 sm:mx-0">
      {currentUrl ? (
        <video key={currentUrl} controls playsInline className="aspect-video w-full bg-ink-900 sm:rounded-md" src={currentUrl} />
      ) : (
        <div className="aspect-video w-full flex flex-col items-center justify-center gap-2 bg-ink-900 text-cream-100 sm:rounded-md">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60">
            <rect x="2" y="5" width="15" height="14" rx="2" />
            <path d="M17 9l5-3v12l-5-3" />
          </svg>
          <span className="font-condensed text-xs font-semibold tracking-wide uppercase opacity-80">Shot {currentShot} · Video awaiting upload</span>
          <span className="font-sans text-[11px] text-cream-200/70 max-w-[280px] text-center">
            Once footage is uploaded, it&rsquo;ll be assigned to this shot and playable right here.
          </span>
        </div>
      )}

      <div className="flex items-center px-7 py-3 sm:px-0">
        {shots.map((shot, i) => (
          <div key={shot} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => setCurrentShot(shot)}
              className={[
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-condensed text-[11px] font-bold cursor-pointer transition-colors",
                shot <= currentShot ? "bg-maroon-700 text-white" : "bg-cream-100 text-maroon-700 border border-ink-300",
                videoUrls?.[shot] ? "ring-2 ring-offset-1 ring-maroon-700" : "",
              ].join(" ")}
            >
              {shot}
            </button>
            {i < shots.length - 1 && (
              <div className="mx-1 h-[3px] flex-1 overflow-hidden rounded-full bg-ink-200">
                <div className="h-full bg-maroon-700 transition-all duration-300" style={{ width: shot + 1 <= currentShot ? "100%" : "0%" }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

(Keep the existing top-of-file doc comment and `"use client"`/`useState` import — only the export signature and the video-vs-placeholder branch change.)

- [ ] **Step 2: Thread `shotVideos` through `PlayerScorecardView`**

```typescript
// components/scorecard/PlayerScorecardView.tsx
// was: export function PlayerScorecardView({ scorecard, tournament }: { scorecard: PlayerScorecard; tournament: Tournament }) {
export function PlayerScorecardView({
  scorecard,
  tournament,
  shotVideos,
}: {
  scorecard: PlayerScorecard;
  tournament: Tournament;
  shotVideos?: Record<number, Record<number, string>>; // round -> hole -> shot -> url
}) {
```

And where it renders `<ShotVideoPanel shotCount={holeStat.score} />`, pass the matching hole's video URLs:

```tsx
// was: <ShotVideoPanel shotCount={holeStat.score} />
<ShotVideoPanel shotCount={holeStat.score} videoUrls={shotVideos?.[active.round]?.[selectedHole]} />
```

- [ ] **Step 3: Fetch and pass shot videos from the page**

In `app/leaderboard/[slug]/players/[player]/page.tsx` (already modified in Task 4), fetch the current round's videos alongside the scorecard and pass them down:

```typescript
// Add alongside the existing import from Task 4:
import { getShotVideoUrls } from "@/lib/data/archivedScorecards";
// ...
// After `scorecard` is resolved (still inside the function, before the return):
const lastRoundNumber = scorecard?.rounds[scorecard.rounds.length - 1]?.round;
const shotVideos =
  lastRoundNumber != null && getPlayerProfile(entry.name)?.slug
    ? { [lastRoundNumber]: await getShotVideoUrls(slug, getPlayerProfile(entry.name)!.slug, lastRoundNumber) }
    : undefined;
```

Then pass `shotVideos={shotVideos}` into `<PlayerScorecardView ... />`. (This fetches only the initially-shown round's videos — switching rounds client-side in `PlayerScorecardView` without a video for that round simply shows the placeholder, same as today, until a future enhancement fetches per-round on demand; noted here rather than silently assumed, since it's a real, deliberate scope trim, not an oversight.)

- [ ] **Step 4: Run the full check**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add components/scorecard/ShotVideoPanel.tsx components/scorecard/PlayerScorecardView.tsx app/leaderboard/[slug]/players/[player]/page.tsx
git commit -m "feat(scorecards): play real shot video on the public scorecard page"
```

---

### Task 6: Tiger Center nav — add the "Scorecards & Video" box

**Files:**
- Modify: `components/portal/tiger/TigerCenterNav.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 7): a working link to `/portal/admin/scorecards`.

- [ ] **Step 1: Add the box**

```typescript
// components/portal/tiger/TigerCenterNav.tsx
const BOXES = [
  { label: "Players & Teams", href: "/portal/admin/players-teams", enabled: true },
  { label: "Courses & Format", href: "/portal/admin/courses-format", enabled: true },
  { label: "Matchups", href: "/portal/admin/matchups", enabled: true },
  { label: "Scorecards & Video", href: "/portal/admin/scorecards", enabled: true },
  { label: "Edit Scores", href: "#", enabled: false },
];
```

- [ ] **Step 2: Run the full check**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean (Task 7 makes `/portal/admin/scorecards` a real route — until then this box 404s, which is fine mid-plan but should not ship alone; land this commit together with or after Task 7 if deploying incrementally).

- [ ] **Step 3: Commit**

```bash
git add components/portal/tiger/TigerCenterNav.tsx
git commit -m "feat(scorecards): add Scorecards & Video box to the Tiger Center"
```

---

### Task 7: Tiger Center — year and player picker

**Files:**
- Create: `app/portal/admin/scorecards/page.tsx`

**Interfaces:**
- Consumes: `requireHost`, `pastTournaments`/`latestCompleted`/`playersOf` (`lib/data`), `getPlayerDisplayName`/`getPlayerProfile` (`lib/data/players`).
- Produces (consumed by Task 8): links to `/portal/admin/scorecards/{tournamentSlug}/{playerSlug}`.

No DB query needed here — which players belong to a year is already known from that year's static roster (`Tournament.roster`), same as every other part of the site that lists a tournament's players.

- [ ] **Step 1: Write the page**

```typescript
// app/portal/admin/scorecards/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pastTournaments, latestCompleted, playersOf } from "@/lib/data";
import { getPlayerDisplayName, getPlayerProfile } from "@/lib/data/players";

export default async function ScorecardsYearPickerPage({ searchParams }: { searchParams: Promise<{ tournament?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const { tournament: tournamentSlug } = await searchParams;
  const activeTournament = pastTournaments.find((t) => t.slug === tournamentSlug) ?? latestCompleted;

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">Scorecards & Video</h1>

      <div className="relative mt-4 inline-block">
        <form>
          <select
            name="tournament"
            defaultValue={activeTournament.slug}
            className="appearance-none rounded-lg border-2 border-stone-300 bg-white py-2 pl-3 pr-8 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-900"
          >
            {[...pastTournaments].reverse().map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.year}
              </option>
            ))}
          </select>
        </form>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {playersOf(activeTournament).map(({ name, team }) => {
          const slug = getPlayerProfile(name)?.slug;
          if (!slug) return null;
          return (
            <Link
              key={name}
              href={`/portal/admin/scorecards/${activeTournament.slug}/${slug}`}
              className={[
                "rounded-lg border-2 px-3 py-4 text-center font-serif text-sm font-bold transition",
                team === "maroon" ? "border-maroon-700 bg-maroon-50 text-maroon-700 hover:bg-maroon-100" : "border-ink-300 bg-white text-ink-900 hover:bg-cream-100",
              ].join(" ")}
            >
              {getPlayerDisplayName(name)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

The year `<select>` submits a plain GET form (no client JS needed) — picking a year reloads the page with `?tournament=...`, which is enough for a dropdown that just needs to change what's displayed.

- [ ] **Step 2: Run the full check**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Manual walkthrough**

Run `npm run dev`, log in as Tiger, visit `/portal/admin/scorecards`. Confirm it defaults to 2026, lists all 12 2026 players, and switching the year dropdown to 2025/2024 shows that year's roster instead.

- [ ] **Step 4: Commit**

```bash
git add app/portal/admin/scorecards/page.tsx
git commit -m "feat(scorecards): add Tiger Center year/player picker"
```

---

### Task 8: Tiger Center — a player's rounds for the year

**Files:**
- Create: `app/portal/admin/scorecards/[tournament]/[player]/page.tsx`

**Interfaces:**
- Consumes: `requireHost`, `getArchivedRoundLabels` (Task 2), `getTournament` (`lib/data`), `getPlayerProfileBySlug`/`getPlayerDisplayName` (`lib/data/players`).
- Produces (consumed by Task 9): links to `/portal/admin/scorecards/{tournamentSlug}/{playerSlug}/{round}`.

- [ ] **Step 1: Write the page**

```typescript
// app/portal/admin/scorecards/[tournament]/[player]/page.tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTournament } from "@/lib/data";
import { getArchivedRoundLabels } from "@/lib/data/archivedScorecards";
import { getPlayerProfileBySlug, getPlayerDisplayName } from "@/lib/data/players";

export default async function ScorecardsRoundPickerPage({ params }: { params: Promise<{ tournament: string; player: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const { tournament: tournamentSlug, player: playerSlug } = await params;
  const tournament = getTournament(tournamentSlug);
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  if (!tournament || !playerProfile) notFound();

  const rounds = await getArchivedRoundLabels(tournamentSlug, playerSlug);

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <Link href={`/portal/admin/scorecards?tournament=${tournamentSlug}`} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
        ← {tournament.editionLabel}
      </Link>
      <h1 className="mt-2 font-serif text-3xl font-bold text-ink-900">{getPlayerDisplayName(playerSlug)}</h1>

      {rounds.length === 0 ? (
        <p className="mt-6 font-sans text-sm text-ink-500">No rounds recorded yet for this player in {tournament.editionLabel}.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {rounds.map((r) => (
            <Link
              key={r.round}
              href={`/portal/admin/scorecards/${tournamentSlug}/${playerSlug}/${r.round}`}
              className="block rounded-lg border-2 border-stone-300 px-4 py-3 font-serif text-lg font-bold text-ink-900 hover:border-maroon-700"
            >
              Round {r.round} — {r.course}
              {r.format && <span className="ml-2 font-sans text-sm font-normal text-ink-500">({r.format})</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the full check**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Manual walkthrough**

After Task 3's migration has run, visit `/portal/admin/scorecards/2026-palm-springs/cam-latto`. Confirm it lists every round Cam played in 2026 with the right course names, and that a player with no migrated rounds (or 2024, which has none at all) shows the empty-state message instead of erroring.

- [ ] **Step 4: Commit**

```bash
git add app/portal/admin/scorecards/[tournament]/[player]
git commit -m "feat(scorecards): add Tiger Center round picker"
```

---

### Task 9: Save and video-upload Route Handlers

**Files:**
- Create: `app/api/portal/tiger/scorecards/save/route.ts`
- Create: `app/api/portal/tiger/scorecards/video/route.ts`
- Test: `app/api/portal/tiger/scorecards/save/route.test.ts`
- Test: `app/api/portal/tiger/scorecards/video/route.test.ts`

**Interfaces:**
- Consumes: `requireHost`, `createSupabaseServiceRoleClient`.
- Produces (consumed by Task 12's `ScorecardEditor`):
  - `POST /api/portal/tiger/scorecards/save` with `{ tournamentSlug: string, playerSlug: string, round: number, holes: { hole: number, score: number, putts: number, fir: "0" | "1" | "X", gir: boolean }[] }` → `{ ok: true } | { ok: false, error: string }` — updates only the named holes' score/putts/fir/gir, sets `host_edited = true` and `updated_at = now()` on each.
  - `POST /api/portal/tiger/scorecards/video` (multipart/form-data: `tournamentSlug`, `playerSlug`, `round`, `hole`, `shotNumber`, `file`) → `{ ok: true, url: string } | { ok: false, error: string }` — uploads the file to `shot-videos` at `{tournamentSlug}/round-{round}/hole-{hole}/shot-{shotNumber}.mp4` (upsert — replacing an existing shot's video is allowed) and upserts the `archived_shot_videos` row.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/portal/tiger/scorecards/save/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/scorecards/save rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/scorecards/save", {
    method: "POST",
    body: JSON.stringify({ tournamentSlug: "2026-palm-springs", playerSlug: "cam-latto", round: 1, holes: [] }),
  });
  await assert.rejects(() => POST(request));
});
```

```typescript
// app/api/portal/tiger/scorecards/video/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/scorecards/video rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/scorecards/video", { method: "POST", body: new FormData() });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- app/api/portal/tiger/scorecards/save app/api/portal/tiger/scorecards/video`
Expected: FAIL (modules don't exist)

- [ ] **Step 3: Write `app/api/portal/tiger/scorecards/save/route.ts`**

```typescript
// app/api/portal/tiger/scorecards/save/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

interface HoleEdit {
  hole: number;
  score: number;
  putts: number;
  fir: "0" | "1" | "X";
  gir: boolean;
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { tournamentSlug, playerSlug, round, holes } = await request.json();
  if (
    typeof tournamentSlug !== "string" ||
    typeof playerSlug !== "string" ||
    typeof round !== "number" ||
    !Array.isArray(holes) ||
    holes.some(
      (h: unknown): h is HoleEdit =>
        typeof h !== "object" ||
        h === null ||
        typeof (h as HoleEdit).hole !== "number" ||
        typeof (h as HoleEdit).score !== "number" ||
        typeof (h as HoleEdit).putts !== "number" ||
        !["0", "1", "X"].includes((h as HoleEdit).fir) ||
        typeof (h as HoleEdit).gir !== "boolean"
    )
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: roundRow } = await service
    .from("archived_scorecard_rounds")
    .select("id")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (!roundRow) {
    return NextResponse.json({ ok: false, error: "That round hasn't been recorded yet." }, { status: 404 });
  }

  for (const edit of holes as HoleEdit[]) {
    const { error } = await service
      .from("archived_scorecard_holes")
      .update({ score: edit.score, putts: edit.putts, fir: edit.fir, gir: edit.gir, host_edited: true, updated_at: new Date().toISOString() })
      .eq("round_id", roundRow.id)
      .eq("hole", edit.hole);
    if (error) {
      return NextResponse.json({ ok: false, error: `Could not save hole ${edit.hole}.` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write `app/api/portal/tiger/scorecards/video/route.ts`**

```typescript
// app/api/portal/tiger/scorecards/video/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const form = await request.formData();
  const tournamentSlug = form.get("tournamentSlug");
  const playerSlug = form.get("playerSlug");
  const round = Number(form.get("round"));
  const hole = Number(form.get("hole"));
  const shotNumber = Number(form.get("shotNumber"));
  const file = form.get("file");

  if (
    typeof tournamentSlug !== "string" ||
    typeof playerSlug !== "string" ||
    !Number.isInteger(round) ||
    !Number.isInteger(hole) ||
    hole < 1 ||
    hole > 18 ||
    !Number.isInteger(shotNumber) ||
    shotNumber < 1 ||
    !(file instanceof File)
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: roundRow } = await service
    .from("archived_scorecard_rounds")
    .select("id")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (!roundRow) {
    return NextResponse.json({ ok: false, error: "That round hasn't been recorded yet." }, { status: 404 });
  }

  const { data: holeRow } = await service.from("archived_scorecard_holes").select("score").eq("round_id", roundRow.id).eq("hole", hole).maybeSingle();
  if (!holeRow || shotNumber > holeRow.score) {
    return NextResponse.json({ ok: false, error: "That shot number doesn't exist for this hole's score." }, { status: 400 });
  }

  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ".mp4";
  const storagePath = `${tournamentSlug}/round-${round}/hole-${hole}/shot-${shotNumber}${extension}`;

  const { error: uploadError } = await service.storage.from("shot-videos").upload(storagePath, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: "Could not upload that video." }, { status: 500 });
  }

  const { error: dbError } = await service
    .from("archived_shot_videos")
    .upsert(
      { round_id: roundRow.id, hole, shot_number: shotNumber, storage_path: storagePath, uploaded_at: new Date().toISOString() },
      { onConflict: "round_id,hole,shot_number" }
    );
  if (dbError) {
    return NextResponse.json({ ok: false, error: "Video uploaded, but could not be linked to this shot." }, { status: 500 });
  }

  const { data: publicUrl } = service.storage.from("shot-videos").getPublicUrl(storagePath);
  return NextResponse.json({ ok: true, url: publicUrl.publicUrl });
}
```

- [ ] **Step 5: Run to verify tests pass**

Run: `npm test -- app/api/portal/tiger/scorecards/save app/api/portal/tiger/scorecards/video && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/portal/tiger/scorecards
git commit -m "feat(scorecards): add save and video-upload Route Handlers"
```

---

### Task 10: Editable hole detail row

**Files:**
- Create: `components/portal/tiger/EditableHoleDetail.tsx`

**Interfaces:**
- Consumes: `HoleStat` (`lib/data/types.ts`).
- Produces (consumed by Task 12's `ScorecardEditor`): `EditableHoleDetail({ hole, onChange }: { hole: HoleStat; onChange: (next: HoleStat) => void })` — a Score/Fairway/Green/Putts row where tapping any value turns it into a small editor and calls `onChange` with the full updated `HoleStat` once a new value is committed. Purely a controlled display of whatever `hole` it's given — it holds no "saved" state of its own, so the parent (`ScorecardEditor`) is what decides whether/when a change is persisted.

- [ ] **Step 1: Write the component**

```typescript
// components/portal/tiger/EditableHoleDetail.tsx
"use client";

import { useState } from "react";
import type { HoleStat } from "@/lib/data";

function StatLabel({ children }: { children: string }) {
  return <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">{children}</span>;
}

function NumberEditor({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex flex-col items-center gap-[2px] px-5">
        <span className="font-score text-base font-bold text-ink-900 tabular-nums">{value}</span>
        <StatLabel>{label}</StatLabel>
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-[2px] px-5">
      <input
        type="number"
        inputMode="numeric"
        autoFocus
        defaultValue={value}
        min={0}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 0) onCommit(n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-12 rounded-sm border-2 border-maroon-700 text-center font-score text-base font-bold text-ink-900 tabular-nums"
      />
      <StatLabel>{label}</StatLabel>
    </div>
  );
}

function HitMissEditor({
  label,
  value,
  applicable = true,
  onCommit,
}: {
  label: string;
  value: boolean;
  applicable?: boolean;
  onCommit: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!applicable) {
    return (
      <div className="flex flex-col items-center gap-[2px] px-5">
        <span className="font-score text-base font-bold text-ink-900">–</span>
        <StatLabel>{label}</StatLabel>
      </div>
    );
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex flex-col items-center gap-[2px] px-5">
        <span className="font-score text-base font-bold text-ink-900">{value ? "Hit" : "Miss"}</span>
        <StatLabel>{label}</StatLabel>
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 px-5">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => {
            onCommit(true);
            setEditing(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-sm border-2 border-green-600 text-green-600 font-bold"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => {
            onCommit(false);
            setEditing(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-sm border-2 border-red-600 text-red-600 font-bold"
        >
          ✕
        </button>
      </div>
      <StatLabel>{label}</StatLabel>
    </div>
  );
}

export function EditableHoleDetail({ hole, onChange }: { hole: HoleStat; onChange: (next: HoleStat) => void }) {
  const fairwayApplicable = hole.fir !== "X";

  return (
    <div className="flex items-center justify-center divide-x divide-ink-100 py-3 bg-white border-2 border-maroon-700 rounded-md">
      <NumberEditor label="Score" value={hole.score} onCommit={(score) => onChange({ ...hole, score, diff: score - hole.par })} />
      <HitMissEditor
        label="Fairway"
        value={hole.fir === 1}
        applicable={fairwayApplicable}
        onCommit={(hit) => onChange({ ...hole, fir: hit ? 1 : 0 })}
      />
      <HitMissEditor label="Green" value={hole.gir === 1} onCommit={(hit) => onChange({ ...hole, gir: hit ? 1 : 0 })} />
      <NumberEditor label="Putts" value={hole.putts} onCommit={(putts) => onChange({ ...hole, putts })} />
    </div>
  );
}
```

- [ ] **Step 2: Run the full check**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/portal/tiger/EditableHoleDetail.tsx
git commit -m "feat(scorecards): add editable hole detail row"
```

---

### Task 11: Editable shot video panel

**Files:**
- Create: `components/portal/tiger/EditableShotVideoPanel.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 12's `ScorecardEditor`): `EditableShotVideoPanel({ shotCount, existingUrls, stagedFiles, onStage }: { shotCount: number; existingUrls: Record<number, string>; stagedFiles: Record<number, File>; onStage: (shot: number, file: File) => void })` — same dot tracker as the public `ShotVideoPanel`, but tapping a shot opens the device's file picker and calls `onStage` with the chosen file rather than uploading anything itself (the actual upload happens on Save — see Task 12).

- [ ] **Step 1: Write the component**

```typescript
// components/portal/tiger/EditableShotVideoPanel.tsx
"use client";

import { useRef, useState } from "react";

export function EditableShotVideoPanel({
  shotCount,
  existingUrls,
  stagedFiles,
  onStage,
}: {
  shotCount: number;
  existingUrls: Record<number, string>;
  stagedFiles: Record<number, File>;
  onStage: (shot: number, file: File) => void;
}) {
  const shots = Array.from({ length: shotCount }, (_, i) => i + 1);
  const [currentShot, setCurrentShot] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const staged = stagedFiles[currentShot];
  const stagedUrl = staged ? URL.createObjectURL(staged) : null;
  const previewUrl = stagedUrl ?? existingUrls[currentShot];

  return (
    <div className="-mx-7 sm:mx-0">
      {previewUrl ? (
        <div className="relative">
          <video key={previewUrl} controls playsInline className="aspect-video w-full bg-ink-900 sm:rounded-md" src={previewUrl} />
          {staged && (
            <span className="absolute top-2 left-2 rounded-sm bg-maroon-700 px-2 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white">
              Unsaved
            </span>
          )}
        </div>
      ) : (
        <div className="aspect-video w-full flex flex-col items-center justify-center gap-2 bg-ink-900 text-cream-100 sm:rounded-md">
          <span className="font-condensed text-xs font-semibold tracking-wide uppercase opacity-80">Shot {currentShot} · No video yet</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onStage(currentShot, file);
          e.target.value = "";
        }}
      />

      <div className="flex items-center px-7 py-3 sm:px-0">
        {shots.map((shot, i) => (
          <div key={shot} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => {
                setCurrentShot(shot);
                if (!existingUrls[shot] && !stagedFiles[shot]) fileInputRef.current?.click();
              }}
              className={[
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-condensed text-[11px] font-bold cursor-pointer transition-colors",
                shot <= currentShot ? "bg-maroon-700 text-white" : "bg-cream-100 text-maroon-700 border border-ink-300",
                stagedFiles[shot] ? "ring-2 ring-offset-1 ring-amber-500" : existingUrls[shot] ? "ring-2 ring-offset-1 ring-maroon-700" : "",
              ].join(" ")}
            >
              {shot}
            </button>
            {i < shots.length - 1 && (
              <div className="mx-1 h-[3px] flex-1 overflow-hidden rounded-full bg-ink-200">
                <div className="h-full bg-maroon-700 transition-all duration-300" style={{ width: shot + 1 <= currentShot ? "100%" : "0%" }} />
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => fileInputRef.current?.click()} className="mx-7 sm:mx-0 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
        {previewUrl ? "Replace this shot's video" : "Upload video for this shot"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run the full check**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/portal/tiger/EditableShotVideoPanel.tsx
git commit -m "feat(scorecards): add editable shot video panel"
```

---

### Task 12: The scorecard editor — pending state, Save, and the unsaved-changes guard

**Files:**
- Create: `components/portal/tiger/ScorecardEditor.tsx`
- Create: `app/portal/admin/scorecards/[tournament]/[player]/[round]/page.tsx`

**Interfaces:**
- Consumes: `getArchivedRoundScorecard`, `getShotVideoUrls` (Task 2), `CourseInfoHeader`/`ScorecardRow`/`MobileScorecardGrid` (`components/scorecard`), `EditableHoleDetail` (Task 10), `EditableShotVideoPanel` (Task 11), `POST /api/portal/tiger/scorecards/save` and `POST /api/portal/tiger/scorecards/video` (Task 9).
- Produces: nothing downstream in this plan — this is the last task.

- [ ] **Step 1: Write `components/portal/tiger/ScorecardEditor.tsx`**

```typescript
// components/portal/tiger/ScorecardEditor.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseInfoHeader } from "@/components/scorecard/CourseInfoHeader";
import { ScorecardRow } from "@/components/scorecard/ScorecardRow";
import { MobileScorecardGrid } from "@/components/scorecard/MobileScorecardGrid";
import { EditableHoleDetail } from "./EditableHoleDetail";
import { EditableShotVideoPanel } from "./EditableShotVideoPanel";
import type { HoleStat, RoundScorecard } from "@/lib/data";

export function ScorecardEditor({
  tournamentSlug,
  playerSlug,
  initialScorecard,
  initialVideoUrls,
  backHref,
}: {
  tournamentSlug: string;
  playerSlug: string;
  initialScorecard: RoundScorecard;
  initialVideoUrls: Record<number, Record<number, string>>;
  backHref: string;
}) {
  const router = useRouter();
  const [holes, setHoles] = useState<HoleStat[]>(initialScorecard.holes);
  const [selectedHole, setSelectedHole] = useState(1);
  const [stagedVideos, setStagedVideos] = useState<Record<number, Record<number, File>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const dirtyHoles = holes.filter((h, i) => {
    const original = initialScorecard.holes[i];
    return h.score !== original.score || h.putts !== original.putts || h.fir !== original.fir || h.gir !== original.gir;
  });
  const stagedCount = Object.values(stagedVideos).reduce((sum, byShot) => sum + Object.keys(byShot).length, 0);
  const isDirty = dirtyHoles.length > 0 || stagedCount > 0;

  // Covers tab close, refresh, and typing a new URL/using browser back-forward
  // — every real browser navigation. It does not cover this component's own
  // in-app "back" link below, which is guarded separately (see backHref).
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const activeForDisplay: RoundScorecard = { ...initialScorecard, holes };
  const holeStat = holes.find((h) => h.hole === selectedHole) ?? null;

  function updateHole(next: HoleStat) {
    setHoles((prev) => prev.map((h) => (h.hole === next.hole ? next : h)));
  }

  function stageVideo(shot: number, file: File) {
    setStagedVideos((prev) => ({ ...prev, [selectedHole]: { ...(prev[selectedHole] ?? {}), [shot]: file } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Score edits go first, on purpose: the video endpoint checks a shot
      // number against the hole's *current* score in the database, so a
      // raised score (e.g. 4 -> 6, adding shots 5-6) must already be saved
      // before a video for one of those new shots can be accepted.
      if (dirtyHoles.length > 0) {
        const res = await fetch("/api/portal/tiger/scorecards/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tournamentSlug,
            playerSlug,
            round: initialScorecard.round,
            holes: dirtyHoles.map((h) => ({ hole: h.hole, score: h.score, putts: h.putts, fir: String(h.fir), gir: h.gir === 1 })),
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
      }

      for (const [holeStr, byShot] of Object.entries(stagedVideos)) {
        for (const [shotStr, file] of Object.entries(byShot)) {
          const form = new FormData();
          form.set("tournamentSlug", tournamentSlug);
          form.set("playerSlug", playerSlug);
          form.set("round", String(initialScorecard.round));
          form.set("hole", holeStr);
          form.set("shotNumber", shotStr);
          form.set("file", file);
          const res = await fetch("/api/portal/tiger/scorecards/video", { method: "POST", body: form });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error);
        }
      }

      router.push(backHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function handleBackClick() {
    if (isDirty) setConfirmingLeave(true);
    else router.push(backHref);
  }

  return (
    <div>
      <button type="button" onClick={handleBackClick} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
        ← Back to rounds
      </button>
      <h1 className="mt-2 font-serif text-2xl font-bold text-ink-900">
        Round {initialScorecard.round} — {initialScorecard.course}
      </h1>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <div className="mt-4 hidden overflow-x-auto overflow-y-hidden sm:block">
        <div className="w-max rounded-2xl border border-ink-300 bg-cream-100">
          <CourseInfoHeader round={activeForDisplay} onHoleClick={setSelectedHole} selectedHole={selectedHole} />
          <ScorecardRow round={activeForDisplay} onHoleClick={setSelectedHole} selectedHole={selectedHole} />
        </div>
      </div>
      <div className="mt-4 -mx-7 sm:hidden">
        <MobileScorecardGrid round={activeForDisplay} selectedHole={selectedHole} onHoleClick={setSelectedHole} initialHole={selectedHole} />
      </div>

      {holeStat && (
        <div className="mt-3">
          <EditableHoleDetail hole={holeStat} onChange={updateHole} />
          <div className="mt-3">
            <EditableShotVideoPanel
              shotCount={holeStat.score}
              existingUrls={initialVideoUrls[selectedHole] ?? {}}
              stagedFiles={stagedVideos[selectedHole] ?? {}}
              onStage={stageVideo}
            />
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-stone-200 pt-4">
        <button
          type="button"
          disabled={!isDirty || saving}
          onClick={save}
          className="rounded-lg bg-maroon-700 px-6 py-3 font-condensed text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {confirmingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-lg bg-white p-5">
            <p className="font-sans text-sm text-ink-700">You have unsaved changes. Leave without saving?</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={saving} onClick={save} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
                Save & Leave
              </button>
              <button type="button" onClick={() => router.push(backHref)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-700 underline">
                Leave Without Saving
              </button>
              <button type="button" onClick={() => setConfirmingLeave(false)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `app/portal/admin/scorecards/[tournament]/[player]/[round]/page.tsx`**

```typescript
// app/portal/admin/scorecards/[tournament]/[player]/[round]/page.tsx
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getArchivedRoundScorecard, getShotVideoUrls } from "@/lib/data/archivedScorecards";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { ScorecardEditor } from "@/components/portal/tiger/ScorecardEditor";

export default async function ScorecardEditorPage({ params }: { params: Promise<{ tournament: string; player: string; round: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const { tournament: tournamentSlug, player: playerSlug, round: roundStr } = await params;
  const round = Number(roundStr);
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  if (!playerProfile || !Number.isInteger(round)) notFound();

  const scorecard = await getArchivedRoundScorecard(tournamentSlug, playerSlug, round);
  if (!scorecard) notFound();
  const videoUrls = await getShotVideoUrls(tournamentSlug, playerSlug, round);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7">
      <ScorecardEditor
        tournamentSlug={tournamentSlug}
        playerSlug={playerSlug}
        initialScorecard={scorecard}
        initialVideoUrls={videoUrls}
        backHref={`/portal/admin/scorecards/${tournamentSlug}/${playerSlug}`}
      />
    </div>
  );
}
```

- [ ] **Step 3: Run the full check**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Manual walkthrough**

After Task 3's migration has run, visit `/portal/admin/scorecards/2026-palm-springs/cam-latto/1` as Tiger. Confirm:

- The scorecard table matches Cam's real public bio page for that round.
- Clicking a hole shows the editable Score/Fairway/Green/Putts row and the shot video panel below it.
- Tapping Score or Putts pops a number input; tapping Fairway or Green pops the ✓/✕ choice; committing a value updates the display and enables the Save button.
- Tapping a shot with no video opens the file picker; picking a file shows it staged with an "Unsaved" badge.
- Clicking Save writes the changes, then confirm on the real public page (`/leaderboard/2026-palm-springs/players/cam`) that the new score/video actually shows there.
- With changes pending, clicking "← Back to rounds" shows the Save & Leave / Leave Without Saving / Cancel prompt; with nothing changed, it navigates away immediately with no prompt.

- [ ] **Step 5: Commit**

```bash
git add components/portal/tiger/ScorecardEditor.tsx "app/portal/admin/scorecards/[tournament]/[player]/[round]"
git commit -m "feat(scorecards): add the scorecard editor with save and unsaved-changes guard"
```

---

## Definition of done for this plan

- Tiger can open "Scorecards & Video" from the Tiger Center, pick any of 2024/2025/2026, drill into any player's any recorded round, and see the exact same scorecard table the public bio page shows.
- Every hole's score, putts, fairway, and green is editable (number keypad for score/putts, Hit/Miss choice for fairway/green), and a shot video can be attached by picking straight from the device's camera roll.
- Nothing writes until Save is clicked; leaving the editor with unsaved changes prompts Save & Leave / Leave Without Saving / Cancel, and leaving with nothing changed does nothing.
- Once saved, the real corrected score and the real video are visible immediately on that player's actual public scorecard page — the leaderboard and stats read from the same database, so nothing can disagree between pages.
- `npm test && npx tsc --noEmit && npm run lint && npm run build` all clean.
- **Not built in this plan** (explicitly out of scope, per the spec): the live, in-round scoring flow; the official review/settlement/wager-payout screen; the competitor-agreement indicator; creating a brand-new round from scratch that was never migrated.
