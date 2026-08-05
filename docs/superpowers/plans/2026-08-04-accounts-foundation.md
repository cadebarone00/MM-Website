# Accounts Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the currently-inert Sign Up / Login buttons into working accounts backed by Supabase, add a post-login Website/Portal fork screen for players and Tiger (host), and let Tiger pre-assign player usernames that players claim by signing up with them.

**Architecture:** Supabase (Postgres + Auth) is the new backend, reached only from the server (Next.js Route Handlers and Server Components) — the browser never talks to Supabase directly. Two server-side Supabase clients: a cookie-bound client (via `@supabase/ssr`) that acts as the signed-in user for auth + reading their own `profiles` row, and a service-role client used only for `player_slots` (Tiger's admin actions and the signup-time username match) and for the one unauthenticated email lookup login needs. `middleware.ts` keeps auth cookies refreshed. `lib/useAccountSession.ts` is rewritten to fetch session state from a new `GET /api/account/me` route instead of localStorage.

**Tech Stack:** Next.js 16 App Router (Route Handlers + Server Components), `@supabase/supabase-js` `^2.112.0`, `@supabase/ssr` `^0.12.4`, Supabase Postgres + Auth (hosted, free tier). Dev-only: `tsx` `^4.23.6` to run the two new pure-logic tests via Node's built-in test runner (no test framework existed in this repo before this plan).

## Global Constraints

- Env vars are **server-only**, no `NEXT_PUBLIC_` prefix, since the browser never calls Supabase directly: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `player_slots` has **no RLS policies at all** — only the service-role client (which bypasses RLS) may ever read or write it. Usernames-for-players and who's claimed them must never be queryable with the anon key.
- `profiles` RLS allows only `select` where `auth.uid() = id` — every `insert`/`update` happens server-side via the service-role client, never via the user's own session.
- Once a `player_slots` row has `claimed_by` set, its `username` is immutable except through the explicit "Unlink" admin action.
- No code in this plan calls Supabase from a Client Component — every Supabase call lives in a Route Handler, Server Component, or `middleware.ts`.
- Follow existing repo conventions: Tailwind utility classes matching the existing palette (`maroon-700`, `cream-50`, `ink-900`, `gold-400`, etc.), `font-sans`/`font-condensed` per existing usage, `"use client"` only on components that need interactivity, path alias `@/*` → repo root.

---

## Task 1: Supabase project setup, env scaffolding, and schema

**Files:**
- Create: `docs/supabase-setup.md`
- Create: `supabase/schema.sql`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json` (add `@supabase/supabase-js`, `@supabase/ssr`)

**Interfaces:**
- Produces: the `profiles` and `player_slots` tables (see columns below) that every later task reads/writes; the three env var names later tasks read via `process.env`.

This task has no application code — it's the one-time setup the user (not this plan) performs in their own Supabase account, mirroring how `appscript/README.md` already walks them through one-time Google Sheet setup in this repo.

- [ ] **Step 1: Fix `.gitignore` so `.env.example` can be committed**

`.gitignore` currently has `.env*` (line 34), which also matches `.env.example`. Add an exception right after it:

```gitignore
.env*
!.env.example
```

- [ ] **Step 2: Write `.env.example`**

```
# Supabase project settings — see docs/supabase-setup.md for where to find these.
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 3: Write `supabase/schema.sql`**

```sql
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New
-- query -> paste this whole file -> Run). Safe to run more than once.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  username text not null unique,
  is_host boolean not null default false,
  player_slug text references player_slots(player_slug),
  created_at timestamptz not null default now()
);

create table if not exists player_slots (
  player_slug text primary key,
  username text unique,
  claimed_by uuid references profiles(id) on delete set null,
  claimed_at timestamptz
);

-- profiles.player_slug references player_slots, so player_slots must exist
-- first — recreate profiles' FK now that both tables are defined.
alter table profiles
  drop constraint if exists profiles_player_slug_fkey,
  add constraint profiles_player_slug_fkey foreign key (player_slug) references player_slots(player_slug);

-- Case-insensitive uniqueness (plain `unique` above is case-sensitive, so
-- "Kyle" and "kyle" wouldn't otherwise collide).
create unique index if not exists profiles_username_lower_idx on profiles (lower(username));
create unique index if not exists player_slots_username_lower_idx on player_slots (lower(username)) where username is not null;

alter table profiles enable row level security;
alter table player_slots enable row level security;

-- Users may read only their own profile row. Every insert/update to
-- profiles happens server-side with the service-role key (bypasses RLS) —
-- there is deliberately no insert/update policy here.
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select using (auth.uid() = id);

-- player_slots has NO policies — only the service-role key (which bypasses
-- RLS entirely) may ever touch it. This keeps player usernames and claim
-- status invisible to the anon key.

-- Seed the 13 known players (mirrors lib/data/players/index.ts). Re-running
-- is safe: existing rows are left untouched.
insert into player_slots (player_slug) values
  ('cade-barone'), ('cam-latto'), ('collin-ross'), ('dalton-spriggs'),
  ('drew-weisser'), ('hugo-moebel'), ('jackson-collins'), ('kyle-schnabel'),
  ('luke-sherrell'), ('nate-wojciechowski'), ('pete-peabody'), ('peyton-vos'),
  ('quez-currier')
on conflict (player_slug) do nothing;
```

- [ ] **Step 4: Write `docs/supabase-setup.md`**

```markdown
# Setting up Supabase (one-time)

This is what makes Sign Up / Login actually work. You only have to do this once.

## What you're doing, in plain terms

You're creating a free account on Supabase (a hosted database + login
service), creating one project for the Maroon Masters site, pasting in one
SQL script that creates two tables, then copying three keys into `.env` so
the website can talk to it.

## Steps

1. Go to https://supabase.com and sign up (free tier is enough).
2. Click **New Project**. Name it `maroon-masters`, pick any region close to
   you, set a database password (save it somewhere — you likely won't need
   it again, Supabase manages the connection for you).
3. Once the project finishes provisioning, open the **SQL Editor** (left
   sidebar) -> **New query**. Paste in everything from `supabase/schema.sql`
   in this repo and click **Run**. This creates the two tables the site
   needs (`profiles`, `player_slots`) and pre-fills `player_slots` with all
   13 current players (usernames still blank until you set them later on
   the site's `/portal/admin` page).
4. Go to **Project Settings** (gear icon) -> **API**.
   - **Project URL** -> copy into `.env` as `SUPABASE_URL`.
   - **Project API keys** -> **anon public** key -> copy into `.env` as
     `SUPABASE_ANON_KEY`.
   - **service_role** key (click "reveal") -> copy into `.env` as
     `SUPABASE_SERVICE_ROLE_KEY`. This one is powerful — it can bypass all
     the security rules, so it only ever lives in `.env` (never in code,
     never committed, never sent to a browser).
5. Go to **Authentication** -> **Providers** -> **Email**, and confirm
   **Confirm email** is turned ON (it's on by default) — this is what makes
   people verify their email before they can log in.
6. Copy `.env.example` to `.env` and paste in the three values from step 4.
7. Run `npm install` (pulls in the two new packages this needs), then
   `npm run dev` and try signing up on `/signup`.

## If you ever need to see who's signed up

Supabase Dashboard -> **Table Editor** -> `profiles` shows every account.
**Authentication** -> **Users** shows the underlying login records (email,
verified status).
```

- [ ] **Step 5: Install the two new dependencies**

```bash
npm install @supabase/supabase-js@^2.112.0 @supabase/ssr@^0.12.4
```

- [ ] **Step 6: Verify**

Run: `npm run build`
Expected: succeeds (these are unused imports so far — this just confirms
the install didn't break anything).

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example supabase/schema.sql docs/supabase-setup.md package.json package-lock.json
git commit -m "chore: add Supabase dependencies, schema, and setup docs"
```

---

## Task 2: Supabase server clients and session-refresh middleware

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `middleware.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `process.env` (Task 1).
- Produces: `createSupabaseServerClient(): Promise<SupabaseClient>` — cookie-bound, acts as the signed-in user, respects RLS. `createSupabaseServiceRoleClient(): SupabaseClient` — no cookies, bypasses RLS, server-only. Every later task's Route Handlers and Server Components use these two functions exclusively; nothing calls `@supabase/ssr` or `@supabase/supabase-js` directly outside this file.

- [ ] **Step 1: Write `lib/supabase/server.ts`**

```typescript
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-bound client for use inside Route Handlers and Server Components.
 * Acts as whichever user's session cookie is present (or as an anonymous
 * request if there isn't one) — every read/write goes through RLS.
 *
 * Server Components can't write cookies, so `setAll` there is a no-op
 * wrapped in try/catch; `middleware.ts` is what actually persists a
 * refreshed token in that case.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — middleware.ts handles refresh instead.
        }
      },
    },
  });
}

/**
 * Service-role client: no cookies, bypasses RLS entirely. Only ever used
 * for player_slots (which has no RLS policies at all) and the one
 * unauthenticated email-by-username lookup login needs. Never exposed to
 * the browser.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  return createServiceClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 2: Write `middleware.ts`** (repo root, alongside `next.config.ts`)

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refreshes the Supabase auth cookie on every non-static request. Without
// this, a session's access token silently expires (~1hr) and Server
// Components (which can't write cookies themselves) would see the user as
// logged out even though their refresh token is still valid.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|mp4)$).*)"],
};
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run dev`, visit `http://localhost:3001/`
Expected: home page loads exactly as before (middleware runs on every
request now, but does nothing visible without a Supabase session yet).

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/server.ts middleware.ts
git commit -m "feat: add Supabase server clients and session-refresh middleware"
```

---

## Task 3: Pure helper functions (username matching, player-team lookup) with tests

**Files:**
- Create: `lib/portal/matchPlayerUsername.ts`
- Create: `lib/portal/matchPlayerUsername.test.ts`
- Create: `lib/portal/findPlayerTeam.ts`
- Create: `lib/portal/findPlayerTeam.test.ts`
- Modify: `package.json` (add `tsx` devDependency, add `"test"` script)

**Interfaces:**
- Produces: `findUnclaimedSlotForUsername(username: string, slots: PlayerSlotRow[]): PlayerSlotRow | null` (used by Task 5's signup route). `findPlayerTeam(playerSlug: string): Team | null` (used by Task 9's portal page).
- Consumes: `Team` from `@/lib/data`, `nextTournament`/`latestCompleted` from `@/lib/data`, `getPlayerProfile` from `@/lib/data/players` (all existing).

This repo has no test runner today. `tsx --test` runs Node's built-in test
runner (`node:test`/`node:assert`) directly against TypeScript with zero
extra config — the smallest possible addition, used only for these two
pure functions. Everything that needs a live Supabase connection is
verified manually in later tasks' QA steps instead.

- [ ] **Step 1: Install `tsx` and add the test script**

```bash
npm install -D tsx@^4.23.6
```

In `package.json`, add to `"scripts"`:

```json
"test": "tsx --test lib/**/*.test.ts"
```

- [ ] **Step 2: Write the failing test for `findUnclaimedSlotForUsername`**

`lib/portal/matchPlayerUsername.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnclaimedSlotForUsername, type PlayerSlotRow } from "./matchPlayerUsername";

const slots: PlayerSlotRow[] = [
  { player_slug: "kyle-schnabel", username: "kylegolf", claimed_by: null },
  { player_slug: "cade-barone", username: "cadeb", claimed_by: "some-uuid" },
  { player_slug: "cam-latto", username: null, claimed_by: null },
];

test("matches an unclaimed slot case-insensitively", () => {
  const match = findUnclaimedSlotForUsername("KyleGolf", slots);
  assert.equal(match?.player_slug, "kyle-schnabel");
});

test("does not match an already-claimed slot", () => {
  const match = findUnclaimedSlotForUsername("cadeb", slots);
  assert.equal(match, null);
});

test("does not match a slot with no username set yet", () => {
  const match = findUnclaimedSlotForUsername("cam-latto", slots);
  assert.equal(match, null);
});

test("returns null for a username matching no slot", () => {
  const match = findUnclaimedSlotForUsername("randomfan99", slots);
  assert.equal(match, null);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './matchPlayerUsername'`.

- [ ] **Step 4: Write `lib/portal/matchPlayerUsername.ts`**

```typescript
export interface PlayerSlotRow {
  player_slug: string;
  username: string | null;
  claimed_by: string | null;
}

/**
 * Finds the still-open player_slots row a freshly-typed sign-up username
 * matches, if any. Used only server-side (Task 5) against rows fetched with
 * the service-role client — player_slots is never readable from the browser.
 */
export function findUnclaimedSlotForUsername(username: string, slots: PlayerSlotRow[]): PlayerSlotRow | null {
  const needle = username.trim().toLowerCase();
  return slots.find((slot) => slot.username !== null && slot.claimed_by === null && slot.username.toLowerCase() === needle) ?? null;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test`
Expected: the 4 tests above PASS.

- [ ] **Step 6: Write the failing test for `findPlayerTeam`**

`lib/portal/findPlayerTeam.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlayerTeam } from "./findPlayerTeam";

// latestCompleted (2026) roster has Cade on White — see lib/data/2026-palm-springs.ts.
// This will need updating once the 2027 roster (lib/data/2027-upcoming.ts) is set,
// at which point findPlayerTeam will start reading from it instead.
test("finds a player's team from the latest completed tournament's roster", () => {
  assert.equal(findPlayerTeam("cade-barone"), "white");
});

test("returns null for a slug not on any known roster", () => {
  assert.equal(findPlayerTeam("nobody-here"), null);
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './findPlayerTeam'`.

- [ ] **Step 8: Write `lib/portal/findPlayerTeam.ts`**

```typescript
import type { Team } from "@/lib/data";
import { nextTournament, latestCompleted } from "@/lib/data";
import { getPlayerProfile } from "@/lib/data/players";

function rosterHasSlug(roster: { maroon: string[]; white: string[] } | undefined, slug: string): Team | null {
  if (!roster) return null;
  if (roster.maroon.some((p) => getPlayerProfile(p)?.slug === slug)) return "maroon";
  if (roster.white.some((p) => getPlayerProfile(p)?.slug === slug)) return "white";
  return null;
}

/**
 * A player's team isn't fixed on their profile — it comes from whichever
 * tournament's roster they're on. Prefers the upcoming tournament's roster
 * (once set) over the last completed one, so the portal reflects the
 * current trip as soon as pairings are known.
 */
export function findPlayerTeam(playerSlug: string): Team | null {
  return rosterHasSlug(nextTournament.roster, playerSlug) ?? rosterHasSlug(latestCompleted.roster, playerSlug);
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npm test`
Expected: all 6 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/portal/matchPlayerUsername.ts lib/portal/matchPlayerUsername.test.ts lib/portal/findPlayerTeam.ts lib/portal/findPlayerTeam.test.ts package.json package-lock.json
git commit -m "feat: add player-username matching and player-team lookup helpers"
```

---

## Task 4: Session shape, `/api/account/me`, sign-out, and `useAccountSession` rewrite

**Files:**
- Create: `app/api/account/me/route.ts`
- Create: `app/api/auth/signout/route.ts`
- Modify: `lib/useAccountSession.ts` (full rewrite)

**Interfaces:**
- Consumes: `createSupabaseServerClient` (Task 2), `findPlayerTeam` (Task 3), `getPlayerProfileBySlug` from `@/lib/data/players` (existing).
- Produces: `AccountSession` type — `{ kind: "host"; username: string; displayName: string } | { kind: "player"; playerSlug: string; username: string; displayName: string; team: Team | null } | { kind: "fan"; username: string; displayName: string } | null`. `useAccountSession(): AccountSession`. `signOutAccount(): Promise<void>`. These replace the current exports of the same names — every consumer (Task 11) is updated to match this shape (notably: `session.playerFirst` becomes `session.playerSlug`, and there's a new `"fan"` kind that didn't exist before).

- [ ] **Step 1: Write `app/api/account/me/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ session: null });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, is_host, player_slug")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ session: null });
  }

  if (profile.is_host) {
    return NextResponse.json({
      session: { kind: "host", username: profile.username, displayName: profile.display_name },
    });
  }

  if (profile.player_slug) {
    return NextResponse.json({
      session: {
        kind: "player",
        playerSlug: profile.player_slug,
        username: profile.username,
        displayName: profile.display_name,
        team: findPlayerTeam(profile.player_slug),
      },
    });
  }

  return NextResponse.json({
    session: { kind: "fan", username: profile.username, displayName: profile.display_name },
  });
}
```

- [ ] **Step 2: Write `app/api/auth/signout/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Rewrite `lib/useAccountSession.ts`**

```typescript
"use client";

import { useEffect, useState } from "react";
import type { Team } from "@/lib/data";

export type AccountSession =
  | { kind: "host"; username: string; displayName: string }
  | { kind: "player"; playerSlug: string; username: string; displayName: string; team: Team | null }
  | { kind: "fan"; username: string; displayName: string }
  | null;

export function useAccountSession(): AccountSession {
  const [session, setSession] = useState<AccountSession>(null);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      try {
        const res = await fetch("/api/account/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSession(data.session);
      } catch {
        // Network hiccup — leave the last known session in place rather than
        // flashing to signed-out.
      }
    }

    void sync();
    window.addEventListener("mm:session-changed", sync);
    return () => window.removeEventListener("mm:session-changed", sync);
  }, []);

  return session;
}

export async function signOutAccount(): Promise<void> {
  await fetch("/api/auth/signout", { method: "POST" });
  window.dispatchEvent(new CustomEvent("mm:session-changed"));
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: errors in `AccountBadge.tsx`, `AccountMenu.tsx`, `Header.tsx` (they still call `signOutAccount(session)` with an argument, and reference `session.playerFirst`/`session.sessionToken`, which no longer exist) — **expected at this point**, Task 11 fixes every consumer. Confirm the errors are only in those three files.

- [ ] **Step 5: Commit**

```bash
git add app/api/account/me/route.ts app/api/auth/signout/route.ts lib/useAccountSession.ts
git commit -m "feat: rewrite useAccountSession to read Supabase-backed sessions"
```

---

## Task 5: Sign-up

**Files:**
- Create: `app/api/auth/signup/route.ts`
- Create: `app/signup/page.tsx`
- Create: `components/auth/SignUpForm.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient`, `createSupabaseServiceRoleClient` (Task 2), `findUnclaimedSlotForUsername` (Task 3).
- Produces: `POST /api/auth/signup` accepting `{ name, email, username, password }`, returning `{ ok: true }` or `{ ok: false, error: string }`.

- [ ] **Step 1: Write `app/api/auth/signup/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { findUnclaimedSlotForUsername } from "@/lib/portal/matchPlayerUsername";

export async function POST(request: Request) {
  const { name, email, username, password } = await request.json();

  if (!name || !email || !username || !password) {
    return NextResponse.json({ ok: false, error: "All fields are required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const service = createSupabaseServiceRoleClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError || !signUpData.user) {
    return NextResponse.json({ ok: false, error: signUpError?.message ?? "Could not create account." }, { status: 400 });
  }

  // profiles has no client-writable policy — every insert happens here,
  // server-side, with the service-role key.
  const { error: profileError } = await service.from("profiles").insert({
    id: signUpData.user.id,
    email,
    display_name: name,
    username,
    is_host: false,
    player_slug: null,
  });

  if (profileError) {
    // Most likely a duplicate username (profiles.username is unique).
    return NextResponse.json({ ok: false, error: "That username or email is already taken." }, { status: 400 });
  }

  const { data: slots } = await service.from("player_slots").select("player_slug, username, claimed_by");
  const match = findUnclaimedSlotForUsername(username, slots ?? []);

  if (match) {
    await service
      .from("player_slots")
      .update({ claimed_by: signUpData.user.id, claimed_at: new Date().toISOString() })
      .eq("player_slug", match.player_slug)
      .is("claimed_by", null); // guards against a same-instant double-claim race

    await service.from("profiles").update({ player_slug: match.player_slug }).eq("id", signUpData.user.id);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `components/auth/SignUpForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, username, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-[420px] px-4 py-16 text-center sm:px-7">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Check your email</h1>
        <p className="mt-3 font-sans text-sm text-ink-500">
          We sent a verification link to {email}. Click it, then{" "}
          <Link href="/login" className="text-maroon-700 underline underline-offset-2">
            log in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-[420px] flex-col gap-4 px-4 py-16 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Sign Up</h1>
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <input
        required
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <input
        required
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <input
        required
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <input
        required
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50 disabled:opacity-50"
      >
        {submitting ? "Creating account…" : "Sign Up"}
      </button>
      <p className="text-center font-sans text-sm text-ink-500">
        Already have an account?{" "}
        <Link href="/login" className="text-maroon-700 underline underline-offset-2">
          Log in
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Write `app/signup/page.tsx`**

```typescript
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return <SignUpForm />;
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: same three pre-existing errors as Task 4 (unrelated files, fixed in Task 11) — no new errors from these three files.

Manual (needs `.env` filled in per Task 1's `docs/supabase-setup.md`): `npm run dev`, visit `/signup`, submit the form with a brand-new email/username. Expected: "Check your email" screen; Supabase Dashboard -> Table Editor -> `profiles` shows the new row; Authentication -> Users shows the user as unconfirmed.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/signup/route.ts app/signup/page.tsx components/auth/SignUpForm.tsx
git commit -m "feat: add sign-up flow with player-username auto-linking"
```

---

## Task 6: Login (with resend-verification)

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/resend-verification/route.ts`
- Create: `app/login/page.tsx`
- Create: `components/auth/LoginForm.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient`, `createSupabaseServiceRoleClient` (Task 2).
- Produces: `POST /api/auth/login` accepting `{ usernameOrEmail, password }` → `{ ok: true }` (cookies set) or `{ ok: false, error: string, unverified?: boolean }`. `POST /api/auth/resend-verification` accepting `{ email }`.

- [ ] **Step 1: Write `app/api/auth/login/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { usernameOrEmail, password } = await request.json();

  if (!usernameOrEmail || !password) {
    return NextResponse.json({ ok: false, error: "Enter your username/email and password." }, { status: 400 });
  }

  let email = usernameOrEmail;
  if (!usernameOrEmail.includes("@")) {
    const service = createSupabaseServiceRoleClient();
    const { data } = await service.from("profiles").select("email").ilike("username", usernameOrEmail).single();
    if (!data) {
      return NextResponse.json({ ok: false, error: "Incorrect username/email or password." }, { status: 400 });
    }
    email = data.email;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return NextResponse.json({ ok: false, error: "Check your email to verify your account first.", unverified: true }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Incorrect username/email or password." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `app/api/auth/resend-verification/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing email." }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write `components/auth/LoginForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameOrEmail, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        setUnverified(Boolean(data.unverified));
        return;
      }
      window.dispatchEvent(new CustomEvent("mm:session-changed"));
      router.push("/account/choose");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!usernameOrEmail.includes("@")) return;
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: usernameOrEmail }),
    });
    setResent(true);
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-[420px] flex-col gap-4 px-4 py-16 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Login</h1>
      {error && (
        <div className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">
          {error}
          {unverified && (
            <button type="button" onClick={handleResend} className="ml-2 underline underline-offset-2">
              {resent ? "Sent!" : "Resend email"}
            </button>
          )}
        </div>
      )}
      <input
        required
        placeholder="Username or email"
        value={usernameOrEmail}
        onChange={(e) => setUsernameOrEmail(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <input
        required
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50 disabled:opacity-50"
      >
        {submitting ? "Logging in…" : "Login"}
      </button>
      <div className="flex justify-between font-sans text-sm text-ink-500">
        <Link href="/signup" className="text-maroon-700 underline underline-offset-2">
          Sign up instead
        </Link>
        <Link href="/forgot-password" className="text-maroon-700 underline underline-offset-2">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Write `app/login/page.tsx`**

```typescript
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return <LoginForm />;
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — same three pre-existing errors only.

Manual: log in with the account created in Task 5 before verifying its
email. Expected: "Check your email to verify your account first." with a
working "Resend email" link. In Supabase Dashboard -> Authentication ->
Users, manually confirm that user (or click the real emailed link once SMTP
is configured), then log in again. Expected: redirected to `/account/choose`
(a 404 is fine/expected here — that's Task 8).

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/login/route.ts app/api/auth/resend-verification/route.ts app/login/page.tsx components/auth/LoginForm.tsx
git commit -m "feat: add login flow with resend-verification"
```

---

## Task 7: Forgot password / reset password

**Files:**
- Create: `app/api/auth/forgot-password/route.ts`
- Create: `app/api/auth/reset-password/route.ts`
- Create: `app/forgot-password/page.tsx`
- Create: `app/reset-password/page.tsx`
- Create: `components/auth/ForgotPasswordForm.tsx`
- Create: `components/auth/ResetPasswordForm.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient` (Task 2).
- Produces: `POST /api/auth/forgot-password` `{ email }` → `{ ok: true }` (always, regardless of whether the email exists, to avoid account enumeration). `POST /api/auth/reset-password` `{ password }` → `{ ok: true }` (only works when called with the temporary session Supabase's reset-link redirect establishes).

- [ ] **Step 1: Write `app/api/auth/forgot-password/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing email." }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const origin = new URL(request.url).origin;
  // Errors here aren't surfaced — same message either way, so a request
  // can't be used to check whether an email has an account.
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `app/api/auth/reset-password/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  if (!password || password.length < 6) {
    return NextResponse.json({ ok: false, error: "Password must be at least 6 characters." }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write `components/auth/ForgotPasswordForm.tsx`**

```typescript
"use client";

import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-[420px] px-4 py-16 text-center sm:px-7">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Check your email</h1>
        <p className="mt-3 font-sans text-sm text-ink-500">
          If an account exists for {email}, a reset link is on its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-[420px] flex-col gap-4 px-4 py-16 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Forgot Password</h1>
      <input
        required
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <button
        type="submit"
        className="rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50"
      >
        Send reset link
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Write `components/auth/ResetPasswordForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      router.push("/login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-[420px] flex-col gap-4 px-4 py-16 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Set a new password</h1>
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <input
        required
        type="password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-sm border border-ink-300 px-3 py-2 font-sans text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Write the two page files**

`app/forgot-password/page.tsx`:

```typescript
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
```

`app/reset-password/page.tsx`:

```typescript
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` — same three pre-existing errors only.

Manual: `/forgot-password` with the Task 5 test account's email → Supabase
sends (or, without SMTP configured yet, logs) a reset email pointing at
`/reset-password`; following it and submitting a new password redirects to
`/login`; log in with the new password succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/api/auth/forgot-password/route.ts app/api/auth/reset-password/route.ts app/forgot-password/page.tsx app/reset-password/page.tsx components/auth/ForgotPasswordForm.tsx components/auth/ResetPasswordForm.tsx
git commit -m "feat: add forgot-password and reset-password flow"
```

---

## Task 8: Website/Portal fork screen

**Files:**
- Create: `app/account/choose/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient` (Task 2).

- [ ] **Step 1: Write `app/account/choose/page.tsx`**

```typescript
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ChooseAccountPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_host, player_slug")
    .eq("id", user.id)
    .single();

  // Fan accounts have no Portal to fork to — go straight through.
  if (!profile || (!profile.is_host && !profile.player_slug)) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-4 py-16 text-center sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Where to?</h1>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="flex-1 rounded-sm border border-ink-300 px-5 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900 hover:bg-cream-50"
        >
          Website
        </Link>
        <Link
          href="/portal"
          className="flex-1 rounded-sm bg-maroon-700 px-5 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50"
        >
          Portal
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — same three pre-existing errors only.

Manual: log in as the Task 5 fan account (no player link) → confirm it
lands on `/` directly, never seeing this screen. (Testing the host/player
branch that reaches this screen happens in Tasks 9/10 once `/portal`
exists.)

- [ ] **Step 3: Commit**

```bash
git add app/account/choose/page.tsx
git commit -m "feat: add Website/Portal fork screen for players and Tiger"
```

---

## Task 9: Minimal `/portal` landing page

**Files:**
- Create: `app/portal/page.tsx`
- Modify: `next.config.ts` (remove the dead scorekeeper rewrite)

**Interfaces:**
- Consumes: `createSupabaseServerClient` (Task 2), `getPlayerProfileBySlug` from `@/lib/data/players` (existing), `findPlayerTeam` (Task 3).

- [ ] **Step 1: Remove the old rewrite from `next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["lightningcss", "@tailwindcss/oxide"],
};

export default nextConfig;
```

(Deletes the entire `SCOREKEEPER_ORIGIN` constant and `rewrites()` function
— the old standalone scorekeeper app is retired per the design spec, and
`/portal` is now a real page in this app rather than a proxy.)

- [ ] **Step 2: Write `app/portal/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";
import { Avatar } from "@/components/ui/Avatar";
import { TigerAvatar } from "@/components/ui/TigerAvatar";

export default async function PortalPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_host, player_slug, display_name, username")
    .eq("id", user.id)
    .single();

  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");

  if (profile.is_host) {
    return (
      <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 px-4 py-16 text-center sm:px-7">
        <TigerAvatar size="lg" />
        <h1 className="font-serif text-2xl font-bold text-ink-900">Welcome, Tiger</h1>
        <p className="font-sans text-sm text-ink-500">Host tools are coming in a later round.</p>
      </div>
    );
  }

  const playerProfile = getPlayerProfileBySlug(profile.player_slug!);
  const team = findPlayerTeam(profile.player_slug!);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 px-4 py-16 text-center sm:px-7">
      <Avatar name={playerProfile?.fullName ?? profile.display_name} src={playerProfile?.avatarSrc ?? null} size="lg" team={team} />
      <h1 className="font-serif text-2xl font-bold text-ink-900">Welcome, {playerProfile?.fullName ?? profile.display_name}</h1>
      <p className="font-sans text-sm text-ink-500">
        {team ? `Team ${team === "maroon" ? "Maroon" : "White"}` : "Team not yet assigned"} · @{profile.username}
      </p>
      <p className="font-sans text-sm text-ink-500">Scoring and pairings are coming in a later round.</p>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — same three pre-existing errors only.

Manual, using a player account (sign up on `/signup` with a username Tiger
has set on `/portal/admin` — that page is Task 10, so for now set one
directly in Supabase Table Editor by editing a `player_slots` row's
`username` column): log in, land on `/account/choose`, click **Portal**,
confirm the right name/avatar/team/username show up. Click **Website**
from `/account/choose` on a separate login, confirm it lands on `/`
normally. Visiting `/portal` directly while signed out redirects to
`/login`; while signed in as a fan redirects to `/`.

- [ ] **Step 4: Commit**

```bash
git add app/portal/page.tsx next.config.ts
git commit -m "feat: add minimal /portal landing page, retire scorekeeper rewrite"
```

---

## Task 10: Tiger's player-username admin page

**Files:**
- Create: `app/portal/admin/page.tsx`
- Create: `app/api/portal/admin/set-username/route.ts`
- Create: `app/api/portal/admin/unlink/route.ts`
- Create: `components/portal/PlayerSlotsAdmin.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient`, `createSupabaseServiceRoleClient` (Task 2), `playerProfiles` from `@/lib/data/players` (existing).

- [ ] **Step 1: Write `app/api/portal/admin/set-username/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

async function requireHost() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  return profile?.is_host ? user : null;
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { playerSlug, username } = await request.json();
  if (!playerSlug || !username) {
    return NextResponse.json({ ok: false, error: "Missing playerSlug or username." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: slot } = await service.from("player_slots").select("claimed_by").eq("player_slug", playerSlug).single();

  if (slot?.claimed_by) {
    return NextResponse.json({ ok: false, error: "That player's username is locked — unlink first to change it." }, { status: 400 });
  }

  const { error } = await service.from("player_slots").update({ username }).eq("player_slug", playerSlug);
  if (error) {
    return NextResponse.json({ ok: false, error: "That username is already in use." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `app/api/portal/admin/unlink/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

async function requireHost() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  return profile?.is_host ? user : null;
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { playerSlug } = await request.json();
  if (!playerSlug) {
    return NextResponse.json({ ok: false, error: "Missing playerSlug." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  // Clears the claim only — does not delete the linked account, and does
  // not touch that account's profiles.player_slug (matches the design
  // spec's "does not log that account out" requirement).
  await service.from("player_slots").update({ claimed_by: null, claimed_at: null }).eq("player_slug", playerSlug);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write `components/portal/PlayerSlotsAdmin.tsx`**

```typescript
"use client";

import { useState } from "react";

export interface PlayerSlotAdminRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
}

export function PlayerSlotsAdmin({ rows }: { rows: PlayerSlotAdminRow[] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(playerSlug: string) {
    setError(null);
    setBusy(playerSlug);
    try {
      const res = await fetch("/api/portal/admin/set-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, username: drafts[playerSlug] }),
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

  async function handleUnlink(playerSlug: string) {
    setBusy(playerSlug);
    try {
      await fetch("/api/portal/admin/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug }),
      });
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Player Usernames</h1>
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
            <tr key={row.playerSlug} className="border-b border-ink-100">
              <td className="py-2">{row.fullName}</td>
              <td className="py-2">
                {row.claimedBy ? (
                  <span>{row.username}</span>
                ) : (
                  <input
                    defaultValue={row.username ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.playerSlug]: e.target.value }))}
                    className="rounded-sm border border-ink-300 px-2 py-1 text-sm"
                  />
                )}
              </td>
              <td className="py-2">{row.claimedBy ? "Claimed" : "Open"}</td>
              <td className="py-2 text-right">
                {row.claimedBy ? (
                  <button
                    type="button"
                    disabled={busy === row.playerSlug}
                    onClick={() => handleUnlink(row.playerSlug)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                  >
                    Unlink
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === row.playerSlug}
                    onClick={() => handleSave(row.playerSlug)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                  >
                    Save
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Write `app/portal/admin/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { playerProfiles } from "@/lib/data/players";
import { PlayerSlotsAdmin, type PlayerSlotAdminRow } from "@/components/portal/PlayerSlotsAdmin";

export default async function PortalAdminPage() {
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

  const rows: PlayerSlotAdminRow[] = playerProfiles.map((p) => ({
    playerSlug: p.slug,
    fullName: p.fullName,
    username: byslug.get(p.slug)?.username ?? null,
    claimedBy: byslug.get(p.slug)?.claimed_by ?? null,
  }));

  return <PlayerSlotsAdmin rows={rows} />;
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — same three pre-existing errors only.

Manual: in Supabase Table Editor, set one `profiles` row's `is_host` to
`true` for your own test account (this is the one-time manual step from
the design spec — Tiger isn't self-service-promotable through the UI).
Log in as that account, visit `/portal/admin`, confirm all 13 players
list with "Open" status, set a username for one, confirm it now shows
"Claimed" once a matching sign-up happens (Task 5's flow), and confirm
"Unlink" returns it to "Open" and editable. Visiting `/portal/admin` as a
non-host account redirects to `/`.

- [ ] **Step 6: Commit**

```bash
git add app/portal/admin/page.tsx app/api/portal/admin/set-username/route.ts app/api/portal/admin/unlink/route.ts components/portal/PlayerSlotsAdmin.tsx
git commit -m "feat: add Tiger-only player-username admin page"
```

---

## Task 11: Wire Sign Up / Login / fan handling into existing nav components

**Files:**
- Modify: `components/nav/AccountMenu.tsx`
- Modify: `components/AccountBadge.tsx`
- Modify: `components/Header.tsx`

**Interfaces:**
- Consumes: the new `AccountSession` shape and `signOutAccount()` (Task 4, now taking no arguments).

`components/nav/MorePanel.tsx` needs **no changes** — it already gates its
`Portal` link on `session?.kind === "player" || session?.kind === "host"`,
which still holds true under the new session shape.

- [ ] **Step 1: Update `components/nav/AccountMenu.tsx`**

Replace the two `disabled` buttons and the `firstName` line:

```typescript
function welcomeLabel(session: AccountSession): string {
  if (!session) return "Welcome";
  const firstName = session.kind === "host" ? session.username : session.displayName.split(" ")[0];
  return `Welcome, ${firstName}`;
}
```

```typescript
        {session ? (
          <button
            type="button"
            onClick={() => {
              void signOutAccount();
              onClose();
            }}
            className="w-full rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50"
          >
            Log Out
          </button>
        ) : (
          <div className="flex gap-3">
            <Link
              href="/signup"
              onClick={onClose}
              className="flex-1 rounded-sm border border-ink-300 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900 hover:bg-cream-50"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              onClick={onClose}
              className="flex-1 rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50"
            >
              Login
            </Link>
          </div>
        )}
```

(This removes the old "Already have a login? Portal" link — logging in
now happens through `/login` for everyone, and the Portal choice lives on
`/account/choose` after that.)

- [ ] **Step 2: Update `components/AccountBadge.tsx`**

Replace the signed-out branch and the `label`/`kind` handling:

```typescript
  if (!session) {
    if (position !== "footer") {
      return (
        <div className="flex items-center gap-2">
          <Link href="/login" className="font-sans text-sm font-semibold text-white/90 hover:text-white">
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-white/30 px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-white/10"
          >
            Sign Up
          </Link>
        </div>
      );
    }
    return (
      <Link
        href="/login"
        aria-label="Login"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9"
      >
        <Avatar size="xs" />
      </Link>
    );
  }

  const label = session.kind === "host" ? session.username : session.displayName;
  const portalLabel = session.kind === "host" ? "Tiger Center" : session.kind === "player" ? "Player Portal" : null;
```

And guard the `Portal`/`Tiger Center` link in the open menu (fans don't
get one):

```typescript
          {portalLabel && (
            <Link
              href="/portal"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-3 font-sans text-sm text-ink-700 hover:bg-cream-50"
            >
              {portalLabel}
              <ChevronRight size={14} />
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              void signOutAccount();
              setOpen(false);
            }}
            className="flex w-full items-center justify-between px-4 py-3 font-sans text-sm text-ink-700 hover:bg-cream-50"
          >
            Sign Out
            <LogOut size={14} />
          </button>
```

And the avatar rendering (fans get a plain `Avatar`, no team ring):

```typescript
        {session.kind === "host" ? (
          <TigerAvatar size="xs" />
        ) : session.kind === "player" ? (
          <Avatar name={label} src={getPlayerAvatar(session.playerSlug)} size="xs" team={session.team} />
        ) : (
          <Avatar name={label} size="xs" />
        )}
```

- [ ] **Step 3: Update `components/Header.tsx`**

Mobile header icon (`session?.kind === "player"` branch used
`session.playerFirst` — now `session.playerSlug`, and a `"fan"` case is
added):

```typescript
            {session?.kind === "host" ? (
              <TigerAvatar size="xs" />
            ) : session?.kind === "player" ? (
              <Avatar name={getPlayerDisplayName(session.playerSlug)} src={getPlayerAvatar(session.playerSlug)} size="xs" team={session.team} />
            ) : session?.kind === "fan" ? (
              <Avatar name={session.displayName} size="xs" />
            ) : (
              <UserRound size={16} className="text-maroon-700" />
            )}
```

`AccountBadge position="header"` on the desktop row needs no change here
— its own signed-out branch (Task 2 above) now renders Sign Up/Login
directly, which was the actual gap (desktop previously showed nothing at
all when signed out).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors anywhere in the project now.

Run: `npm run build`
Expected: succeeds.

Manual, `npm run dev`:
- Signed out: desktop header shows Login/Sign Up; mobile Account menu
  shows both buttons, both working.
- Signed in as the Task 5 fan account: no Portal/Tiger Center link
  anywhere in the account menu or `AccountBadge` dropdown; `MorePanel`
  shows no Portal item; Sign Out works and immediately reverts the header
  to signed-out.
- Signed in as a player account (Task 9/10's test player): `AccountBadge`
  shows "Player Portal" linking to `/portal`; `MorePanel` shows the same;
  avatar shows the correct team ring.
- Signed in as Tiger: `AccountBadge` shows "Tiger Center"; `TigerAvatar`
  renders.

- [ ] **Step 5: Commit**

```bash
git add components/nav/AccountMenu.tsx components/AccountBadge.tsx components/Header.tsx
git commit -m "feat: wire Sign Up/Login/Portal into header and account menus"
```

---

## Task 12: Full walkthrough and project docs

**Files:**
- Modify: `project_specs.md` (mark this round shipped)

**Interfaces:** none — this task is verification and bookkeeping only.

- [ ] **Step 1: Run the full automated check suite**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all four succeed with no errors/warnings introduced by this
plan's changes.

- [ ] **Step 2: Full manual walkthrough on `npm run dev`**

Follow `docs/supabase-setup.md` end to end with a **real, fresh** Supabase
project (not one already half-configured from earlier tasks' manual DB
edits) to confirm the setup doc itself is accurate for someone doing this
cold. Then, in order:

1. Sign up as a fan (username not matching any player). Confirm "Check
   your email", confirm the row in `profiles` has `player_slug = null`.
2. Confirm login before verifying email is blocked with a working resend.
3. Verify the email (via the real link, or manually in Supabase
   Authentication -> Users), log in, confirm landing goes straight to `/`
   (no fork screen).
4. Promote your own test account to Tiger by setting `is_host = true` on
   its `profiles` row directly in Supabase (documented in
   `docs/supabase-setup.md` as the one manual step). Log in as Tiger,
   confirm `/account/choose` appears, "Website" and "Portal" both work,
   `/portal` shows the Tiger landing, `/portal/admin` lists all 13
   players as "Open".
5. On `/portal/admin`, set a username for one player. Sign up a third test
   account using that exact username. Confirm it auto-links (no separate
   "I'm a player" step needed), confirm `/portal/admin` now shows that
   player as "Claimed", confirm logging in as that account shows
   `/account/choose` and a correct `/portal` identity (name/team/avatar
   from `lib/data/players`, not duplicated data).
6. Unlink that player from `/portal/admin`, confirm status returns to
   "Open" and the username field is editable again, confirm the
   player's own account is unaffected (still logs in fine, still shows as
   a player — check this matches the design's "does not log that account
   out" requirement by re-reading `profiles.player_slug` for that
   account: it should still be set, since Unlink only clears
   `player_slots.claimed_by`, matching Task 10 Step 2's implementation).
7. Try `/forgot-password` and `/reset-password` end to end.
8. Confirm `/portal` and `/portal/admin` both redirect appropriately for
   signed-out visitors and for signed-in fans.

- [ ] **Step 3: Update `project_specs.md`**

Move the "Accounts foundation" entry from "This round's work" into
"Previously shipped rounds" (condensed to 1-2 lines, matching the existing
entries' style), and clear "This round's work" back to describing no
active round (or leave it for whatever the next round turns out to be —
don't invent one).

- [ ] **Step 4: Commit**

```bash
git add project_specs.md
git commit -m "docs: mark accounts-foundation round shipped"
```
