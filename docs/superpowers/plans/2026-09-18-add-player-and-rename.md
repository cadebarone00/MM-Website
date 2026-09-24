# Add Player, Edit Name & Global Players Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Tiger add a brand-new player (name + email, nothing else) and
correct any player's visible name, from a new Global Tools "Players" page —
while the existing per-year Players & Teams page shrinks to just name +
team assignment.

**Architecture:** One new database column (`player_slots.full_name`, an
optional override), one new shared server-only helper that resolves "every
player, static or dynamic, with the right name" once, two new tiny API
routes (`player-add`, `player-name`) mirroring the existing `player-email`
route exactly, and a split of today's single `PlayerSlotsAdmin` component
into a full-featured `GlobalPlayersAdmin` (new Global Tools page) and a
minimal `PlayerTeamAssignment` (the per-year page that's left).

**Tech Stack:** Next.js 16 App Router (Server Components, Route Handlers),
React 19 Client Components, Supabase (service-role reads/writes), `node:test`.

**Spec:** [docs/superpowers/specs/2026-09-18-add-player-and-rename-design.md](../specs/2026-09-18-add-player-and-rename-design.md)

## Global Constraints

- `player_slots.player_slug` is never editable through anything built in
  this plan — it's the one permanent identifier every join/URL/historical
  record uses.
- A name can be corrected; a slug never is.
- Renaming a player does **not** reach the ~60 historical
  leaderboard/scorecard/wagers/broadcast files (frozen historical record by
  this project's existing design) or the live in-progress scorecard page
  (`components/scorecard/LivePlayerScorecard.tsx`) — both explicitly out of
  scope, confirmed with Cade.
- No photo upload, no player-removal/undo tool, no team pre-assignment from
  the Add Player form — all explicitly out of scope.
- Every new route follows the exact `requireHost()` + service-role-client
  shape every existing `tiger/**` route already uses, and gets a
  `route.test.ts` covering only "an unauthenticated request never touches
  Supabase" (the one piece `node:test` can exercise without a real Supabase
  project — the same documented limitation every existing `tiger/**` route
  test already has).
- `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` must
  all stay clean after every task.

---

## Task 1: Migration — `player_slots.full_name`

**Files:**
- Create: `supabase/player_slots_full_name.sql`

**Interfaces:**
- Produces: a nullable `full_name` column on `player_slots`, used by every
  later task in this plan.

- [ ] **Step 1: Write the migration file**

```sql
-- Run once in Supabase after player_slots_email.sql.
-- For a dynamically-added player (no lib/data/players/*.ts file), this
-- IS their name. For one of the 13 hand-written players, null means
-- "use the hand-written file's fullName" (the default, unchanged
-- behavior); a value here overrides it going forward — see the design
-- spec for exactly which pages honor the override.
alter table player_slots add column if not exists full_name text;

comment on column player_slots.full_name is 'Visible display name. Overrides the hand-written PlayerProfile.fullName when set; required for a player with no hand-written file.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/player_slots_full_name.sql
git commit -m "feat: add player_slots.full_name migration"
```

No automated test for a SQL file — matches every prior one-off migration
in this repo (`player_slots_email.sql`, `course_library_location.sql`).
The user runs this once in the Supabase SQL Editor before the rest of this
plan works against a real database; note that in the final task's summary.

---

## Task 2: `computePlayerSlug` — pure slug generator

**Files:**
- Create: `lib/portal/computePlayerSlug.ts`
- Test: `lib/portal/computePlayerSlug.test.ts`

**Interfaces:**
- Produces: `computePlayerSlug(fullName: string): string` — used by Task 5
  (`player-add` route).

- [ ] **Step 1: Write the failing tests**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlayerSlug } from "./computePlayerSlug";

test("kebab-cases a simple two-word name", () => {
  assert.equal(computePlayerSlug("John Smith"), "john-smith");
});

test("collapses extra whitespace between words", () => {
  assert.equal(computePlayerSlug("  John   Smith  "), "john-smith");
});

test("strips punctuation", () => {
  assert.equal(computePlayerSlug("O'Brien Jr."), "obrien-jr");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test lib/portal/computePlayerSlug.test.ts`
Expected: FAIL with a module-not-found error (`computePlayerSlug.ts` doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Deterministically derives a URL-safe, join-safe slug from a player's
 * full name — the same "any player, current or future" spirit as
 * computePlayerUsername. Not guaranteed unique on its own (two "John
 * Smith"s collide); callers append a numeric suffix on conflict.
 */
export function computePlayerSlug(fullName: string): string {
  return fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test lib/portal/computePlayerSlug.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/portal/computePlayerSlug.ts lib/portal/computePlayerSlug.test.ts
git commit -m "feat: add computePlayerSlug for dynamically-added players"
```

---

## Task 3: `getAllPlayerRows` — the shared player list

**Files:**
- Create: `lib/portal/allPlayers.ts`
- Test: `lib/portal/allPlayers.test.ts`

**Interfaces:**
- Consumes: `playerProfiles` from `@/lib/data/players` (existing, the
  static 13-player array with `.slug`/`.fullName`); `createSupabaseServiceRoleClient`
  from `@/lib/supabase/server` (existing).
- Produces: `interface PlayerRow { playerSlug: string; fullName: string;
  username: string | null; claimedBy: string | null; email: string | null; }`
  and `getAllPlayerRows(): Promise<PlayerRow[]>` — used by Tasks 7, 8, 9, 11.

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { getAllPlayerRows } from "./allPlayers.ts";

// No Supabase credentials in the test environment, so
// createSupabaseServiceRoleClient() throws before any network call — same
// documented limitation activeSeasonOverlay.test.ts already has for its
// own Supabase-backed helpers.
test("getAllPlayerRows rejects with no Supabase configuration in the test environment", async () => {
  await assert.rejects(() => getAllPlayerRows());
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test lib/portal/allPlayers.test.ts`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Write the implementation**

```typescript
// Server-only: imports @/lib/supabase/server, which pulls in next/headers
// transitively — never import this from a Client Component.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { playerProfiles } from "@/lib/data/players";

export interface PlayerRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
  email: string | null;
}

/**
 * Every player, static (lib/data/players/*.ts) or dynamic (a player_slots
 * row with no hand-written file). A player_slots row's full_name always
 * wins when set — that's the one field "Edit name" writes to, so an edit
 * is guaranteed to show up wherever this list is used. Shared by the
 * Global Players page, the per-year Players & Teams page, and the public
 * confirmed roster, so the union logic lives in exactly one place.
 */
export async function getAllPlayerRows(): Promise<PlayerRow[]> {
  const service = createSupabaseServiceRoleClient();
  const { data: slots } = await service
    .from("player_slots")
    .select("player_slug, username, claimed_by, email, full_name");
  const bySlug = new Map((slots ?? []).map((s) => [s.player_slug, s]));

  const staticRows: PlayerRow[] = playerProfiles.map((p) => {
    const slot = bySlug.get(p.slug);
    return {
      playerSlug: p.slug,
      fullName: slot?.full_name ?? p.fullName,
      username: slot?.username ?? null,
      claimedBy: slot?.claimed_by ?? null,
      email: slot?.email ?? null,
    };
  });

  const staticSlugs = new Set(playerProfiles.map((p) => p.slug));
  const dynamicRows: PlayerRow[] = (slots ?? [])
    .filter((s) => !staticSlugs.has(s.player_slug))
    .map((s) => ({
      playerSlug: s.player_slug,
      fullName: s.full_name ?? s.player_slug,
      username: s.username,
      claimedBy: s.claimed_by,
      email: s.email,
    }));

  return [...staticRows, ...dynamicRows];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test lib/portal/allPlayers.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add lib/portal/allPlayers.ts lib/portal/allPlayers.test.ts
git commit -m "feat: add getAllPlayerRows shared player list helper"
```

---

## Task 4: `POST /api/portal/tiger/player-name`

**Files:**
- Create: `app/api/portal/tiger/player-name/route.ts`
- Test: `app/api/portal/tiger/player-name/route.test.ts`

**Interfaces:**
- Consumes: `requireHost` from `@/lib/portal/requireHost` (existing),
  `createSupabaseServiceRoleClient` from `@/lib/supabase/server` (existing).
- Produces: `POST` accepting `{ playerSlug: string, fullName: string }`,
  returning `{ ok: true, fullName: string }` or `{ ok: false, error: string }`
  — used by Task 6 (`GlobalPlayersAdmin`).

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

// requireHost() calls createSupabaseServerClient(), which needs a real
// request lifecycle — same limitation every other tiger/** route test
// documents. This test covers the one pure piece: an unauthenticated
// request never touches Supabase.
test("POST /api/portal/tiger/player-name rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/portal/tiger/player-name", {
    method: "POST",
    body: JSON.stringify({ playerSlug: "cade-barone", fullName: "Cade Barone" }),
  });

  await assert.rejects(() => POST(request));
  assert.equal(fetchCalled, false, "must not touch Supabase without a resolved host session");
  globalThis.fetch = originalFetch;
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/player-name/route.test.ts`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Write the implementation**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

// The Tiger-only override for a player's *visible* name — never touches
// player_slots.player_slug, which stays the permanent identifier every
// join/URL uses. Mirrors player-email's shape exactly.
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { playerSlug, fullName } = await request.json();
  if (typeof playerSlug !== "string" || typeof fullName !== "string" || !fullName.trim()) {
    return NextResponse.json({ ok: false, error: "Missing playerSlug or name." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const trimmedName = fullName.trim();

  const { data: slot } = await service.from("player_slots").select("player_slug").eq("player_slug", playerSlug).single();
  if (!slot) {
    return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 400 });
  }

  const { error } = await service.from("player_slots").update({ full_name: trimmedName }).eq("player_slug", playerSlug);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save that name." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, fullName: trimmedName });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/player-name/route.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/player-name/
git commit -m "feat: add POST /api/portal/tiger/player-name"
```

---

## Task 5: `POST /api/portal/tiger/player-add`

**Files:**
- Create: `app/api/portal/tiger/player-add/route.ts`
- Test: `app/api/portal/tiger/player-add/route.test.ts`

**Interfaces:**
- Consumes: `requireHost`, `createSupabaseServiceRoleClient` (existing);
  `playerProfiles` from `@/lib/data/players` (existing); `computePlayerSlug`
  from `@/lib/portal/computePlayerSlug` (Task 2); `computePlayerUsername`
  from `@/lib/portal/computePlayerUsername` (existing, already used by the
  self-serve signup route).
- Produces: `POST` accepting `{ fullName: string, email: string }`,
  returning `{ ok: true, playerSlug: string }` or
  `{ ok: false, error: string }` — used by Task 6 (`GlobalPlayersAdmin`).

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

// requireHost() calls createSupabaseServerClient(), which needs a real
// request lifecycle — same limitation every other tiger/** route test
// documents. This test covers the one pure piece: an unauthenticated
// request never creates a player or touches Supabase.
test("POST /api/portal/tiger/player-add rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost/api/portal/tiger/player-add", {
    method: "POST",
    body: JSON.stringify({ fullName: "Test Player", email: "test@example.com" }),
  });

  await assert.rejects(() => POST(request));
  assert.equal(fetchCalled, false, "must not touch Supabase without a resolved host session");
  globalThis.fetch = originalFetch;
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test app/api/portal/tiger/player-add/route.test.ts`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Write the implementation**

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { playerProfiles } from "@/lib/data/players";
import { computePlayerSlug } from "@/lib/portal/computePlayerSlug";
import { computePlayerUsername } from "@/lib/portal/computePlayerUsername";

// Creates a brand-new player who exists purely as a player_slots row — no
// lib/data/players/*.ts file, no code change, no deploy. Everything else
// (invite, bio, team assignment) is the existing per-player tooling
// already built for the 13 hand-written players.
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { fullName, email } = await request.json();
  if (typeof fullName !== "string" || !fullName.trim() || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ ok: false, error: "Missing name or email." }, { status: 400 });
  }
  const trimmedName = fullName.trim();

  const service = createSupabaseServiceRoleClient();
  const { data: existingSlots } = await service.from("player_slots").select("player_slug");
  const takenSlugs = new Set([
    ...playerProfiles.map((p) => p.slug),
    ...(existingSlots ?? []).map((s) => s.player_slug),
  ]);

  const baseSlug = computePlayerSlug(trimmedName);
  let slug = baseSlug;
  let suffix = 2;
  while (takenSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const username = computePlayerUsername(trimmedName);
  const { error } = await service.from("player_slots").insert({
    player_slug: slug,
    username,
    full_name: trimmedName,
    email: email.trim(),
    claimed_by: null,
  });
  if (error) {
    return NextResponse.json(
      { ok: false, error: "That name's username is already taken — try a slightly different spelling." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, playerSlug: slug });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test app/api/portal/tiger/player-add/route.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/tiger/player-add/
git commit -m "feat: add POST /api/portal/tiger/player-add"
```

---

## Task 6: `GlobalPlayersAdmin` component

Built from today's `components/portal/PlayerSlotsAdmin.tsx`
(read it first — this task replaces it), dropping the Team
column/buttons/lock and the `year` prop entirely, and adding "+ Add
Player" plus a Name field on the existing email panel. This task creates
the new component only; Task 7 wires it into a page, and Task 8 deletes
the old `PlayerSlotsAdmin.tsx` once nothing references it.

**Files:**
- Create: `components/portal/tiger/GlobalPlayersAdmin.tsx`

**Interfaces:**
- Consumes: `POST /api/portal/tiger/player-add` (Task 5),
  `POST /api/portal/tiger/player-name` (Task 4), and the existing
  `POST /api/portal/tiger/player-email`, `POST /api/portal/tiger/invite`,
  `POST /api/portal/admin/unlink`, `POST /api/portal/tiger/profile-edits/approve`,
  `POST /api/portal/tiger/profile-edits/deny`,
  `POST /api/portal/tiger/profile-edits/set` routes (all unchanged).
- Produces: `export interface GlobalPlayerRow { playerSlug: string;
  fullName: string; username: string | null; claimedBy: string | null;
  email: string | null; pendingEdits: { field: string; proposedValue:
  string | string[]; submittedAt: string }[]; }` and
  `export function GlobalPlayersAdmin({ rows }: { rows: GlobalPlayerRow[] })`
  — used by Task 7.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { Fragment, useState } from "react";

// Mirrors EDITABLE_PLAYER_FIELDS in lib/data/players/overrides.ts. Not
// imported from there directly: that module has a top-level import of the
// server-only Supabase client (via next/headers), which breaks the client
// bundle for this "use client" component. Keep this list in sync with
// overrides.ts if editable fields ever change.
const EDITABLE_PLAYER_FIELDS = [
  "bio",
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

interface PendingProfileEdit {
  field: string;
  proposedValue: string | string[];
  submittedAt: string;
}

export interface GlobalPlayerRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
  email: string | null;
  pendingEdits: PendingProfileEdit[];
}

export function GlobalPlayersAdmin({ rows: initialRows }: { rows: GlobalPlayerRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [rows, setRowsState] = useState(initialRows);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [addingPlayer, setAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [addPlayerBusy, setAddPlayerBusy] = useState(false);

  async function handleAddPlayer() {
    setAddPlayerBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/player-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: newPlayerName, email: newPlayerEmail }),
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
      setAddPlayerBusy(false);
    }
  }

  async function handleApprove(playerSlug: string, field: string, submittedAt: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, field, submittedAt }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) =>
        current.map((r) => (r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== field) } : r))
      );
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeny(playerSlug: string, field: string, submittedAt: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, field, submittedAt }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) =>
        current.map((r) => (r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== field) } : r))
      );
    } catch {
      setError("Something went wrong — try again.");
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
      setRowsState((current) =>
        current.map((r) =>
          r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== directEditField) } : r
        )
      );
      setDirectEditSaved(true);
      setDirectEditValue("");
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveNameAndEmail(playerSlug: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const [nameRes, emailRes] = await Promise.all([
        fetch("/api/portal/tiger/player-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerSlug, fullName: editName }),
        }),
        fetch("/api/portal/tiger/player-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerSlug, email: editEmail }),
        }),
      ]);
      const [nameData, emailData] = await Promise.all([nameRes.json(), emailRes.json()]);
      if (!nameData.ok) {
        setError(nameData.error);
        return;
      }
      if (!emailData.ok) {
        setError(emailData.error);
        return;
      }
      setRowsState((current) =>
        current.map((r) => (r.playerSlug === playerSlug ? { ...r, fullName: nameData.fullName, email: emailData.email } : r))
      );
      setEditSlug(null);
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

  // Always sends to whatever email is on file for this player (set via
  // "Edit name & email" above) — there's deliberately no separate address
  // to type here, so the invite can never go somewhere different from
  // what's on record.
  async function handleSendInvite(playerSlug: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug }),
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

  async function handleUnlink(playerSlug: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/admin/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug }),
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

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Players</h1>
          <p className="mt-2 font-sans text-sm text-ink-500">
            Add players, invite them, edit their name/email, and review any bio edits waiting on your approval.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAddingPlayer((current) => !current);
            setNewPlayerName("");
            setNewPlayerEmail("");
            setError(null);
          }}
          className="shrink-0 rounded-pill bg-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase tracking-wide text-white"
        >
          + Add Player
        </button>
      </div>
      {addingPlayer && (
        <div className="mt-4 rounded-sm border border-ink-200 bg-cream-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              required
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="Full name"
              className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
            />
            <input
              type="email"
              required
              value={newPlayerEmail}
              onChange={(e) => setNewPlayerEmail(e.target.value)}
              placeholder="player@email.com"
              className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
            />
            <button
              type="button"
              disabled={addPlayerBusy || !newPlayerName.trim() || !newPlayerEmail.trim()}
              onClick={handleAddPlayer}
              className="rounded-pill bg-maroon-700 px-3 py-1.5 font-sans text-xs font-semibold text-white disabled:opacity-50"
            >
              {addPlayerBusy ? "Adding…" : "Add Player"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <table className="mt-6 w-full border-collapse font-sans text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left">
            <th className="py-2">Player</th>
            <th className="py-2">Username</th>
            <th className="py-2">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.playerSlug}>
              <tr className="border-b border-ink-100">
                <td className="py-4">
                  {row.fullName}
                  <div className="mt-1 flex flex-col gap-0.5 font-sans text-2xs text-ink-400">
                    <span>{row.email ?? "No email on file"}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditSlug((current) => (current === row.playerSlug ? null : row.playerSlug));
                        setEditName(row.fullName);
                        setEditEmail(row.email ?? "");
                        setError(null);
                      }}
                      className="self-start font-semibold text-maroon-700 underline"
                    >
                      Edit name & email
                    </button>
                  </div>
                </td>
                <td className="py-4 font-mono">{row.username ?? "—"}</td>
                <td className="py-4">{row.claimedBy ? "Claimed" : "Open"}</td>
                <td className="py-4 text-right">
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
                      disabled={busy === row.playerSlug || !row.email}
                      title={row.email ? undefined : "Add an email first"}
                      onClick={() => handleSendInvite(row.playerSlug)}
                      className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:cursor-not-allowed disabled:text-ink-300"
                    >
                      {busy === row.playerSlug ? "Sending…" : "Send Invite"}
                    </button>
                  ) : null}
                </td>
              </tr>
              {editSlug === row.playerSlug && (
                <tr key={`${row.playerSlug}-edit`} className="border-b border-ink-100 bg-cream-50">
                  <td colSpan={4} className="py-3">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Full name"
                        className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
                      />
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="player@email.com"
                        className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
                      />
                      <button
                        type="button"
                        disabled={busy === row.playerSlug || !editName.trim()}
                        onClick={() => handleSaveNameAndEmail(row.playerSlug)}
                        className="rounded-pill bg-maroon-700 px-3 py-1.5 font-sans text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busy === row.playerSlug ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {expandedSlug === row.playerSlug && row.pendingEdits.length > 0 && (
                <tr key={`${row.playerSlug}-pending`} className="border-b border-ink-100 bg-cream-50">
                  <td colSpan={4} className="py-3">
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
                            onClick={() => handleApprove(row.playerSlug, edit.field, edit.submittedAt)}
                            className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy === row.playerSlug}
                            onClick={() => handleDeny(row.playerSlug, edit.field, edit.submittedAt)}
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
                  <td colSpan={4} className="py-3">
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
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (this component isn't imported anywhere yet, but must compile standalone).

- [ ] **Step 3: Lint**

Run: `npx eslint components/portal/tiger/GlobalPlayersAdmin.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/portal/tiger/GlobalPlayersAdmin.tsx
git commit -m "feat: add GlobalPlayersAdmin component"
```

---

## Task 7: Global Players page + Global Tools nav link

**Files:**
- Create: `app/portal/admin/players/page.tsx`
- Modify: `app/portal/admin/page.tsx`

**Interfaces:**
- Consumes: `getAllPlayerRows` (Task 3), `GlobalPlayersAdmin`/`GlobalPlayerRow` (Task 6).

- [ ] **Step 1: Write the page**

```tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { GlobalPlayersAdmin, type GlobalPlayerRow } from "@/components/portal/tiger/GlobalPlayersAdmin";

export default async function GlobalPlayersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const allPlayers = await getAllPlayerRows();

  // Players claimed the old way (self-signed-up via a copied invite link,
  // before player_slots.email existed) have no email on file there —
  // fall back to their real account email so Tiger sees something instead
  // of "No email on file" for players who obviously do have one.
  const claimedByIds = allPlayers.map((p) => p.claimedBy).filter((id): id is string => Boolean(id));
  const { data: claimedProfiles } = claimedByIds.length
    ? await service.from("profiles").select("id, email").in("id", claimedByIds)
    : { data: [] };
  const accountEmailById = new Map((claimedProfiles ?? []).map((p) => [p.id, p.email as string]));

  const { data: pendingRows } = await service
    .from("player_profile_edits")
    .select("player_slug, field, proposed_value, submitted_at");
  const pendingBySlug = new Map<string, { field: string; proposedValue: string | string[]; submittedAt: string }[]>();
  for (const row of pendingRows ?? []) {
    const list = pendingBySlug.get(row.player_slug) ?? [];
    list.push({ field: row.field, proposedValue: row.proposed_value, submittedAt: row.submitted_at });
    pendingBySlug.set(row.player_slug, list);
  }

  const rows: GlobalPlayerRow[] = allPlayers.map((p) => ({
    playerSlug: p.playerSlug,
    fullName: p.fullName,
    username: p.username,
    claimedBy: p.claimedBy,
    email: p.email ?? (p.claimedBy ? accountEmailById.get(p.claimedBy) ?? null : null),
    pendingEdits: pendingBySlug.get(p.playerSlug) ?? [],
  }));

  return <GlobalPlayersAdmin rows={rows} />;
}
```

- [ ] **Step 2: Add the Global Tools nav link**

In `app/portal/admin/page.tsx`, find this block inside the "Global Tools"
`<section>`:

```tsx
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/portal/admin/scoring-preview" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-7 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Live Scoring Page Editor</Link>
```

Replace it with (adding one new `<Link>` for Players, first in the grid):

```tsx
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/portal/admin/players" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-7 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Players</Link>
          <Link href="/portal/admin/scoring-preview" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-7 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Live Scoring Page Editor</Link>
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint app/portal/admin/players/page.tsx app/portal/admin/page.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/portal/admin/players/page.tsx app/portal/admin/page.tsx
git commit -m "feat: add Global Players page and Global Tools nav link"
```

---

## Task 8: Shrink per-year Players & Teams; delete `PlayerSlotsAdmin`

**Files:**
- Create: `components/portal/PlayerTeamAssignment.tsx`
- Modify: `app/portal/admin/master-settings/[year]/players-teams/page.tsx`
- Delete: `components/portal/PlayerSlotsAdmin.tsx`

**Interfaces:**
- Consumes: `getAllPlayerRows` (Task 3).
- Produces: `export interface PlayerTeamRow { playerSlug: string;
  fullName: string; team: "maroon" | "white" | null; teamLocked: boolean; }`
  and `export function PlayerTeamAssignment({ year, rows }: { year: number;
  rows: PlayerTeamRow[] })`.

- [ ] **Step 1: Write `PlayerTeamAssignment.tsx`**

```tsx
"use client";

import { useState } from "react";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";

export interface PlayerTeamRow {
  playerSlug: string;
  fullName: string;
  team: "maroon" | "white" | null;
  teamLocked: boolean;
}

export function PlayerTeamAssignment({ year, rows: initialRows }: { year: number; rows: PlayerTeamRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRowsState] = useState(initialRows);

  async function handleSetTeam(playerSlug: string, team: "maroon" | "white" | null) {
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

  async function handleTeamLock(playerSlug: string, locked: boolean) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/roster/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, playerSlug, locked }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) => current.map((row) => (row.playerSlug === playerSlug ? { ...row, teamLocked: locked } : row)));
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Players & Teams</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">Assign each player to Maroon or White for this year.</p>
      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <table className="mt-6 w-full border-collapse font-sans text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left">
            <th className="py-2">Player</th>
            <th className="py-2">Team</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerSlug} className="border-b border-ink-100">
              <td className="py-2">{row.fullName}</td>
              <td className="py-2">
                <div className="flex flex-wrap items-center gap-1">
                  {([
                    [null, "Unassigned"],
                    ["maroon", "Maroon"],
                    ["white", "White"],
                  ] as const).map(([team, label]) => {
                    const selected = row.team === team;
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={busy === row.playerSlug || row.teamLocked}
                        onClick={() => handleSetTeam(row.playerSlug, team)}
                        className={[
                          "rounded-sm border px-2 py-1 font-condensed text-2xs font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-70",
                          selected && row.teamLocked ? "border-fairway-800 bg-fairway-800 text-white" : "",
                          selected && !row.teamLocked && team === "maroon" ? "border-maroon-700 bg-maroon-700 text-white" : "",
                          selected && !row.teamLocked && team === "white" ? "border-ink-400 bg-white text-ink-900" : "",
                          selected && !row.teamLocked && team === null ? "border-ink-500 bg-ink-100 text-ink-800" : "",
                          !selected ? "border-ink-200 bg-white text-ink-500 hover:border-ink-400" : "",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={busy === row.playerSlug}
                    onClick={() => handleTeamLock(row.playerSlug, !row.teamLocked)}
                    title={row.teamLocked ? "Unlock team assignment" : "Lock team assignment"}
                    className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-sm border border-ink-300 bg-white text-ink-700 hover:border-gold-500 hover:text-maroon-700 disabled:opacity-50"
                  >
                    {row.teamLocked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the per-year page**

Replace the full contents of
`app/portal/admin/master-settings/[year]/players-teams/page.tsx` with:

```tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { PlayerTeamAssignment, type PlayerTeamRow } from "@/components/portal/PlayerTeamAssignment";

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
  const [allPlayers, { data: roster }, { data: locks }] = await Promise.all([
    getAllPlayerRows(),
    service.from("live_roster").select("player_slug, team").eq("season_year", year),
    service.from("live_roster_assignment_locks").select("player_slug").eq("season_year", year),
  ]);
  const rosterBySlug = new Map((roster ?? []).map((r) => [r.player_slug, r.team as "maroon" | "white"]));
  const lockedSlugs = new Set((locks ?? []).map((lock) => lock.player_slug));

  const rows: PlayerTeamRow[] = allPlayers.map((p) => ({
    playerSlug: p.playerSlug,
    fullName: p.fullName,
    team: rosterBySlug.get(p.playerSlug) ?? null,
    teamLocked: lockedSlugs.has(p.playerSlug),
  }));

  return <PlayerTeamAssignment year={year} rows={rows} />;
}
```

- [ ] **Step 3: Confirm nothing else imports `PlayerSlotsAdmin`, then delete it**

Run: `grep -rn "PlayerSlotsAdmin" app components lib`
Expected: no matches (Task 7 already moved its only two previous
consumers — the old per-year page and nothing else — off of it).

```bash
rm components/portal/PlayerSlotsAdmin.tsx
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint components/portal/PlayerTeamAssignment.tsx "app/portal/admin/master-settings/[year]/players-teams/page.tsx" && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add components/portal/PlayerTeamAssignment.tsx "app/portal/admin/master-settings/[year]/players-teams/page.tsx"
git rm components/portal/PlayerSlotsAdmin.tsx
git commit -m "feat: shrink per-year Players & Teams to name + team assignment"
```

---

## Task 9: Portal home shows the resolved name

**Files:**
- Modify: `app/portal/page.tsx`

**Interfaces:**
- Consumes: `getAllPlayerRows` (Task 3).

- [ ] **Step 1: Add the import**

Find:
```tsx
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getLiveTeamForPlayer } from "@/lib/data/activeSeasonOverlay";
```

Replace with:
```tsx
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getLiveTeamForPlayer } from "@/lib/data/activeSeasonOverlay";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
```

- [ ] **Step 2: Resolve the name from the shared list**

Find:
```tsx
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  const playerName = playerProfile?.fullName ?? profile.display_name ?? "Player";
  const year = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/Chicago" }).format(new Date()));
  const archivedTournament = pastTournaments.find((tournament) => tournament.year === year);
  const [team, upcomingMatches, archivedScorecards, handicapSummary, archivedHandicapRounds] = await Promise.all([
    getLiveTeamForPlayer(playerSlug),
    archivedTournament ? Promise.resolve([]) : findMatchesForPlayer(playerSlug, year),
```

Replace with:
```tsx
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  const year = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/Chicago" }).format(new Date()));
  const archivedTournament = pastTournaments.find((tournament) => tournament.year === year);
  const [team, allPlayers, upcomingMatches, archivedScorecards, handicapSummary, archivedHandicapRounds] = await Promise.all([
    getLiveTeamForPlayer(playerSlug),
    getAllPlayerRows(),
    archivedTournament ? Promise.resolve([]) : findMatchesForPlayer(playerSlug, year),
```

Then find:
```tsx
  const heroHandicapIndex = combinedHandicapIndexes(handicapSummary.rounds, archivedHandicapRounds).index;
```

Replace with:
```tsx
  const heroHandicapIndex = combinedHandicapIndexes(handicapSummary.rounds, archivedHandicapRounds).index;
  const playerName = allPlayers.find((p) => p.playerSlug === playerSlug)?.fullName ?? profile.display_name ?? "Player";
```

(`playerProfile` stays — it's still used just below for `avatarSrc`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/portal/page.tsx
git commit -m "feat: portal home honors a player_slots.full_name override"
```

---

## Task 10: Edit My Bio works for a player with no hand-written file

**Files:**
- Modify: `app/portal/profile/page.tsx`

**Interfaces:**
- Consumes: `PlayerProfile` type from `@/lib/data/types` (existing).

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `app/portal/profile/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getProfileOverrides, mergeProfile } from "@/lib/data/players/overrides";
import { ProfileEditGrid } from "@/components/portal/ProfileEditGrid";
import type { PlayerProfile } from "@/lib/data/types";

export default async function PortalProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("player_slug").eq("id", user.id).single();
  if (!profileRow?.player_slug) redirect("/portal");

  const service = createSupabaseServiceRoleClient();
  const { data: slot } = await service.from("player_slots").select("full_name").eq("player_slug", profileRow.player_slug).single();

  const staticProfile = getPlayerProfileBySlug(profileRow.player_slug);
  // A dynamically-added player (no lib/data/players/*.ts file) has no
  // static base to start from — synthesize a minimal one instead of
  // redirecting away, so they can still set their own bio.
  const baseProfile: PlayerProfile = staticProfile
    ? { ...staticProfile, fullName: slot?.full_name ?? staticProfile.fullName }
    : {
        id: profileRow.player_slug,
        slug: profileRow.player_slug,
        fullName: slot?.full_name ?? profileRow.player_slug,
        avatarSrc: null,
        bio: "",
        history: [],
      };

  const overrides = await getProfileOverrides(profileRow.player_slug);
  const profile = mergeProfile(baseProfile, overrides);

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
      <Link href="/portal" className="hidden lg:inline-block font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500 hover:text-maroon-700">
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/portal/profile/page.tsx
git commit -m "feat: Edit My Bio works for a player with no hand-written file"
```

---

## Task 11: Confirmed Roster shows the resolved name

**Files:**
- Modify: `lib/live/types.ts`
- Modify: `lib/data/activeSeasonOverlay.ts`
- Modify: `components/teams/ConfirmedRoster.tsx`

**Interfaces:**
- Consumes: `getAllPlayerRows` (Task 3), `getPlayerAvatar` from
  `@/lib/data/players` (existing).
- Produces: `RosterEntry` gains optional `displayName?: string` and
  `avatarSrc?: string | null`.

- [ ] **Step 1: Extend `RosterEntry`**

In `lib/live/types.ts`, find:
```typescript
export interface RosterEntry {
  seasonYear: number;
  playerSlug: string;
  team: Team;
}
```

Replace with:
```typescript
export interface RosterEntry {
  seasonYear: number;
  playerSlug: string;
  team: Team;
  displayName?: string;
  avatarSrc?: string | null;
}
```

- [ ] **Step 2: Resolve name/avatar in `getConfirmedRoster`**

In `lib/data/activeSeasonOverlay.ts`, add to the import block at the top:
```typescript
import { getPlayerAvatar } from "@/lib/data/players";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
```

Then find:
```typescript
  const entries: RosterEntry[] = roster.map((row) => ({ seasonYear: active.season_year, playerSlug: row.player_slug, team: row.team }));
  return filterLockedRoster(entries, (locks ?? []).map((lock) => lock.player_slug));
}
```

Replace with:
```typescript
  const entries: RosterEntry[] = roster.map((row) => ({ seasonYear: active.season_year, playerSlug: row.player_slug, team: row.team }));
  const filtered = filterLockedRoster(entries, (locks ?? []).map((lock) => lock.player_slug));

  const allPlayers = await getAllPlayerRows();
  const nameBySlug = new Map(allPlayers.map((p) => [p.playerSlug, p.fullName]));
  return filtered.map((entry) => ({
    ...entry,
    displayName: nameBySlug.get(entry.playerSlug) ?? entry.playerSlug,
    avatarSrc: getPlayerAvatar(entry.playerSlug),
  }));
}
```

- [ ] **Step 3: Use the resolved fields in `ConfirmedRoster.tsx`**

Replace the full contents of `components/teams/ConfirmedRoster.tsx` with:

```tsx
import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";
import type { RosterEntry } from "@/lib/live/types";

const TEAMS: { value: Team; label: string }[] = [
  { value: "maroon", label: "Maroon" },
  { value: "white", label: "White" },
];

/**
 * The upcoming year's roster, confirmed players only (see
 * getConfirmedRoster). Unlike TeamsDirectory (past years), there are no
 * matches, scores, or a Rankings tab to show yet — just who's locked into
 * which team so far.
 */
export function ConfirmedRoster({ roster }: { roster: RosterEntry[] }) {
  if (roster.length === 0) return null;

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
      {TEAMS.map(({ value, label }) => {
        const players = roster.filter((entry) => entry.team === value);
        if (players.length === 0) return null;
        return (
          <section key={value}>
            <h2 className="font-condensed text-[13px] font-bold uppercase tracking-wide text-maroon-700">{label} — confirmed so far</h2>
            <ul className="mt-3 space-y-3">
              {players.map((entry) => {
                const displayName = entry.displayName ?? getPlayerDisplayName(entry.playerSlug);
                const avatarSrc = entry.avatarSrc ?? getPlayerAvatar(entry.playerSlug);
                return (
                  <li key={entry.playerSlug} className="flex items-center gap-3">
                    <Avatar src={avatarSrc} name={displayName} team={entry.team} size="md" />
                    <span className="font-sans text-sm font-semibold text-ink-900">{displayName}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint components/teams/ConfirmedRoster.tsx lib/data/activeSeasonOverlay.ts lib/live/types.ts && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add lib/live/types.ts lib/data/activeSeasonOverlay.ts components/teams/ConfirmedRoster.tsx
git commit -m "feat: Confirmed Roster shows the resolved player name"
```

---

## Task 12: Full verification and `project_specs.md`

**Files:**
- Modify: `project_specs.md`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: every test passes, including the new `computePlayerSlug.test.ts`,
`allPlayers.test.ts`, `player-name/route.test.ts`, `player-add/route.test.ts`.

- [ ] **Step 2: Full typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Confirm no stray references to the deleted component**

Run: `grep -rn "PlayerSlotsAdmin" app components lib`
Expected: no matches.

- [ ] **Step 4: Add a shipped-round entry to `project_specs.md`**

Append a bullet to the "Previously shipped rounds" section (find the most
recent bullet — "Show every player's email, not just unclaimed ones..." —
and add this one directly after it) summarizing: the new
`/portal/admin/players` Global Tools page; Add Player (name + email only);
Edit name & email replacing the old email-only panel; the per-year Players
& Teams page shrunk to name + team assignment; the shared
`getAllPlayerRows` helper; the 4 forward-facing spots that now resolve a
`player_slots.full_name` override or a synthesized identity for a player
with no hand-written file (portal home, Edit My Bio, Confirmed Roster, and
the admin pages themselves); explicitly note that renaming does not reach
the historical leaderboard/scorecard/wagers/broadcast pages nor the live
in-progress `LivePlayerScorecard.tsx`, and that `supabase/player_slots_full_name.sql`
needs to be run once in Supabase before any of this works against
production. Note the test/tsc/lint/build results from Steps 1-2.

- [ ] **Step 5: Commit**

```bash
git add project_specs.md
git commit -m "docs: log the Add Player / Edit Name / Global Players round"
```
