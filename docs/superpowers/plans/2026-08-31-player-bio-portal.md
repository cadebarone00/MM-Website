# Player Bio Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player edit their own public bio from the Player Portal, with every change (except account email, which isn't part of this) held for Tiger's approval in the existing Players & Teams tab before it goes live.

**Architecture:** Two new Supabase tables (`player_profile_edits` for pending proposals, `player_profile_overrides` for approved values) sit alongside the existing static `lib/data/players/*.ts` files, which stay the baseline. A new merge helper overlays overrides on top of the static baseline; the public bio page fetches overrides client-side and merges them in, so no existing server/client page needs to change how it loads data. New Route Handlers (player submit, Tiger approve/deny/set) all follow this codebase's established pattern: `requirePlayer()`/`requireHost()` gate, then a service-role Supabase write.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), TypeScript, `node:test` for unit tests (`npm test` runs `tsx --test {lib,app}/**/*.test.{ts,mts}`).

**Spec:** `docs/superpowers/specs/2026-08-30-player-bio-portal-design.md`

## Global Constraints

- Every DB write happens server-side via `createSupabaseServiceRoleClient()` inside a Route Handler gated by `requirePlayer()` or `requireHost()` — never a direct client-side write, matching every existing Tiger Center phase.
- `player_profile_edits` and `player_profile_overrides` are public-read (RLS `for select using (true)`), no insert/update policy — same "public read, service-role writes" pattern as `live_courses`/`live_roster`/etc.
- Editable fields are exactly the 29 in `EDITABLE_PLAYER_FIELDS` (Task 2) — `id`, `slug`, and `fullName` are never editable through this system.
- `history` is the one array-typed field; every other editable field is a plain string (`avatarSrc` is `string | null`).
- `getPlayerDisplayName`/`getPlayerAvatar`/`getPlayerProfile`'s other ~30 call sites across the site are explicitly out of scope — only `PlayerBioSection` and the new Portal/Tiger Center screens read live overrides.

---

## Task 1: Database schema

**Files:**
- Modify: `supabase/schema.sql` (append at end of file)

**Interfaces:**
- Produces: `player_profile_edits(player_slug, field, proposed_value, submitted_at)`, `player_profile_overrides(player_slug, field, value, updated_at)`, RPC function `approve_profile_edit(p_player_slug text, p_field text)` — all consumed by Tasks 2–7.

- [ ] **Step 1: Append the new schema section**

Add this to the end of `supabase/schema.sql`:

```sql
-- === Player Bio Portal ===================================================
-- Lets a player edit their own public bio; every change needs Tiger's
-- approval before it's live (email isn't part of this — that's a Supabase
-- Auth setting). player_profile_edits is the pending queue a player writes
-- to and Tiger clears; player_profile_overrides is what the public bio page
-- reads on top of the static lib/data/players/*.ts baseline once approved.

create table if not exists player_profile_edits (
  player_slug text not null references player_slots(player_slug),
  field text not null,
  proposed_value jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (player_slug, field)
);

create table if not exists player_profile_overrides (
  player_slug text not null references player_slots(player_slug),
  field text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (player_slug, field)
);

alter table player_profile_edits enable row level security;
alter table player_profile_overrides enable row level security;

-- Both readable by anyone — matches the live_* tables' existing pattern.
-- The public bio page reads overrides with no auth; a player's own pending
-- edits aren't sensitive either. Writes happen server-side with the
-- service-role key, same as everywhere else.
drop policy if exists player_profile_edits_select_all on player_profile_edits;
create policy player_profile_edits_select_all on player_profile_edits for select using (true);

drop policy if exists player_profile_overrides_select_all on player_profile_overrides;
create policy player_profile_overrides_select_all on player_profile_overrides for select using (true);

-- Approving is two writes (move the value to overrides, clear the pending
-- row) that must happen together — a SECURITY DEFINER function, same
-- reasoning as settle_mm_coin_market's atomicity above. The upsert's ON
-- CONFLICT matters because a player can have an older override for a field
-- that's now being re-approved after a second edit.
create or replace function approve_profile_edit(p_player_slug text, p_field text)
returns void as $$
declare
  affected integer;
begin
  insert into player_profile_overrides (player_slug, field, value, updated_at)
  select player_slug, field, proposed_value, now()
  from player_profile_edits
  where player_slug = p_player_slug and field = p_field
  on conflict (player_slug, field) do update set value = excluded.value, updated_at = excluded.updated_at;

  -- GET DIAGNOSTICS, not a `returning ... into` boolean: when the select
  -- above matches zero rows, the insert affects zero rows too, and a
  -- `returning true into` variable would stay NULL rather than false —
  -- `if not <null>` is itself NULL and silently skips the raise. Row count
  -- doesn't have that trap.
  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'No pending edit for % / %', p_player_slug, p_field;
  end if;

  delete from player_profile_edits where player_slug = p_player_slug and field = p_field;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Run it in Supabase**

This is a manual step, same as every prior phase's schema change (per
`docs/supabase-setup.md`): open the Supabase project's SQL Editor, paste
the **entire** `supabase/schema.sql` file (not just the new section — it's
idempotent, safe to re-run), click Run. Confirm no errors, and that
`player_profile_edits` and `player_profile_overrides` now appear under
Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add player_profile_edits/overrides tables and approve_profile_edit RPC"
```

---

## Task 2: Editable-field allowlist and profile merge helper

**Files:**
- Create: `lib/data/players/overrides.ts`
- Test: `lib/data/players/overrides.test.ts`

**Interfaces:**
- Consumes: `PlayerProfile` type from `../types`.
- Produces: `EDITABLE_PLAYER_FIELDS: readonly string[]`, `type EditableField`, `isEditableField(field: string): field is EditableField`, `mergeProfile(base: PlayerProfile, overrides: Partial<PlayerProfile>): PlayerProfile`, `getProfileOverrides(playerSlug: string): Promise<Partial<PlayerProfile>>` — all four consumed by Tasks 3–7 and 9–12.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/data/players/overrides.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isEditableField, mergeProfile, EDITABLE_PLAYER_FIELDS } from "./overrides.ts";
import type { PlayerProfile } from "../types.ts";

test("isEditableField accepts every field in EDITABLE_PLAYER_FIELDS", () => {
  for (const field of EDITABLE_PLAYER_FIELDS) {
    assert.equal(isEditableField(field), true);
  }
});

test("isEditableField rejects structural fields and unknown strings", () => {
  assert.equal(isEditableField("id"), false);
  assert.equal(isEditableField("slug"), false);
  assert.equal(isEditableField("fullName"), false);
  assert.equal(isEditableField("notAField"), false);
});

test("mergeProfile overlays overrides on top of the base profile, leaving untouched fields alone", () => {
  const base: PlayerProfile = {
    id: "Test",
    slug: "test-player",
    fullName: "Test Player",
    avatarSrc: null,
    bio: "Original bio.",
    history: ["Debut 2024"],
    hometown: "Nowhere",
  };

  const merged = mergeProfile(base, { bio: "Updated bio.", hometown: "Somewhere" });

  assert.equal(merged.bio, "Updated bio.");
  assert.equal(merged.hometown, "Somewhere");
  assert.equal(merged.fullName, "Test Player");
  assert.deepEqual(merged.history, ["Debut 2024"]);
});

test("mergeProfile with no overrides returns the base profile's values unchanged", () => {
  const base: PlayerProfile = {
    id: "Test",
    slug: "test-player",
    fullName: "Test Player",
    avatarSrc: null,
    bio: "Original bio.",
    history: [],
  };

  const merged = mergeProfile(base, {});
  assert.deepEqual(merged, base);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test lib/data/players/overrides.test.ts`
Expected: FAIL — `overrides.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// lib/data/players/overrides.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { PlayerProfile } from "../types";

// Every PlayerProfile field a player can propose a change to — everything
// shown on their public bio (PlayerBioSection) plus their photo. `id`,
// `slug`, and `fullName` are structural/identity fields and are never
// editable through this system.
export const EDITABLE_PLAYER_FIELDS = [
  "bio",
  "avatarSrc",
  "history",
  "instagram",
  "linkedin",
  "nickname",
  "classYear",
  "major",
  "occupation",
  "hometown",
  "residence",
  "playsFrom",
  "status",
  "clubGolfYears",
  "college",
  "height",
  "weight",
  "age",
  "birthday",
  "handicap",
  "rankingNotes",
  "debut",
  "debutLocation",
  "strengths",
  "careerHighlights",
  "personal",
  "hobbies",
  "goals",
  "misc",
] as const;

export type EditableField = (typeof EDITABLE_PLAYER_FIELDS)[number];

export function isEditableField(field: string): field is EditableField {
  return (EDITABLE_PLAYER_FIELDS as readonly string[]).includes(field);
}

export function mergeProfile(base: PlayerProfile, overrides: Partial<PlayerProfile>): PlayerProfile {
  return { ...base, ...overrides };
}

/** Reads every approved override for one player. Public data — no auth required to call this. */
export async function getProfileOverrides(playerSlug: string): Promise<Partial<PlayerProfile>> {
  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("player_profile_overrides").select("field, value").eq("player_slug", playerSlug);

  const overrides: Record<string, unknown> = {};
  for (const row of data ?? []) {
    if (isEditableField(row.field)) {
      overrides[row.field] = row.value;
    }
  }
  return overrides as Partial<PlayerProfile>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/data/players/overrides.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/data/players/overrides.ts lib/data/players/overrides.test.ts
git commit -m "feat: add editable-field allowlist and profile override merge helper"
```

---

## Task 3: Public overrides read endpoint

**Files:**
- Create: `app/api/players/[slug]/overrides/route.ts`

**Interfaces:**
- Consumes: `getProfileOverrides` from Task 2.
- Produces: `GET /api/players/[slug]/overrides` → `{ ok: true, overrides: Partial<PlayerProfile> }`, consumed by Task 8 (`PlayerBioSection`).

- [ ] **Step 1: Write the implementation**

```ts
// app/api/players/[slug]/overrides/route.ts
import { NextResponse } from "next/server";
import { getProfileOverrides } from "@/lib/data/players/overrides";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const overrides = await getProfileOverrides(slug);
  return NextResponse.json({ ok: true, overrides }, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification**

This route needs a live Supabase connection to return real data (no test
DB in this project — matches the existing convention of not unit-testing
simple DB-backed GETs, e.g. `courses/route.ts`'s `GET` has no test either).
Verify once Task 1's schema is live: `curl http://localhost:3000/api/players/nate/overrides`
should return `{"ok":true,"overrides":{}}` before any edits exist.

- [ ] **Step 4: Commit**

```bash
git add app/api/players/[slug]/overrides/route.ts
git commit -m "feat: add public GET endpoint for a player's approved profile overrides"
```

---

## Task 4: Player-side profile read/submit endpoint

**Files:**
- Modify: `app/api/portal/profile/route.ts` (replace entirely — the existing `GET` calls the retired Python backend via `PYTHON_API_URL`, which is unset and always 502s; this task removes that dependency)
- Test: `app/api/portal/profile/route.test.ts` (new)

**Interfaces:**
- Consumes: `requirePlayer` from `@/lib/portal/requirePlayer`, `getPlayerProfileBySlug` from `@/lib/data/players`, `getProfileOverrides`/`mergeProfile`/`isEditableField` from Task 2, `createSupabaseServiceRoleClient` from `@/lib/supabase/server`.
- Produces: `GET /api/portal/profile` → `{ ok: true, profile: PlayerProfile, pendingEdits: { field: string; proposedValue: string | string[]; submittedAt: string }[] }`; `POST /api/portal/profile` with body `{ edits: { field: string; value: string | string[] }[] }` → `{ ok: true }`. Consumed by Task 10 (`/portal/profile` page and `ProfileEditGrid`).

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/portal/profile/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /api/portal/profile rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  await assert.rejects(() => GET());
});

test("POST /api/portal/profile rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/profile", {
    method: "POST",
    body: JSON.stringify({ edits: [{ field: "bio", value: "Test bio." }] }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test app/api/portal/profile/route.test.ts`
Expected: FAIL — current `route.ts` has no `POST` export, and its `GET` doesn't reject the way the new one will (it currently returns a 502 JSON response rather than throwing).

- [ ] **Step 3: Write the implementation**

```ts
// app/api/portal/profile/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getProfileOverrides, isEditableField, mergeProfile } from "@/lib/data/players/overrides";

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const baseProfile = getPlayerProfileBySlug(player.playerSlug);
  if (!baseProfile) {
    return NextResponse.json({ ok: false, error: "No profile found for this player." }, { status: 404 });
  }

  const overrides = await getProfileOverrides(player.playerSlug);
  const profile = mergeProfile(baseProfile, overrides);

  const service = createSupabaseServiceRoleClient();
  const { data: pending } = await service
    .from("player_profile_edits")
    .select("field, proposed_value, submitted_at")
    .eq("player_slug", player.playerSlug);

  return NextResponse.json(
    {
      ok: true,
      profile,
      pendingEdits: (pending ?? []).map((row) => ({
        field: row.field as string,
        proposedValue: row.proposed_value as string | string[],
        submittedAt: row.submitted_at as string,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

interface EditInput {
  field: string;
  value: string | string[];
}

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { edits } = (await request.json()) as { edits?: EditInput[] };
  if (!Array.isArray(edits) || edits.length === 0) {
    return NextResponse.json({ ok: false, error: "No edits submitted." }, { status: 400 });
  }
  for (const edit of edits) {
    if (!edit || typeof edit.field !== "string" || !isEditableField(edit.field)) {
      return NextResponse.json({ ok: false, error: `"${edit?.field}" isn't an editable field.` }, { status: 400 });
    }
    if (typeof edit.value !== "string" && !Array.isArray(edit.value)) {
      return NextResponse.json({ ok: false, error: `Invalid value for "${edit.field}".` }, { status: 400 });
    }
  }

  const service = createSupabaseServiceRoleClient();
  const rows = edits.map((edit) => ({
    player_slug: player.playerSlug,
    field: edit.field,
    proposed_value: edit.value,
    submitted_at: new Date().toISOString(),
  }));
  const { error } = await service.from("player_profile_edits").upsert(rows, { onConflict: "player_slug,field" });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save your changes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test app/api/portal/profile/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — this also confirms nothing else still imports `callPythonApi`/`WhoamiResponse` from this file.

- [ ] **Step 6: Commit**

```bash
git add app/api/portal/profile/route.ts app/api/portal/profile/route.test.ts
git commit -m "feat: replace dead Python-backed profile stub with native submit/read endpoint"
```

---

## Task 5: Tiger approve endpoint

**Files:**
- Create: `app/api/portal/tiger/profile-edits/approve/route.ts`
- Test: `app/api/portal/tiger/profile-edits/approve/route.test.ts`

**Interfaces:**
- Consumes: `requireHost` from `@/lib/portal/requireHost`, `createSupabaseServiceRoleClient`, and the `approve_profile_edit` RPC from Task 1.
- Produces: `POST /api/portal/tiger/profile-edits/approve` with body `{ playerSlug: string; field: string }` → `{ ok: true }`. Consumed by Task 12.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/portal/tiger/profile-edits/approve/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/profile-edits/approve rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/profile-edits/approve", {
    method: "POST",
    body: JSON.stringify({ playerSlug: "test-player", field: "bio" }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/profile-edits/approve/route.test.ts`
Expected: FAIL — file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// app/api/portal/tiger/profile-edits/approve/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, field } = await request.json();
  if (typeof playerSlug !== "string" || typeof field !== "string") {
    return NextResponse.json({ ok: false, error: "Missing playerSlug or field." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.rpc("approve_profile_edit", { p_player_slug: playerSlug, p_field: field });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not approve that edit." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/profile-edits/approve/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/profile-edits/approve/route.ts app/api/portal/tiger/profile-edits/approve/route.test.ts
git commit -m "feat: add Tiger approve-profile-edit endpoint"
```

---

## Task 6: Tiger deny endpoint

**Files:**
- Create: `app/api/portal/tiger/profile-edits/deny/route.ts`
- Test: `app/api/portal/tiger/profile-edits/deny/route.test.ts`

**Interfaces:**
- Consumes: `requireHost`, `createSupabaseServiceRoleClient`.
- Produces: `POST /api/portal/tiger/profile-edits/deny` with body `{ playerSlug: string; field: string }` → `{ ok: true }`. Consumed by Task 12.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/portal/tiger/profile-edits/deny/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/profile-edits/deny rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/profile-edits/deny", {
    method: "POST",
    body: JSON.stringify({ playerSlug: "test-player", field: "bio" }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/profile-edits/deny/route.test.ts`
Expected: FAIL — file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// app/api/portal/tiger/profile-edits/deny/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, field } = await request.json();
  if (typeof playerSlug !== "string" || typeof field !== "string") {
    return NextResponse.json({ ok: false, error: "Missing playerSlug or field." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("player_profile_edits").delete().eq("player_slug", playerSlug).eq("field", field);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not deny that edit." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/profile-edits/deny/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/profile-edits/deny/route.ts app/api/portal/tiger/profile-edits/deny/route.test.ts
git commit -m "feat: add Tiger deny-profile-edit endpoint"
```

---

## Task 7: Tiger direct-set endpoint

**Files:**
- Create: `app/api/portal/tiger/profile-edits/set/route.ts`
- Test: `app/api/portal/tiger/profile-edits/set/route.test.ts`

**Interfaces:**
- Consumes: `requireHost`, `createSupabaseServiceRoleClient`, `isEditableField` from Task 2.
- Produces: `POST /api/portal/tiger/profile-edits/set` with body `{ playerSlug: string; field: string; value: string | string[] }` → `{ ok: true }`. Consumed by Task 12. Tiger's own direct edit — writes straight to `player_profile_overrides`, no approval step, and clears any pending edit for that field.

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/portal/tiger/profile-edits/set/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/profile-edits/set rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/profile-edits/set", {
    method: "POST",
    body: JSON.stringify({ playerSlug: "test-player", field: "bio", value: "New bio." }),
  });
  await assert.rejects(() => POST(request));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/profile-edits/set/route.test.ts`
Expected: FAIL — file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// app/api/portal/tiger/profile-edits/set/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isEditableField } from "@/lib/data/players/overrides";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, field, value } = await request.json();
  if (typeof playerSlug !== "string" || typeof field !== "string" || !isEditableField(field)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid playerSlug/field." }, { status: 400 });
  }
  if (typeof value !== "string" && !Array.isArray(value)) {
    return NextResponse.json({ ok: false, error: "Invalid value." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error: upsertError } = await service
    .from("player_profile_overrides")
    .upsert({ player_slug: playerSlug, field, value, updated_at: new Date().toISOString() }, { onConflict: "player_slug,field" });
  if (upsertError) {
    return NextResponse.json({ ok: false, error: "Could not save that change." }, { status: 500 });
  }

  await service.from("player_profile_edits").delete().eq("player_slug", playerSlug).eq("field", field);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/profile-edits/set/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/profile-edits/set/route.ts app/api/portal/tiger/profile-edits/set/route.test.ts
git commit -m "feat: add Tiger direct-set-profile-field endpoint"
```

---

## Task 8: Make the public bio page reflect approved overrides

**Files:**
- Modify: `components/scorecard/PlayerBioSection.tsx`

**Interfaces:**
- Consumes: `GET /api/players/[slug]/overrides` from Task 3.
- Produces: no signature change — still `<PlayerBioSection profile={PlayerProfile | undefined} />`, same as every existing call site.

- [ ] **Step 1: Modify the component**

The file keeps its `InfoRow`, `InfoBlock`, and `isSet` helpers unchanged.
Only the exported component changes:

```tsx
// components/scorecard/PlayerBioSection.tsx (top of file)
"use client";

import { useEffect, useState } from "react";
import { SocialLinks } from "@/components/ui/SocialLinks";
import type { PlayerProfile } from "@/lib/data/types";

// ... InfoRow, InfoBlock, isSet unchanged ...

/**
 * The merged "one bio per player" section — replaces the separate bio page
 * that used to live at /teams/[team]/[player]. Everything real from that
 * profile (background, location, golf details, personal notes, career
 * highlights, and the full write-up) lives here now, directly below the
 * Statistics section on this same page.
 *
 * Fetches this player's approved edits (see the Player Bio Portal spec)
 * client-side on mount and overlays them on the static baseline — this
 * works identically whether the page rendered statically or client-side
 * (the live tournament path), so no parent component needs to change.
 */
export function PlayerBioSection({ profile: baseProfile }: { profile: PlayerProfile | undefined }) {
  const [profile, setProfile] = useState(baseProfile);

  useEffect(() => {
    setProfile(baseProfile);
    if (!baseProfile) return;
    let cancelled = false;
    fetch(`/api/players/${baseProfile.slug}/overrides`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.ok) return;
        setProfile((current) => (current ? { ...current, ...data.overrides } : current));
      })
      .catch(() => {
        // Overrides are an enhancement, not required for the page to work —
        // a failed fetch just leaves the static baseline showing.
      });
    return () => {
      cancelled = true;
    };
  }, [baseProfile]);

  if (!profile) return null;

  const hasNotes = [profile.strengths, profile.careerHighlights, profile.personal, profile.hobbies, profile.goals, profile.misc].some(isSet);

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="m-0 font-serif text-2xl font-bold text-maroon-700">Player Bio</h2>
        {(profile.instagram || profile.linkedin) && <SocialLinks instagram={profile.instagram} linkedin={profile.linkedin} />}
      </div>

      <div className="rounded-md border border-ink-100 bg-white p-5">
        {isSet(profile.bio) && <p className="mb-5 font-sans text-sm leading-relaxed text-ink-700">{profile.bio}</p>}

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <InfoRow label="Class Year" value={profile.classYear} />
          <InfoRow label="Major" value={profile.major} />
          <InfoRow label="Occupation" value={profile.occupation} />
          <InfoRow label="Hometown" value={profile.hometown} />
          <InfoRow label="College" value={profile.college} />
          <InfoRow label="Residence" value={profile.residence} />
          <InfoRow label="Plays From" value={profile.playsFrom} />
          <InfoRow label="Status" value={profile.status} />
          <InfoRow label="Handicap" value={profile.handicap} />
          <InfoRow label="Ranking" value={profile.rankingNotes} />
          <InfoRow label="Club Golf" value={profile.clubGolfYears} />
          <InfoRow label="Debut" value={profile.debut} />
          <InfoRow label="Debut Location" value={profile.debutLocation} />
          <InfoRow label="Height" value={profile.height} />
          <InfoRow label="Weight" value={profile.weight} />
          <InfoRow label="Age" value={profile.age} />
          <InfoRow label="Birthday" value={profile.birthday} />
          <InfoRow label="Nickname" value={profile.nickname} />
        </div>

        {hasNotes && (
          <div className="mt-5 grid gap-4 border-t border-ink-100 pt-5 sm:grid-cols-2">
            <InfoBlock label="Strengths" value={profile.strengths} />
            <InfoBlock label="Career Highlights" value={profile.careerHighlights} />
            <InfoBlock label="Family" value={profile.personal} />
            <InfoBlock label="Hobbies" value={profile.hobbies} />
            <InfoBlock label="Goals" value={profile.goals} />
            <InfoBlock label="Misc" value={profile.misc} />
          </div>
        )}

        {profile.history && profile.history.length > 0 && (
          <div className="mt-5 border-t border-ink-100 pt-5">
            <div className="mb-2 font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">Maroon Masters History</div>
            <ul className="m-0 space-y-1 pl-5">
              {profile.history.map((h, i) => (
                <li key={i} className="font-sans text-sm text-ink-700">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open a player's scorecard page (e.g.
`/leaderboard/2026-palm-springs/players/nate`), confirm the bio section
still renders exactly as before (no overrides exist yet, so it should be
visually identical to pre-change). Check the browser network tab for a
`GET /api/players/nate/overrides` request returning `{"ok":true,"overrides":{}}`.

- [ ] **Step 4: Commit**

```bash
git add components/scorecard/PlayerBioSection.tsx
git commit -m "feat: have the public bio section overlay approved profile edits"
```

---

## Task 9: Profile edit grid (the "box clicker")

**Files:**
- Create: `components/portal/ProfileEditGrid.tsx`

**Interfaces:**
- Consumes: `POST /api/portal/profile` from Task 4.
- Produces: `<ProfileEditGrid profile={PlayerProfile} pendingEdits={PendingEdit[]} />`, consumed by Task 10.

- [ ] **Step 1: Write the implementation**

```tsx
// components/portal/ProfileEditGrid.tsx
"use client";

import { useState } from "react";
import type { PlayerProfile } from "@/lib/data/types";

export interface PendingEdit {
  field: string;
  proposedValue: string | string[];
  submittedAt: string;
}

interface FieldSpec {
  key: keyof PlayerProfile;
  label: string;
  multiline?: boolean;
}

interface Section {
  key: string;
  title: string;
  fields: FieldSpec[];
}

const SECTIONS: Section[] = [
  { key: "bio", title: "Bio Text", fields: [{ key: "bio", label: "Bio", multiline: true }] },
  {
    key: "facts",
    title: "Bio Facts",
    fields: [
      { key: "classYear", label: "Class Year" },
      { key: "major", label: "Major" },
      { key: "occupation", label: "Occupation" },
      { key: "hometown", label: "Hometown" },
      { key: "college", label: "College" },
      { key: "residence", label: "Residence" },
      { key: "playsFrom", label: "Plays From" },
      { key: "status", label: "Status" },
      { key: "handicap", label: "Handicap" },
      { key: "rankingNotes", label: "Ranking" },
      { key: "clubGolfYears", label: "Club Golf" },
      { key: "debut", label: "Debut" },
      { key: "debutLocation", label: "Debut Location" },
      { key: "height", label: "Height" },
      { key: "weight", label: "Weight" },
      { key: "age", label: "Age" },
      { key: "birthday", label: "Birthday" },
      { key: "nickname", label: "Nickname" },
    ],
  },
  {
    key: "notes",
    title: "Notes",
    fields: [
      { key: "strengths", label: "Strengths", multiline: true },
      { key: "careerHighlights", label: "Career Highlights", multiline: true },
      { key: "personal", label: "Family", multiline: true },
      { key: "hobbies", label: "Hobbies", multiline: true },
      { key: "goals", label: "Goals", multiline: true },
      { key: "misc", label: "Misc", multiline: true },
    ],
  },
  { key: "history", title: "History", fields: [{ key: "history", label: "One per line", multiline: true }] },
  { key: "photo", title: "Photo", fields: [{ key: "avatarSrc", label: "Photo URL" }] },
  {
    key: "social",
    title: "Social Links",
    fields: [
      { key: "instagram", label: "Instagram URL" },
      { key: "linkedin", label: "LinkedIn URL" },
    ],
  },
];

function toFieldValue(profile: PlayerProfile, key: keyof PlayerProfile): string {
  const value = profile[key];
  if (Array.isArray(value)) return value.join("\n");
  return typeof value === "string" ? value : "";
}

function fromFieldValue(key: keyof PlayerProfile, raw: string): string | string[] {
  if (key === "history") {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return raw;
}

export function ProfileEditGrid({ profile, pendingEdits }: { profile: PlayerProfile; pendingEdits: PendingEdit[] }) {
  const [pendingByField, setPendingByField] = useState(new Map(pendingEdits.map((e) => [e.field, e])));
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  function openSectionFor(section: Section) {
    const initial: Record<string, string> = {};
    for (const field of section.fields) {
      const pending = pendingByField.get(field.key as string);
      initial[field.key as string] = pending
        ? Array.isArray(pending.proposedValue)
          ? pending.proposedValue.join("\n")
          : pending.proposedValue
        : toFieldValue(profile, field.key);
    }
    setValues(initial);
    setError(null);
    setSavedSection(null);
    setOpenSection(section.key);
  }

  async function handleSave(section: Section) {
    setSaving(true);
    setError(null);
    try {
      const edits = section.fields.map((field) => ({
        field: field.key as string,
        value: fromFieldValue(field.key, values[field.key as string] ?? ""),
      }));
      const res = await fetch("/api/portal/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not save your changes.");
        return;
      }
      setPendingByField((current) => {
        const next = new Map(current);
        for (const edit of edits) {
          next.set(edit.field, { field: edit.field, proposedValue: edit.value, submittedAt: new Date().toISOString() });
        }
        return next;
      });
      setSavedSection(section.key);
    } finally {
      setSaving(false);
    }
  }

  const activeSection = SECTIONS.find((s) => s.key === openSection) ?? null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => openSectionFor(section)}
            className="cursor-pointer rounded-md border border-ink-200 bg-white px-4 py-6 text-center font-sans text-sm font-semibold text-maroon-700 hover:border-maroon-400"
          >
            {section.title}
          </button>
        ))}
      </div>

      {activeSection && (
        <div className="mt-6 rounded-md border border-ink-100 bg-white p-5">
          <h2 className="m-0 font-serif text-xl font-bold text-maroon-700">{activeSection.title}</h2>
          {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
          {savedSection === activeSection.key && (
            <p className="mt-3 rounded-sm bg-cream-100 px-3 py-2 font-sans text-sm text-ink-700">Saved — waiting on Tiger&rsquo;s approval.</p>
          )}
          <div className="mt-4 flex flex-col gap-4">
            {activeSection.fields.map((field) => {
              const pending = pendingByField.get(field.key as string);
              const currentDisplay = toFieldValue(profile, field.key);
              return (
                <div key={field.key as string}>
                  <label className="font-condensed text-3xs font-semibold uppercase tracking-eyebrow text-ink-400">{field.label}</label>
                  {pending && (
                    <p className="mt-1 font-sans text-xs text-ink-500">
                      Current: {currentDisplay || "—"} · Pending approval:{" "}
                      {Array.isArray(pending.proposedValue) ? pending.proposedValue.join(", ") : pending.proposedValue}
                    </p>
                  )}
                  {field.multiline ? (
                    <textarea
                      value={values[field.key as string] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key as string]: e.target.value }))}
                      rows={field.key === "bio" ? 6 : 3}
                      className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={values[field.key as string] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key as string]: e.target.value }))}
                      className="mt-1 w-full rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(activeSection)}
            className="mt-4 cursor-pointer rounded-pill bg-maroon-700 px-5 py-2 font-sans text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/portal/ProfileEditGrid.tsx
git commit -m "feat: add the profile edit grid (box clicker) component"
```

---

## Task 10: Portal profile page + link from the Portal home screen

**Files:**
- Create: `app/portal/profile/page.tsx`
- Modify: `app/portal/page.tsx` (add a link to the new page)

**Interfaces:**
- Consumes: `ProfileEditGrid` from Task 9, `getProfileOverrides`/`mergeProfile` from Task 2.
- Produces: the `/portal/profile` route.

- [ ] **Step 1: Write the page**

```tsx
// app/portal/profile/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getProfileOverrides, mergeProfile } from "@/lib/data/players/overrides";
import { ProfileEditGrid } from "@/components/portal/ProfileEditGrid";

export default async function PortalProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("player_slug").eq("id", user.id).single();
  if (!profileRow?.player_slug) redirect("/portal");

  const baseProfile = getPlayerProfileBySlug(profileRow.player_slug);
  if (!baseProfile) redirect("/portal");

  const overrides = await getProfileOverrides(profileRow.player_slug);
  const profile = mergeProfile(baseProfile, overrides);

  const service = createSupabaseServiceRoleClient();
  const { data: pending } = await service
    .from("player_profile_edits")
    .select("field, proposed_value, submitted_at")
    .eq("player_slug", profileRow.player_slug);

  const pendingEdits = (pending ?? []).map((row) => ({
    field: row.field as string,
    proposedValue: row.proposed_value as string | string[],
    submittedAt: row.submitted_at as string,
  }));

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <Link href="/portal" className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500 hover:text-maroon-700">
        ← Back to Portal
      </Link>
      <h1 className="mt-4 font-serif text-2xl font-bold text-ink-900">Edit My Bio</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">Changes you save here need Tiger&rsquo;s approval before they show up on your public bio.</p>
      <div className="mt-6">
        <ProfileEditGrid profile={profile} pendingEdits={pendingEdits} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add a link from the Portal home screen**

In `app/portal/page.tsx`, add a link near the existing scoring panel. Find
this block:

```tsx
      <div className="w-full max-w-[640px] text-left">
        <PlayerScoringPanel />
      </div>
```

Replace it with:

```tsx
      <div className="w-full max-w-[640px] text-left">
        <PlayerScoringPanel />
      </div>
      <Link href="/portal/profile" className="font-sans text-sm font-semibold text-maroon-700 hover:underline">
        Edit My Bio →
      </Link>
```

And add the import at the top of the file:

```tsx
import Link from "next/link";
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification**

Log in as a player account (or use an existing test account), visit
`/portal`, click "Edit My Bio →", confirm `/portal/profile` loads with the
box grid, click a box, confirm the form pre-fills with current values,
change one field, Save, confirm the "Saved — waiting on Tiger's approval"
message appears and the field now shows a "Pending approval" line.

- [ ] **Step 5: Commit**

```bash
git add app/portal/profile/page.tsx app/portal/page.tsx
git commit -m "feat: add /portal/profile page and link it from the Portal home screen"
```

---

## Task 11: Tiger's approval queue in Players & Teams

**Files:**
- Modify: `components/portal/PlayerSlotsAdmin.tsx`
- Modify: `app/portal/admin/players-teams/page.tsx`

**Interfaces:**
- Consumes: `POST /api/portal/tiger/profile-edits/{approve,deny,set}` from Tasks 5–7 — `set` is Tiger's own always-available direct edit, independent of any pending queue, so every row gets an "Edit directly" affordance, not just rows with pending edits.
- Produces: no new exports — extends the existing `PlayerSlotAdminRow` shape with pending-edit data.

- [ ] **Step 1: Extend the page to fetch pending edits**

In `app/portal/admin/players-teams/page.tsx`, after the existing `roster`
query, add:

```tsx
  const { data: pendingRows } = await service
    .from("player_profile_edits")
    .select("player_slug, field, proposed_value, submitted_at");
  const pendingBySlug = new Map<string, { field: string; proposedValue: string | string[]; submittedAt: string }[]>();
  for (const row of pendingRows ?? []) {
    const list = pendingBySlug.get(row.player_slug) ?? [];
    list.push({ field: row.field, proposedValue: row.proposed_value, submittedAt: row.submitted_at });
    pendingBySlug.set(row.player_slug, list);
  }
```

Then update the `rows` mapping to include it:

```tsx
  const rows: PlayerSlotAdminRow[] = playerProfiles.map((p) => ({
    playerSlug: p.slug,
    fullName: p.fullName,
    username: byslug.get(p.slug)?.username ?? null,
    claimedBy: byslug.get(p.slug)?.claimed_by ?? null,
    team: rosterBySlug.get(p.slug) ?? null,
    pendingEdits: pendingBySlug.get(p.slug) ?? [],
  }));
```

- [ ] **Step 2: Extend `PlayerSlotsAdmin` with the approval dropdown**

Add the pending-edit type and extend the row interface at the top of
`components/portal/PlayerSlotsAdmin.tsx`:

```tsx
interface PendingProfileEdit {
  field: string;
  proposedValue: string | string[];
  submittedAt: string;
}

export interface PlayerSlotAdminRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
  team: "maroon" | "white" | null;
  pendingEdits: PendingProfileEdit[];
}
```

Add expand state and action handlers inside the component, alongside the
existing `busy`/`copiedSlug`/`error` state:

```tsx
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [rows, setRowsState] = useState(initialRows);

  async function handleApprove(playerSlug: string, field: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, field }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) =>
        current.map((r) => (r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== field) } : r))
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDeny(playerSlug: string, field: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, field }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) =>
        current.map((r) => (r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== field) } : r))
      );
    } finally {
      setBusy(null);
    }
  }

  const [directEditSlug, setDirectEditSlug] = useState<string | null>(null);
  const [directEditField, setDirectEditField] = useState("bio");
  const [directEditValue, setDirectEditValue] = useState("");
  const [directEditSaved, setDirectEditSaved] = useState(false);

  async function handleSet(playerSlug: string) {
    setBusy(playerSlug);
    setError(null);
    setDirectEditSaved(false);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerSlug,
          field: directEditField,
          value: directEditField === "history" ? directEditValue.split("\n").map((line) => line.trim()).filter(Boolean) : directEditValue,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      // A direct set also clears any pending edit for that field server-side.
      setRowsState((current) =>
        current.map((r) =>
          r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== directEditField) } : r
        )
      );
      setDirectEditSaved(true);
      setDirectEditValue("");
    } finally {
      setBusy(null);
    }
  }
```

Rename the existing `rows` prop parameter to `initialRows` in the function
signature (`export function PlayerSlotsAdmin({ rows: initialRows }: { rows: PlayerSlotAdminRow[] })`)
so the new local `rows` state (above) is what the table renders — this is
necessary because approving/denying needs to update the list client-side
without a full page reload, unlike the existing unlink/team actions which
already `window.location.reload()`.

Add a "Pending" column and an expandable row. Replace the existing table
body's `<tbody>` block with:

```tsx
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.playerSlug}>
              <tr className="border-b border-ink-100">
                <td className="py-2">{row.fullName}</td>
                <td className="py-2 font-mono">{row.username ?? "—"}</td>
                <td className="py-2">{row.claimedBy ? "Claimed" : "Open"}</td>
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
                <td className="py-2 text-right">
                  {row.pendingEdits.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedSlug((current) => (current === row.playerSlug ? null : row.playerSlug))}
                      className="mr-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                    >
                      {row.pendingEdits.length} pending
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDirectEditSlug((current) => (current === row.playerSlug ? null : row.playerSlug));
                      setDirectEditSaved(false);
                      setError(null);
                    }}
                    className="mr-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline"
                  >
                    Edit directly
                  </button>
                  {row.claimedBy ? (
                    <button
                      type="button"
                      disabled={busy === row.playerSlug}
                      onClick={() => handleUnlink(row.playerSlug)}
                      className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                    >
                      Unlink
                    </button>
                  ) : row.username ? (
                    <button
                      type="button"
                      onClick={() => handleCopyLink(row.playerSlug, row.username!)}
                      className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                    >
                      {copiedSlug === row.playerSlug ? "Copied!" : "Copy Invite Link"}
                    </button>
                  ) : null}
                </td>
              </tr>
              {expandedSlug === row.playerSlug && row.pendingEdits.length > 0 && (
                <tr key={`${row.playerSlug}-pending`} className="border-b border-ink-100 bg-cream-50">
                  <td colSpan={5} className="py-3">
                    <div className="flex flex-col gap-2 px-2">
                      {row.pendingEdits.map((edit) => (
                        <div key={edit.field} className="flex items-center justify-between gap-3 font-sans text-xs">
                          <span className="font-semibold text-ink-900">{edit.field}</span>
                          <span className="flex-1 text-ink-500">
                            → {Array.isArray(edit.proposedValue) ? edit.proposedValue.join(", ") : edit.proposedValue}
                          </span>
                          <button
                            type="button"
                            disabled={busy === row.playerSlug}
                            onClick={() => handleApprove(row.playerSlug, edit.field)}
                            className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy === row.playerSlug}
                            onClick={() => handleDeny(row.playerSlug, edit.field)}
                            className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline"
                          >
                            Deny
                          </button>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              {directEditSlug === row.playerSlug && (
                <tr key={`${row.playerSlug}-direct-edit`} className="border-b border-ink-100 bg-cream-50">
                  <td colSpan={5} className="py-3">
                    <div className="flex flex-col gap-2 px-2">
                      {directEditSaved && <p className="font-sans text-xs text-ink-700">Saved — live immediately, no approval needed.</p>}
                      <div className="flex items-center gap-2">
                        <select
                          value={directEditField}
                          onChange={(e) => setDirectEditField(e.target.value)}
                          className="border-2 border-stone-300 rounded-lg px-2 py-1 text-xs font-semibold bg-white"
                        >
                          {EDITABLE_PLAYER_FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={directEditValue}
                          onChange={(e) => setDirectEditValue(e.target.value)}
                          placeholder={directEditField === "history" ? "One entry per line" : "New value"}
                          rows={2}
                          className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
                        />
                        <button
                          type="button"
                          disabled={busy === row.playerSlug}
                          onClick={() => handleSet(row.playerSlug)}
                          className="rounded-pill bg-maroon-700 px-3 py-1.5 font-sans text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
```

Add these imports at the top of the file (`Fragment` alongside the
existing `useState` import from `"react"`, plus the new field list):

```tsx
import { Fragment, useState } from "react";
import { EDITABLE_PLAYER_FIELDS } from "@/lib/data/players/overrides";
```

Also update the description text above the table (it currently says
"Profile/bio editing is coming in a later round" — that round is now):

```tsx
      <p className="mt-2 font-sans text-sm text-ink-500">
        Invite players, assign each one to Maroon or White, and review any bio edits waiting on your approval.
      </p>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual verification**

As a host account, submit a bio edit as a test player (Task 10's
verification), then load `/portal/admin/players-teams`, confirm that
player's row shows "1 pending", click it, confirm the field/proposed value
shows with Approve/Deny buttons. Click Approve, confirm the row disappears
and — per Task 8 — the player's public bio page now shows the new value
after a refresh. Separately, click "Edit directly" on any row, pick a
field, enter a value, Save — confirm "Saved — live immediately" shows and
the field updates on that player's public bio page with no approval step.

- [ ] **Step 4: Commit**

```bash
git add components/portal/PlayerSlotsAdmin.tsx app/portal/admin/players-teams/page.tsx
git commit -m "feat: add pending profile-edit approval queue to Players & Teams"
```

---

## Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new ones from Tasks 2, 4, 5, 6, 7.

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npx next build`
Expected: clean typecheck, successful build, no route errors.

- [ ] **Step 3: End-to-end manual walkthrough**

1. As a player: `/portal` → "Edit My Bio →" → open "Bio Facts" → change
   Hometown → Save → confirm "Pending approval" shows.
2. As Tiger: `/portal/admin/players-teams` → click that player's "1
   pending" → see current vs. proposed → Approve.
3. Back on the public site: visit that player's scorecard page, confirm
   the new Hometown value shows in the Bio section.
4. As Tiger again: click "Edit directly" on a different player with no
   pending edits, pick a field, enter a value, Save — confirm it shows up
   on their public bio page without ever appearing in the pending queue.
5. Confirm a denied edit disappears from the queue and the public bio page
   still shows the old value.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify player bio portal end-to-end" --allow-empty
```
