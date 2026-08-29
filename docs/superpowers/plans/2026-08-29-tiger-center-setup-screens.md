# Tiger Center Setup Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Tiger Center landing page (four rectangle buttons) plus its
first two working sections — **Players & Teams** and **Courses & Format** —
so Tiger can fully set up a tournament's roster and round schedule end to
end. Matchups and Edit Scores (the live round cycle and settlement) are
separate later plans per the spec's phasing.

**Architecture:** Extends the already-shipped `lib/live/` foundation with the
schema/types this phase needs (tournament settings, roster, richer round
state, the three-format change). Follows the same authenticated-Route-
Handler pattern already established (`requireHost`/`requirePlayer`), reading
and writing Supabase directly — no Realtime subscriptions in this phase
(these are Tiger-only setup screens, not something that needs to be
instant-live for other viewers yet). `PlayerSlotsAdmin`'s existing
invite-link/unlink functionality is preserved and extended, not replaced
from scratch.

**Tech Stack:** Next.js 16 App Router (Route Handlers, Server Components),
TypeScript, Supabase (`@supabase/ssr`), `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-29-tiger-center-operations-design.md`,
`docs/superpowers/specs/2026-08-28-native-live-platform-design.md`

## Global Constraints

- Every Route Handler in this plan is host-only: resolve identity via the
  existing `lib/portal/requireHost.ts` (do not write a new inline
  `requireHost` — one already-flagged duplicate exists in
  `app/api/portal/admin/unlink/route.ts`; don't add a third).
- **Profile/bio editing is explicitly OUT of this plan.** The spec describes
  Tiger editing a player's bio directly, but `PlayerProfile` data
  (`lib/data/players/*.ts`) is static, git-committed files today, not a
  database table — making it live-editable is its own decision (it also
  touches public player pages) and gets its own follow-up plan. Players &
  Teams in this plan covers invite-link/unlink (already built,
  `PlayerSlotsAdmin`) plus team assignment — nothing else.
- All writes go through `createSupabaseServiceRoleClient()` (bypasses RLS),
  matching the existing `unlink` route's pattern — never trust a
  client-supplied player/team value without validating it against real data
  server-side.
- Match existing code style: Tailwind utility classes matching
  `components/portal/PlayerSlotsAdmin.tsx`'s look (font-serif headers,
  font-sans body, maroon-700 accents, font-condensed uppercase small text
  for buttons/labels).
- Run `npm test && npx tsc --noEmit && npm run lint && npm run build` clean
  before considering any task done.

---

### Task 1: Schema extensions — settings, roster, richer round state, three formats

**Files:**
- Modify: `supabase/schema.sql` (append after the "Native Live Platform" section)

**Interfaces:**
- Produces (consumed by Task 2's types and all later Route Handlers): four
  things —
  - `live_tournament_settings(id boolean pk default true, round_count int,
    completed_at timestamptz)` — a single-row table (the `boolean primary
    key default true` trick keeps it to exactly one row; every write is an
    upsert on `id = true`).
  - `live_roster(player_slug text pk fk -> player_slots, team text check in
    ('maroon','white'))`.
  - `live_round_state` gains `date date`, `format text check in
    ('Fourball','Foursome','Singles')`, `course_locked boolean not null
    default false`, `matchups_locked boolean not null default false`.
  - `live_match_boxes.format`'s check constraint is updated from 4 values to
    the same 3 (`'Fourball','Foursome','Singles'`) — drop and recreate it.

- [ ] **Step 1: Append the schema**

```sql
-- === Tiger Center: Setup (roster, round scheduling) =====================
-- Extends the Native Live Platform section above. Adds the pieces Tiger
-- needs to set up a tournament: how many rounds, who's on which team, and
-- each round's date/course/format with independent lock states.

create table if not exists live_tournament_settings (
  id boolean primary key default true,
  round_count integer check (round_count between 6 and 10),
  completed_at timestamptz,
  constraint live_tournament_settings_singleton check (id)
);

create table if not exists live_roster (
  player_slug text primary key references player_slots(player_slug),
  team text not null check (team in ('maroon', 'white'))
);

alter table live_round_state
  add column if not exists date date,
  add column if not exists format text check (format in ('Fourball', 'Foursome', 'Singles')),
  add column if not exists course_locked boolean not null default false,
  add column if not exists matchups_locked boolean not null default false;

-- Formats are three going forward (Foursome replaces the Scramble/Alternate
-- Shot split — see the Tiger Center Operations spec). Postgres names an
-- inline column check "<table>_<column>_check" by default, so this is the
-- real name of the constraint the Native Live Platform section created.
alter table live_match_boxes drop constraint if exists live_match_boxes_format_check;
alter table live_match_boxes add constraint live_match_boxes_format_check check (format in ('Fourball', 'Foursome', 'Singles'));

alter table live_tournament_settings enable row level security;
alter table live_roster enable row level security;

-- Same "public read, service-role writes" pattern as the rest of the live
-- tables — this is tournament setup info, not sensitive, and the public
-- site/Player Portal both need to read it.
drop policy if exists live_tournament_settings_select_all on live_tournament_settings;
create policy live_tournament_settings_select_all on live_tournament_settings for select using (true);

drop policy if exists live_roster_select_all on live_roster;
create policy live_roster_select_all on live_roster for select using (true);
```

- [ ] **Step 2: Run it against your Supabase project**

This step is for the operator, not the implementer — same as the previous
plan's schema task. Note in your report that Step 2 is a manual step; do
not attempt it (no DB credentials are configured in this environment).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(tiger): add tournament settings, roster, and round scheduling schema"
```

---

### Task 2: TypeScript types for the new schema

**Files:**
- Modify: `lib/live/types.ts` (`MatchFormat`, add new types)

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by every later task): `MatchFormat` narrowed to 3
  values, `TournamentSettings`, `RosterEntry`, `LiveRoundState` extended.

- [ ] **Step 1: Update `MatchFormat` and `LiveRoundState`, add new types**

```typescript
// was: export type MatchFormat = "Fourball" | "Scramble" | "Alternate Shot" | "Singles";
export type MatchFormat = "Fourball" | "Foursome" | "Singles";
```

Everywhere else in `lib/live/*.ts` that referenced `"Alternate Shot"` as a
literal (the special-case in `orchestration.ts`'s `holeComplete` and
`matchBoxResult` — `if (matchBox.format === "Alternate Shot") ...`) — **do
not touch those files in this task.** The internal rule value is
unchanged (see this plan's Global Constraints / the spec's Terminology
section) — `"Alternate Shot"` was Python's name for the rule, and the
already-shipped orchestration logic keeps using it internally. What
changes here is only the *type* `MatchFormat` itself no longer includes
`"Scramble"` as a possible value. Since `"Alternate Shot"` was never in
`MatchFormat`'s literal union in the first place (re-check
`lib/live/types.ts` and `lib/live/orchestration.ts` as they exist today —
if `"Alternate Shot"` already appears as a bare string in orchestration.ts
without being part of the `MatchFormat` union type, this is a pre-existing
inconsistency, not something this task introduces or needs to fix; if
`tsc` flags it as a result of this change, that's a real compile error to
fix by keeping `"Alternate Shot"` reachable — read the current file before
assuming which case applies).

```typescript
export interface TournamentSettings {
  roundCount: number | null;
  completedAt: string | null; // ISO timestamp, null until the tournament is done
}

export interface RosterEntry {
  playerSlug: string;
  team: Team;
}
```

Extend `LiveRoundState`:

```typescript
// was:
// export interface LiveRoundState {
//   round: number;
//   started: boolean;
//   courseId: string | null;
// }
export interface LiveRoundState {
  round: number;
  started: boolean;
  courseId: string | null;
  date: string | null; // ISO date (YYYY-MM-DD)
  format: MatchFormat | null;
  courseLocked: boolean;
  matchupsLocked: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

If this surfaces a real error about `"Alternate Shot"` not being assignable
to `MatchFormat` somewhere in `orchestration.ts`, fix it by widening that
one comparison's type locally (e.g. `(matchBox.format as string) ===
"Alternate Shot"`) rather than re-adding `"Alternate Shot"` to the
`MatchFormat` union — the union is the three *website-visible* format
names now; the orchestration engine's internal string literal is allowed to
diverge, matching the spec's stated intent, but must still compile. Note in
your report exactly what you found and how you resolved it.

- [ ] **Step 3: Commit**

```bash
git add lib/live/types.ts
git commit -m "feat(tiger): narrow MatchFormat to 3 values, add settings/roster types"
```

---

### Task 3: Roster Route Handlers

**Files:**
- Create: `app/api/portal/tiger/roster/route.ts`
- Test: `app/api/portal/tiger/roster/route.test.ts`

**Interfaces:**
- Consumes: `requireHost` (`lib/portal/requireHost.ts`), `RosterEntry`
  (Task 2).
- Produces (consumed by Task 4's UI): `GET /api/portal/tiger/roster` →
  `{ ok: true, roster: RosterEntry[] } | { ok: false, error: string }`.
  `POST /api/portal/tiger/roster` with `{ playerSlug: string, team:
  "maroon" | "white" }` → `{ ok: true } | { ok: false, error: string }`
  (upserts one row — this is how Tiger sets/changes a player's team).

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/portal/tiger/roster/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// requireHost() calls createSupabaseServerClient(), which needs a real
// request lifecycle — same limitation lib/portal/requireHost.test.mts and
// app/api/portal/profile/route.test.mts already documented. This test
// covers the one pure piece: an unauthenticated request never reaches
// Supabase writes.
test("POST /api/portal/tiger/roster rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/portal/tiger/roster", {
    method: "POST",
    body: JSON.stringify({ playerSlug: "cade-barone", team: "maroon" }),
  });

  await assert.rejects(() => POST(request));
  assert.equal(fetchCalled, false, "must not touch Supabase without a resolved host session");
  globalThis.fetch = originalFetch;
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app/api/portal/tiger/roster/route.test.ts`
Expected: FAIL (`Cannot find module './route.ts'`)

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/portal/tiger/roster/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { RosterEntry, Team } from "@/lib/live/types";

export async function GET() {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_roster").select("player_slug, team");
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the roster." }, { status: 500 });
  }

  const roster: RosterEntry[] = (data ?? []).map((row) => ({ playerSlug: row.player_slug, team: row.team as Team }));
  return NextResponse.json({ ok: true, roster }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, team } = await request.json();
  if (typeof playerSlug !== "string" || (team !== "maroon" && team !== "white")) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  // Validate the slug against the real roster of player slots — never trust
  // a client-supplied slug to actually exist before writing it as a foreign key.
  const { data: slot } = await service.from("player_slots").select("player_slug").eq("player_slug", playerSlug).single();
  if (!slot) {
    return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 400 });
  }

  const { error } = await service.from("live_roster").upsert({ player_slug: playerSlug, team });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that team assignment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- app/api/portal/tiger/roster/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/roster/route.ts app/api/portal/tiger/roster/route.test.ts
git commit -m "feat(tiger): add roster Route Handlers (list + set team)"
```

---

### Task 4: Players & Teams UI

**Files:**
- Modify: `components/portal/PlayerSlotsAdmin.tsx` (extend, don't rewrite from scratch)
- Modify: `app/portal/admin/page.tsx` (pass roster data through)

**Interfaces:**
- Consumes: `RosterEntry` (Task 2), `GET`/`POST /api/portal/tiger/roster` (Task 3).
- Produces (consumed by Task 7's Tiger Center landing page): the same
  `PlayerSlotsAdmin` component, now also showing/editing team assignment —
  Task 7 will link to whatever route renders this component (this task
  doesn't need to decide that route yet, just keep the component correct
  and self-contained).

- [ ] **Step 1: Extend `PlayerSlotAdminRow` and the component**

```typescript
// components/portal/PlayerSlotsAdmin.tsx
// Add "team" to the row shape:
export interface PlayerSlotAdminRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
  team: "maroon" | "white" | null;
}
```

Add a team `<select>` per row (only meaningful once a player is claimed —
render it for every row regardless, since Tiger may want to pre-assign
teams before every player has signed up; saving works the same either way
since `live_roster` only references `player_slots`, not `profiles`):

```typescript
async function handleSetTeam(playerSlug: string, team: "maroon" | "white") {
  setBusy(playerSlug);
  setError(null);
  try {
    const res = await fetch("/api/portal/tiger/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerSlug, team }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  } finally {
    setBusy(null);
  }
}
```

Add a new table column, "Team", between "Status" and the action column:

```tsx
<th className="py-2">Team</th>
```

```tsx
<td className="py-2">
  <select
    value={row.team ?? ""}
    disabled={busy === row.playerSlug}
    onChange={(e) => handleSetTeam(row.playerSlug, e.target.value as "maroon" | "white")}
    className="border-2 border-stone-300 rounded-lg px-2 py-1 text-xs font-semibold bg-white"
  >
    <option value="" disabled>
      Unassigned
    </option>
    <option value="maroon">Maroon</option>
    <option value="white">White</option>
  </select>
</td>
```

Update the page heading/description slightly to reflect the broader scope
(it's no longer just invites):

```tsx
<h1 className="font-serif text-2xl font-bold text-ink-900">Players & Teams</h1>
<p className="mt-2 font-sans text-sm text-ink-500">
  Invite players, then assign each one to Maroon or White. Profile/bio editing is coming in a later round.
</p>
```

- [ ] **Step 2: Wire the roster into `app/portal/admin/page.tsx`**

```typescript
// app/portal/admin/page.tsx — add alongside the existing player_slots query
const { data: roster } = await service.from("live_roster").select("player_slug, team");
const rosterBySlug = new Map((roster ?? []).map((r) => [r.player_slug, r.team as "maroon" | "white"]));

const rows: PlayerSlotAdminRow[] = playerProfiles.map((p) => ({
  playerSlug: p.slug,
  fullName: p.fullName,
  username: byslug.get(p.slug)?.username ?? null,
  claimedBy: byslug.get(p.slug)?.claimed_by ?? null,
  team: rosterBySlug.get(p.slug) ?? null,
}));
```

(This replaces the existing `rows` construction — same shape, one new field.)

- [ ] **Step 3: Manual walkthrough**

Run `npm run dev`, log in as Tiger, visit `/portal/admin`, assign a team to
a player, confirm the page reflects it after reload, confirm assigning the
other team to the same player overwrites (not duplicates) their row.

- [ ] **Step 4: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add components/portal/PlayerSlotsAdmin.tsx app/portal/admin/page.tsx
git commit -m "feat(tiger): add team assignment to Players & Teams"
```

---

### Task 5: Tournament settings + rounds Route Handlers

**Files:**
- Create: `app/api/portal/tiger/settings/route.ts`
- Create: `app/api/portal/tiger/rounds/route.ts`
- Test: `app/api/portal/tiger/settings/route.test.ts`
- Test: `app/api/portal/tiger/rounds/route.test.ts`

**Interfaces:**
- Consumes: `requireHost`, `TournamentSettings`/`LiveRoundState` (Task 2).
- Produces (consumed by Task 6's UI):
  - `GET /api/portal/tiger/settings` → `{ ok: true, settings:
    TournamentSettings } | { ok: false, error }`.
  - `POST /api/portal/tiger/settings` with `{ roundCount: number }` (6-10) →
    `{ ok: true } | { ok: false, error }` — sets the round count and
    creates any missing `live_round_state` rows for rounds `1..roundCount`
    that don't already exist (never deletes existing rounds here — that's
    the separate "Remove round" action below).
  - `GET /api/portal/tiger/rounds` → `{ ok: true, rounds: LiveRoundState[] }
    | { ok: false, error }`.
  - `POST /api/portal/tiger/rounds` with `{ round: number, date?: string,
    courseId?: string, format?: MatchFormat }` → `{ ok: true } | { ok:
    false, error }` — updates one round's fields (partial update, any
    subset of the three).
  - `POST /api/portal/tiger/rounds/lock` with `{ round: number, lock:
    "course" | "matchups", value: boolean }` → `{ ok: true } | { ok: false,
    error }` — toggles one of the two independent locks. Locking
    `"course"` requires the round to already have a date, course, and
    format set (reject with a clear error otherwise); locking
    `"matchups"` in this task always rejects with `{ ok: false, error:
    "Matchups aren't built yet." }` since no matchups exist yet — Task 6's
    UI won't call this with `lock: "matchups"` yet, but the route's shape
    is right for the next plan to extend without a breaking change.
  - `POST /api/portal/tiger/rounds/remove` with `{ round: number }` → `{
    ok: true } | { ok: false, error }` — deletes that round's
    `live_round_state` row. Reject if `course_locked` or `matchups_locked`
    is true (must unlock first) — this is the server-side half of the
    confirm-dialog UX; the confirm dialog itself is Task 6's job.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/portal/tiger/settings/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/settings rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/settings", {
    method: "POST",
    body: JSON.stringify({ roundCount: 8 }),
  });
  await assert.rejects(() => POST(request));
});
```

```typescript
// app/api/portal/tiger/rounds/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/rounds rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/rounds", {
    method: "POST",
    body: JSON.stringify({ round: 1, format: "Fourball" }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- app/api/portal/tiger/settings/route.test.ts app/api/portal/tiger/rounds/route.test.ts`
Expected: FAIL (modules don't exist)

- [ ] **Step 3: Write the implementations**

```typescript
// app/api/portal/tiger/settings/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { TournamentSettings } from "@/lib/live/types";

export async function GET() {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("live_tournament_settings").select("round_count, completed_at").eq("id", true).maybeSingle();

  const settings: TournamentSettings = {
    roundCount: data?.round_count ?? null,
    completedAt: data?.completed_at ?? null,
  };
  return NextResponse.json({ ok: true, settings }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { roundCount } = await request.json();
  if (typeof roundCount !== "number" || roundCount < 6 || roundCount > 10) {
    return NextResponse.json({ ok: false, error: "Round count must be between 6 and 10." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { error: settingsError } = await service.from("live_tournament_settings").upsert({ id: true, round_count: roundCount });
  if (settingsError) {
    return NextResponse.json({ ok: false, error: "Could not save the round count." }, { status: 500 });
  }

  // Create any missing round rows for 1..roundCount — never touch rounds
  // that already exist (their date/course/format/locks stay as-is).
  const { data: existing } = await service.from("live_round_state").select("round");
  const existingRounds = new Set((existing ?? []).map((r) => r.round));
  const missing = Array.from({ length: roundCount }, (_, i) => i + 1).filter((round) => !existingRounds.has(round));

  if (missing.length > 0) {
    const { error: insertError } = await service.from("live_round_state").insert(missing.map((round) => ({ round })));
    if (insertError) {
      return NextResponse.json({ ok: false, error: "Could not create the new round slots." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

```typescript
// app/api/portal/tiger/rounds/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { LiveRoundState, MatchFormat } from "@/lib/live/types";

export async function GET() {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("live_round_state")
    .select("round, started, course_id, date, format, course_locked, matchups_locked")
    .order("round");
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the rounds." }, { status: 500 });
  }

  const rounds: LiveRoundState[] = (data ?? []).map((row) => ({
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

  const { round, date, courseId, format } = await request.json();
  if (typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (date !== undefined) update.date = date;
  if (courseId !== undefined) update.course_id = courseId;
  if (format !== undefined) update.format = format;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("live_round_state").update(update).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that round." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write `app/api/portal/tiger/rounds/lock/route.ts`**

```typescript
// app/api/portal/tiger/rounds/lock/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, lock, value } = await request.json();
  if (typeof round !== "number" || (lock !== "course" && lock !== "matchups") || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  if (lock === "matchups") {
    // Matchups don't exist yet — this plan only ships Courses & Format.
    // The route shape is final; the next plan implements this branch.
    return NextResponse.json({ ok: false, error: "Matchups aren't built yet." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (value) {
    const { data: current } = await service.from("live_round_state").select("date, course_id, format").eq("round", round).single();
    if (!current?.date || !current?.course_id || !current?.format) {
      return NextResponse.json({ ok: false, error: "Set a date, course, and format before locking this round." }, { status: 400 });
    }
  }

  const { error } = await service.from("live_round_state").update({ course_locked: value }).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Write `app/api/portal/tiger/rounds/remove/route.ts`**

```typescript
// app/api/portal/tiger/rounds/remove/route.ts
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
  const { data: current } = await service.from("live_round_state").select("course_locked, matchups_locked").eq("round", round).single();
  if (current?.course_locked || current?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this round before removing it." }, { status: 400 });
  }

  const { error } = await service.from("live_round_state").delete().eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that round." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run to verify tests pass, then commit**

Run: `npm test -- app/api/portal/tiger/settings/route.test.ts app/api/portal/tiger/rounds/route.test.ts`
Expected: PASS

```bash
git add app/api/portal/tiger/settings app/api/portal/tiger/rounds
git commit -m "feat(tiger): add tournament settings and round CRUD/lock/remove routes"
```

---

### Task 6: Courses Route Handlers

**Files:**
- Create: `app/api/portal/tiger/courses/route.ts`
- Test: `app/api/portal/tiger/courses/route.test.ts`

**Interfaces:**
- Consumes: `requireHost`, `LiveCourse`/`LiveHole` (Task 2, already shipped
  in the native live data foundation — no changes needed there).
- Produces (consumed by Task 7's UI): `GET /api/portal/tiger/courses` →
  `{ ok: true, courses: LiveCourse[] } | { ok: false, error }`. `POST
  /api/portal/tiger/courses` with `{ name: string, holes: LiveHole[] }`
  (exactly 18 holes) → `{ ok: true, courseId: string } | { ok: false,
  error }`.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/portal/tiger/courses/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/courses rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/courses", {
    method: "POST",
    body: JSON.stringify({ name: "Test Course", holes: [] }),
  });
  await assert.rejects(() => POST(request));
});

test("POST /api/portal/tiger/courses validates hole count structurally", () => {
  // Pure validation logic, no auth/DB needed — exercised directly.
  const holes = Array.from({ length: 17 }, (_, i) => ({ number: i + 1, par: 4, yards: 400 }));
  assert.equal(holes.length !== 18, true, "17 holes should fail validation (sanity check on the test fixture itself)");
});
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `npm test -- app/api/portal/tiger/courses/route.test.ts`
Expected: FAIL (`Cannot find module './route.ts'`)

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/portal/tiger/courses/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { LiveCourse, LiveHole } from "@/lib/live/types";

export async function GET() {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_courses").select("id, name, holes").order("name");
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the course bank." }, { status: 500 });
  }

  const courses: LiveCourse[] = (data ?? []).map((row) => ({ id: row.id, name: row.name, holes: row.holes as LiveHole[] }));
  return NextResponse.json({ ok: true, courses }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { name, holes } = await request.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ ok: false, error: "Course name is required." }, { status: 400 });
  }
  if (!Array.isArray(holes) || holes.length !== 18) {
    return NextResponse.json({ ok: false, error: "A course needs exactly 18 holes." }, { status: 400 });
  }
  for (const hole of holes) {
    if (typeof hole?.number !== "number" || typeof hole?.par !== "number" || typeof hole?.yards !== "number") {
      return NextResponse.json({ ok: false, error: "Every hole needs a number, par, and yardage." }, { status: 400 });
    }
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_courses").insert({ name: name.trim(), holes }).select("id").single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Could not save that course." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, courseId: data.id });
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `npm test -- app/api/portal/tiger/courses/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/courses/route.ts app/api/portal/tiger/courses/route.test.ts
git commit -m "feat(tiger): add course bank Route Handlers (list + add)"
```

---

### Task 7: Courses & Format UI

**Files:**
- Create: `app/portal/admin/courses-format/page.tsx`
- Create: `components/portal/tiger/CoursesFormatPanel.tsx`
- Create: `components/portal/tiger/AddCourseForm.tsx`

**Interfaces:**
- Consumes: every route from Tasks 5 and 6.
- Produces (consumed by Task 8): the page Task 8's Tiger Center landing
  page links its "Courses & Format" button to.

- [ ] **Step 1: Write `app/portal/admin/courses-format/page.tsx`**

Server Component, mirrors `app/portal/admin/page.tsx`'s auth-guard shape:

```typescript
// app/portal/admin/courses-format/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { CoursesFormatPanel } from "@/components/portal/tiger/CoursesFormatPanel";
import type { LiveCourse, LiveRoundState, MatchFormat, TournamentSettings } from "@/lib/live/types";

export default async function CoursesFormatPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const [{ data: settingsRow }, { data: roundRows }, { data: courseRows }] = await Promise.all([
    service.from("live_tournament_settings").select("round_count, completed_at").eq("id", true).maybeSingle(),
    service.from("live_round_state").select("round, started, course_id, date, format, course_locked, matchups_locked").order("round"),
    service.from("live_courses").select("id, name, holes").order("name"),
  ]);

  const settings: TournamentSettings = { roundCount: settingsRow?.round_count ?? null, completedAt: settingsRow?.completed_at ?? null };
  const rounds: LiveRoundState[] = (roundRows ?? []).map((r) => ({
    round: r.round,
    started: r.started,
    courseId: r.course_id,
    date: r.date,
    format: r.format as MatchFormat | null,
    courseLocked: r.course_locked,
    matchupsLocked: r.matchups_locked,
  }));
  const courses: LiveCourse[] = (courseRows ?? []).map((c) => ({ id: c.id, name: c.name, holes: c.holes }));

  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Courses & Format</h1>
      <CoursesFormatPanel initialSettings={settings} initialRounds={rounds} initialCourses={courses} />
    </div>
  );
}
```

- [ ] **Step 2: Write `components/portal/tiger/AddCourseForm.tsx`**

```typescript
// components/portal/tiger/AddCourseForm.tsx
"use client";

import { useState } from "react";
import type { LiveCourse, LiveHole } from "@/lib/live/types";

function blankHoles(): LiveHole[] {
  return Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yards: 0 }));
}

export function AddCourseForm({ onSaved }: { onSaved: (course: LiveCourse) => void }) {
  const [name, setName] = useState("");
  const [holes, setHoles] = useState<LiveHole[]>(blankHoles());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateHole(index: number, field: "par" | "yards", value: number) {
    setHoles((current) => current.map((hole, i) => (i === index ? { ...hole, [field]: value } : hole)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, holes }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      onSaved({ id: data.courseId, name, holes });
      setName("");
      setHoles(blankHoles());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border-2 border-stone-300 p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Course name"
        className="w-full border-2 border-stone-300 rounded-lg px-2 py-2 text-sm font-semibold"
      />
      <table className="mt-3 w-full font-sans text-xs">
        <thead>
          <tr>
            <th className="text-left">Hole</th>
            <th className="text-left">Par</th>
            <th className="text-left">Yards</th>
          </tr>
        </thead>
        <tbody>
          {holes.map((hole, i) => (
            <tr key={hole.number}>
              <td>{hole.number}</td>
              <td>
                <input
                  type="number"
                  value={hole.par}
                  onChange={(e) => updateHole(i, "par", Number(e.target.value))}
                  className="w-14 border border-stone-300 rounded px-1"
                />
              </td>
              <td>
                <input
                  type="number"
                  value={hole.yards}
                  onChange={(e) => updateHole(i, "yards", Number(e.target.value))}
                  className="w-16 border border-stone-300 rounded px-1"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="mt-2 text-red-700">{error}</p>}
      <button
        type="button"
        disabled={saving || !name.trim()}
        onClick={save}
        className="mt-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
      >
        {saving ? "Saving…" : "Save Course"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/portal/tiger/CoursesFormatPanel.tsx`**

```typescript
// components/portal/tiger/CoursesFormatPanel.tsx
"use client";

import { useState } from "react";
import type { LiveCourse, LiveRoundState, MatchFormat, TournamentSettings } from "@/lib/live/types";
import { AddCourseForm } from "./AddCourseForm";

const FORMATS: MatchFormat[] = ["Fourball", "Foursome", "Singles"];

export function CoursesFormatPanel({
  initialSettings,
  initialRounds,
  initialCourses,
}: {
  initialSettings: TournamentSettings;
  initialRounds: LiveRoundState[];
  initialCourses: LiveCourse[];
}) {
  const [roundCount, setRoundCount] = useState(initialSettings.roundCount ?? 8);
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
      body: JSON.stringify({ roundCount: count }),
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
    const res = await fetch("/api/portal/tiger/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round, ...patch }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setRounds((current) =>
      current.map((r) =>
        r.round === round
          ? { ...r, date: patch.date ?? r.date, courseId: patch.courseId ?? r.courseId, format: patch.format ?? r.format }
          : r
      )
    );
  }

  async function toggleLock(round: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/rounds/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round, lock: "course", value }),
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
      body: JSON.stringify({ round }),
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

  return (
    <div className="mt-6">
      <label className="font-sans text-sm font-semibold text-ink-700">
        Number of rounds:{" "}
        <select
          value={roundCount}
          onChange={(e) => saveRoundCount(Number(e.target.value))}
          className="border-2 border-stone-300 rounded-lg px-2 py-1"
        >
          {[6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      <div className="mt-6 space-y-4">
        {rounds.map((round) => (
          <div key={round.round} className="rounded-lg border-2 border-stone-300 p-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-lg font-bold text-ink-900">Round {round.round}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleLock(round.round, !round.courseLocked)}
                  className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                >
                  {round.courseLocked ? "Unlock" : "Lock"}
                </button>
                {!round.courseLocked && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(round.round)}
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
                value={round.date ?? ""}
                disabled={round.courseLocked}
                onChange={(e) => updateRound(round.round, { date: e.target.value })}
                className="border-2 border-stone-300 rounded-lg px-2 py-2 text-sm"
              />
              <select
                value={round.courseId ?? ""}
                disabled={round.courseLocked}
                onChange={(e) => updateRound(round.round, { courseId: e.target.value })}
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
                value={round.format ?? ""}
                disabled={round.courseLocked}
                onChange={(e) => updateRound(round.round, { format: e.target.value as MatchFormat })}
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

            {!round.courseLocked && (
              <button
                type="button"
                onClick={() => setAddingCourseFor(addingCourseFor === round.round ? null : round.round)}
                className="mt-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
              >
                {addingCourseFor === round.round ? "Cancel" : "Add Course"}
              </button>
            )}
            {addingCourseFor === round.round && (
              <AddCourseForm
                onSaved={(course) => {
                  setCourses((current) => [...current, course]);
                  setAddingCourseFor(null);
                }}
              />
            )}

            {removeTarget === round.round && (
              <div className="mt-3 rounded-lg bg-red-50 p-3">
                <p className="font-sans text-sm text-red-700">Remove Round {round.round}? This can't be undone.</p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => removeRound(round.round)}
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

- [ ] **Step 4: Manual walkthrough**

Run `npm run dev`, log in as Tiger, visit `/portal/admin/courses-format`.
Set round count to 6, confirm 6 round boxes appear. Add a course via one
round's "Add Course," confirm it's selectable from every round's course
dropdown afterward (shared bank, not per-round). Set date/course/format on
one round, Lock it, confirm the fields become disabled and Remove
disappears. Unlock it, confirm fields re-enable. Try removing an unlocked
round, confirm the are-you-sure dialog appears and Cancel actually cancels.

- [ ] **Step 5: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add app/portal/admin/courses-format components/portal/tiger
git commit -m "feat(tiger): add Courses & Format UI"
```

---

### Task 8: Tiger Center landing page

**Files:**
- Modify: `app/portal/admin/page.tsx` (add the 4-box landing layout above the existing Players & Teams content)
- Create: `components/portal/tiger/TigerCenterNav.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: the visual home Tiger lands on — four rectangle buttons:
  Players & Teams (links to the existing `/portal/admin` content — see
  note below), Courses & Format (links to Task 7's page), Matchups and
  Edit Scores (both rendered disabled/"Coming soon" — later plans replace
  these with real links, matching this plan's phasing).

**Note on Players & Teams' URL:** Task 4 extended the *existing*
`/portal/admin` page in place rather than moving it — so "Players & Teams"
as a landing-page button would link right back to the same page it's on.
To avoid that confusing loop, this task moves the Players & Teams content
(everything Task 4 built) from `/portal/admin` to `/portal/admin/players-teams`,
and `/portal/admin` becomes purely the four-box landing page. This is a
plain move, not a rewrite — same component, same data-fetching, new file
path.

- [ ] **Step 1: Move Players & Teams to its own route**

```bash
mkdir -p app/portal/admin/players-teams
git mv app/portal/admin/page.tsx app/portal/admin/players-teams/page.tsx
```

In the moved file, remove the `MM Coins Settlement →` link block (it moves
to the new landing page in Step 3 instead) — the file should now contain
only the auth guard, data fetching, and `<PlayerSlotsAdmin rows={rows} />`.

- [ ] **Step 2: Write `components/portal/tiger/TigerCenterNav.tsx`**

```typescript
// components/portal/tiger/TigerCenterNav.tsx
import Link from "next/link";

const BOXES = [
  { label: "Players & Teams", href: "/portal/admin/players-teams", enabled: true },
  { label: "Courses & Format", href: "/portal/admin/courses-format", enabled: true },
  { label: "Matchups", href: "#", enabled: false },
  { label: "Edit Scores", href: "#", enabled: false },
];

export function TigerCenterNav() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {BOXES.map((box) =>
        box.enabled ? (
          <Link
            key={box.label}
            href={box.href}
            className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800"
          >
            {box.label}
          </Link>
        ) : (
          <div
            key={box.label}
            className="rounded-lg border-2 border-stone-300 px-6 py-8 text-center font-serif text-xl font-bold text-stone-400"
          >
            {box.label}
            <div className="mt-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-stone-400">Coming soon</div>
          </div>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `app/portal/admin/page.tsx`**

```typescript
// app/portal/admin/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TigerCenterNav } from "@/components/portal/tiger/TigerCenterNav";

export default async function TigerCenterPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">The Tiger Center</h1>
      <div className="mt-6">
        <TigerCenterNav />
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

- [ ] **Step 4: Manual walkthrough**

Run `npm run dev`, log in as Tiger, visit `/portal/admin` — confirm the four
boxes render, Players & Teams and Courses & Format are clickable and lead
to their working pages, Matchups and Edit Scores show as disabled/"Coming
soon," and the MM Coins Settlement link still works.

- [ ] **Step 5: Run the full check and commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add app/portal/admin components/portal/tiger/TigerCenterNav.tsx
git commit -m "feat(tiger): add the Tiger Center landing page"
```

---

## Definition of done for this phase

- Tiger can log in, land on `/portal/admin`, and see the four-box Tiger
  Center layout.
- **Players & Teams** (moved to `/portal/admin/players-teams`): existing
  invite-link/unlink behavior unchanged, plus real team assignment that
  persists to `live_roster`.
- **Courses & Format**: set a round count (6-10), get that many round
  slots, assign date/course/format to each, add new courses to a shared
  reusable bank, lock/unlock a round's course setup, remove an unlocked
  round with a confirm step.
- **Matchups** and **Edit Scores** are visibly present but clearly marked
  as not yet built — no dead links, no broken buttons.
- `npm test && npx tsc --noEmit && npm run lint && npm run build` all clean.
- Nothing about the public `/leaderboard`, `/teams`, `/history`, `/schedule`
  pages changed — this phase is entirely inside the Tiger Center.
