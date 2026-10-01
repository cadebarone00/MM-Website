# My Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in `/profile` page (header + Tournaments / Stats / About tabs) that the bottom-menu Profile button and the platform header's account icon open.

**Architecture:** One new read-only SQL function (`list_my_active_editions`) mirrors the existing `list_my_past_editions`. A pure module `lib/profile/myProfile.ts` holds every rule (names, initials, member-since, Maroon years, teams, merge, stat rows) and is unit-tested; a thin server loader `lib/profile/myProfileServer.ts` gathers data and calls it; a server page renders a client `ProfileView` that only switches tabs.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind (theme tokens in `app/globals.css`), Supabase (server + service-role clients), `node:test` via `tsx`, PGlite for SQL tests, Playwright + `scripts/fake-supabase.mjs` for the browser check.

**Spec:** `project_specs.md` → "Round: My Profile page (spec 2026-09-30 …)" (last section of the file).

## Global Constraints

- Route is `/profile`; signed-out visitors are sent to `/login`.
- `/account/choose` is unchanged (still the post-login screen).
- No new tables. The only SQL is `supabase/platform_active_editions.sql` (`list_my_active_editions(p_profile uuid)`), callable by `service_role` only, user id always from the session.
- If a platform function is missing or errors, its list is empty and the page still loads.
- Name order: `player_slots.full_name` → `profiles.display_name` → `profiles.username` → email before the @.
- Pencil only for players, linking to `/portal/profile`. Gear links to `/settings`.
- Empty-state copy, exactly: "No active tournaments", "No completed tournaments yet", "No stats yet.", "No bio yet."
- Not included: photo upload, MM Coins balance, Edit Flair, a real Settings page.
- **No git commits.** The owner commits, and a second terminal is editing this same tree (incl. `components/nav/SiteBottomNav.tsx`). Change only the lines each task names; never revert others' edits.
- Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`.

## Review Focus

1. **Platform SQL not run in production** (RPC errors) → page still loads with empty platform lists, Maroon years/stats still show. Pinned in Task 6 (drop the function, then load the page).
2. **Same Maroon year from both sources** (static roster + platform legacy edition) → shown once. Pinned in Task 2 (`mergeCompleted` test).
3. **Dynamically added player with no hand-written file** → name from `player_slots.full_name`, initials avatar, "No bio yet.", "No stats yet." Pinned in Task 2 (`profileDisplayName`/`initialsFor` tests) and Task 3 loader (no static profile path).
4. **Missing or invalid account creation date** → no "Member since" line, never "Invalid Date". Pinned in Task 2 (`memberSinceLabel` test).
5. **Narrow phone (360px) and long names** → no sideways scrolling. Pinned in Task 6 (overflow check at 360px).

---

### Task 1: `list_my_active_editions` SQL function

**Files:**
- Create: `supabase/platform_active_editions.sql`
- Modify: `lib/platform/testDatabase.ts` (`CHAIN`: add `"platform_active_editions.sql"` right after `"platform_past_editions.sql"`)
- Modify: `scripts/fake-supabase.mjs` (`MIGRATIONS`: same insertion)
- Modify: `docs/production-migration-checklist.md` (new row after `PAST TOURNAMENTS`)
- Test: `lib/platform/activeTournaments.test.ts`

**Interfaces:**
- Produces: SQL `public.list_my_active_editions(p_profile uuid) returns jsonb` — array of `{slug, name, isLegacy, year, destination, startDate, endDate}`, same shape as `list_my_past_editions`, so `summarizePastEditions()` (in `lib/platform/pastTournaments.ts`) parses it. Order: start date ascending (undated last), then name.

- [ ] **Step 1: Write the failing test** — `lib/platform/activeTournaments.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { summarizePastEditions } from "./pastTournaments.ts";
import { createTournament, database, profile, quick } from "./testDatabase.ts";

async function rosterPlayer(db: PGlite, edition: string, who: string | null) {
  const { tid } = (await db.query<{ tid: string }>("select tournament_id tid from tournament_editions where id = $1", [edition])).rows[0];
  const { id } = (await db.query<{ id: string }>("insert into tournament_players(tournament_id, display_name, profile_id) values ($1, 'Golfer', $2) returning id", [tid, who])).rows[0];
  await db.query("insert into edition_roster(edition_id, tournament_id, tournament_player_id) values ($1, $2, $3)", [edition, tid, id]);
}
const setDates = (db: PGlite, edition: string, start: string | null, end: string | null, published: boolean) =>
  db.query("update tournament_editions set start_date = $2, end_date = $3, published_at = case when $4 then now() else null end where id = $1", [edition, start, end, published]);
const activeFor = async (db: PGlite, who: string) =>
  summarizePastEditions((await db.query<{ l: unknown }>("select list_my_active_editions($1) as l", [who])).rows[0].l);

test("active tournaments: unfinished, published, non-test editions the person is on the roster of", async () => {
  const db = await database();
  try {
    const owner = await profile(db, "owner", { approved: true });
    const golfer = await profile(db, "golfer");
    const stranger = await profile(db, "stranger");
    const make = (name: string, slug: string, seasonYear: number) => createTournament(db, owner, { ...quick, name, slug, seasonYear });
    const finished = await make("Old Cup", "old-cup", 2025);
    const today = await make("Today Cup", "today-cup", 2026);
    const future = await make("Future Cup", "future-cup", 2099);
    const undated = await make("Undated Cup", "undated-cup", 2098);
    const unpublished = await make("Hidden Cup", "hidden-cup", 2097);
    const testSeason = await make("Test Cup", "test-cup", 2096);
    const notPlayed = await make("Other Cup", "other-cup", 2095);
    await setDates(db, finished, "2025-05-01", "2025-05-03", true);
    // Ends today in the edition's own timezone: still active.
    await db.query("update tournament_editions set start_date = (now() at time zone timezone)::date, end_date = (now() at time zone timezone)::date, published_at = now() where id = $1", [today]);
    await setDates(db, future, "2099-05-01", "2099-05-03", true);
    await setDates(db, undated, null, null, true);
    await setDates(db, unpublished, "2097-05-01", "2097-05-03", false);
    await setDates(db, testSeason, "2096-05-01", "2096-05-03", true);
    await db.query("update tournament_editions set is_test = true where id = $1", [testSeason]);
    await setDates(db, notPlayed, "2095-05-01", "2095-05-03", true);
    for (const edition of [finished, today, future, undated, unpublished, testSeason]) await rosterPlayer(db, edition, golfer);
    await rosterPlayer(db, notPlayed, null);

    const active = await activeFor(db, golfer);
    assert.deepEqual(active.map((t) => t.name), ["Today Cup", "Future Cup", "Undated Cup"]);
    assert.deepEqual(active[1], { name: "Future Cup", year: 2099, destination: null, startDate: "2099-05-01", endDate: "2099-05-03", href: "/t/future-cup/2099" });
    assert.deepEqual(await activeFor(db, stranger), []);
    assert.deepEqual(await activeFor(db, owner), [], "organizing is not playing");

    await db.query("set role authenticated");
    await assert.rejects(db.query("select list_my_active_editions($1)", [golfer]), /permission denied/);
    await db.query("reset role");
    await db.query("set role anon");
    await assert.rejects(db.query("select list_my_active_editions($1)", [golfer]), /permission denied/);
  } finally {
    await db.close();
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx tsx --test lib/platform/activeTournaments.test.ts`
Expected: FAIL — `function list_my_active_editions(...) does not exist`.

- [ ] **Step 3: Write the SQL** — `supabase/platform_active_editions.sql`

```sql
-- supabase/platform_active_editions.sql
-- My Profile page (/profile), "Active" tournaments: the editions the
-- signed-in person is on the roster of whose last day (end date, else start
-- date) is today or later in the edition's own timezone. Editions with no
-- dates yet count as active. Same other filters as list_my_past_editions
-- (platform_past_editions.sql): test seasons are left out, and customer
-- tournaments only appear once published; the founding (legacy) tournament
-- is kept because it has its own site.
--
-- Returns only display fields (no ids, emails or handicaps). Called only by
-- the server (service role) with the session's user id.
--
-- Prerequisites: platform_foundation.sql. Safe to run more than once.

begin;

create or replace function public.list_my_active_editions(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
      'slug', t.slug,
      'name', t.name,
      'isLegacy', t.is_legacy,
      'year', e.season_year,
      'destination', e.destination,
      'startDate', e.start_date,
      'endDate', e.end_date
    ) order by e.start_date asc nulls last, t.name), '[]'::jsonb)
  from tournament_editions e
  join tournaments t on t.id = e.tournament_id
  where not e.is_test
    and (t.is_legacy or e.published_at is not null)
    and (coalesce(e.end_date, e.start_date) is null
      or coalesce(e.end_date, e.start_date) >= (now() at time zone e.timezone)::date)
    and exists (
      select 1 from edition_roster r
      join tournament_players p on p.id = r.tournament_player_id
      where r.edition_id = e.id and p.profile_id = p_profile
    );
$fn$;

revoke all on function public.list_my_active_editions(uuid) from public, anon, authenticated;
grant execute on function public.list_my_active_editions(uuid) to service_role;

commit;
```

Then add `"platform_active_editions.sql"` immediately after `"platform_past_editions.sql"` in `CHAIN` (`lib/platform/testDatabase.ts`) and `MIGRATIONS` (`scripts/fake-supabase.mjs`), and add this row after the `PAST TOURNAMENTS` row in `docs/production-migration-checklist.md`:

```
| ACTIVE TOURNAMENTS | `supabase/platform_active_editions.sql` | Lists the unfinished tournaments a signed-in person is on the roster of, on `/profile` (read-only) | Run `drop function public.list_my_active_editions(uuid);` |
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/platform/activeTournaments.test.ts lib/platform/pastTournaments.test.ts`
Expected: PASS (both — the past-editions test still passes with the longer chain).

---

### Task 2: Pure profile rules — `lib/profile/myProfile.ts`

**Files:**
- Create: `lib/profile/myProfile.ts`
- Test: `lib/profile/myProfile.test.ts`

**Interfaces:**
- Consumes: `PastTournament` type (`lib/platform/pastTournaments.ts`), `Tournament`/`Team` types (`lib/data/types.ts`), `pastTournaments` (`lib/data/index.ts`), `getPlayerSlug` (`lib/data/players`), `PlayerYearStats` (`lib/data/stats`).
- Produces:
  - `interface MyProfile { name: string; initials: string; avatarSrc: string | null; memberSince: string | null; canEditBio: boolean; teams: Team[]; active: PastTournament[]; completed: PastTournament[]; stats: CareerStats | null; statsHref: string | null; bio: string | null }`
  - `interface CareerStats { years: number[]; rows: { label: string; values: (string | null)[]; careerTotal: string | null }[] }`
  - `profileDisplayName(n: { fullName?: string | null; displayName?: string | null; username?: string | null; email?: string | null }): string`
  - `initialsFor(name: string): string`
  - `memberSinceLabel(createdAt: string | null | undefined): string | null`
  - `maroonYearsPlayed(playerSlug: string | null, tournaments?: Tournament[]): PastTournament[]`
  - `teamsPlayed(playerSlug: string | null, tournaments?: Tournament[]): Team[]`
  - `mergeCompleted(maroonYears: PastTournament[], platformPast: PastTournament[]): PastTournament[]`
  - `careerStats(yearStats: { year: number; stats: PlayerYearStats | null }[]): CareerStats | null`
  - `LEGACY_SITE_HREF = "/website"` (the href `summarizePastEditions` gives the founding tournament)

- [ ] **Step 1: Write the failing test** — `lib/profile/myProfile.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tournament } from "../data/types";
import {
  careerStats, initialsFor, maroonYearsPlayed, memberSinceLabel, mergeCompleted, profileDisplayName, teamsPlayed,
} from "./myProfile";

const year = (y: number, slug: string, maroon: string[], white: string[]) =>
  ({ slug, year: y, location: `Place ${y}`, startDate: `${y}-01-09`, endDate: `${y}-01-12`, roster: { maroon, white } }) as unknown as Tournament;
const FIXTURE = [year(2024, "2024-a", ["cam-latto"], ["cade-barone"]), year(2025, "2025-b", ["cade-barone"], []), year(2026, "2026-c", ["cam-latto"], [])];

test("name: first non-blank of full name, display name, username, email prefix", () => {
  assert.equal(profileDisplayName({ fullName: "Cade Barone", displayName: "cb", username: "u", email: "x@y.z" }), "Cade Barone");
  assert.equal(profileDisplayName({ fullName: "  ", displayName: "Fan Person", email: "x@y.z" }), "Fan Person");
  assert.equal(profileDisplayName({ username: "fan99", email: "x@y.z" }), "fan99");
  assert.equal(profileDisplayName({ email: "cadebarone@example.com" }), "cadebarone");
  assert.equal(profileDisplayName({}), "Golfer");
});

test("initials: up to two letters, uppercase", () => {
  assert.equal(initialsFor("Cade Barone"), "CB");
  assert.equal(initialsFor("cadebarone"), "C");
  assert.equal(initialsFor("Mary Ann Van Dyke"), "MA");
  assert.equal(initialsFor("   "), "?");
});

test("member since: short date, or null when missing or invalid", () => {
  assert.equal(memberSinceLabel("2023-08-26T15:00:00Z"), "Aug 26, 2023");
  assert.equal(memberSinceLabel(undefined), null);
  assert.equal(memberSinceLabel("not a date"), null);
});

test("Maroon years: only years the player is on either roster, newest first", () => {
  assert.deepEqual(maroonYearsPlayed("cade-barone", FIXTURE), [
    { name: "The Maroon Tournament", year: 2025, destination: "Place 2025", startDate: "2025-01-09", endDate: "2025-01-12", href: "/leaderboard/2025-b" },
    { name: "The Maroon Tournament", year: 2024, destination: "Place 2024", startDate: "2024-01-09", endDate: "2024-01-12", href: "/leaderboard/2024-a" },
  ]);
  assert.deepEqual(maroonYearsPlayed(null, FIXTURE), []);
  assert.deepEqual(maroonYearsPlayed("nobody", FIXTURE), []);
});

test("teams: each team played on, Maroon before White", () => {
  assert.deepEqual(teamsPlayed("cade-barone", FIXTURE), ["maroon", "white"]);
  assert.deepEqual(teamsPlayed("cam-latto", FIXTURE), ["maroon"]);
  assert.deepEqual(teamsPlayed(null, FIXTURE), []);
});

test("completed: Maroon years win over the platform's legacy copy of the same year; newest first", () => {
  const maroon = maroonYearsPlayed("cade-barone", FIXTURE);
  const platform = [
    { name: "The Maroon Tournament", year: 2025, destination: null, startDate: null, endDate: null, href: "/website" },
    { name: "Texas Cup", year: 2026, destination: "Austin", startDate: "2026-05-01", endDate: "2026-05-03", href: "/t/texas-cup/2026" },
    { name: "The Maroon Tournament", year: 2023, destination: null, startDate: null, endDate: null, href: "/website" },
  ];
  assert.deepEqual(mergeCompleted(maroon, platform).map((t) => `${t.name} ${t.year} ${t.href}`), [
    "Texas Cup 2026 /t/texas-cup/2026",
    "The Maroon Tournament 2025 /leaderboard/2025-b",
    "The Maroon Tournament 2024 /leaderboard/2024-a",
    "The Maroon Tournament 2023 /website",
  ]);
  assert.deepEqual(mergeCompleted([], []), []);
});

test("career stats: four headline rows with totals; null when there are none", () => {
  const stats = careerStats([
    { year: 2024, stats: { scoringAverage: 82.5, teamPointsWon: 3, totalEarned: 120, totalSkins: 2 } },
    { year: 2025, stats: null },
    { year: 2026, stats: { scoringAverage: 80, teamPointsWon: 1.5, totalEarned: 40.5 } },
  ]);
  assert.deepEqual(stats, {
    years: [2024, 2025, 2026],
    rows: [
      { label: "Scoring Average", values: ["82.5", null, "80"], careerTotal: null },
      { label: "Team Points Won", values: ["3", null, "1.5"], careerTotal: "4.5" },
      { label: "Total Earned", values: ["$120.00", null, "$40.50"], careerTotal: "$160.50" },
      { label: "Total Skins", values: ["2", null, null], careerTotal: "2" },
    ],
  });
  assert.equal(careerStats([{ year: 2024, stats: null }]), null);
  assert.equal(careerStats([]), null);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx tsx --test lib/profile/myProfile.test.ts`
Expected: FAIL — cannot find module `./myProfile`.

- [ ] **Step 3: Write the implementation** — `lib/profile/myProfile.ts`

```ts
import type { PastTournament } from "../platform/pastTournaments";
import type { Team, Tournament } from "../data/types";
import type { PlayerYearStats } from "../data/stats";
import { pastTournaments } from "../data";
import { getPlayerSlug } from "../data/players";

/**
 * My Profile page (/profile): every rule for what the page shows, kept free
 * of Supabase so it can be unit-tested. myProfileServer.ts gathers the data.
 */
export interface CareerStats {
  years: number[];
  rows: { label: string; values: (string | null)[]; careerTotal: string | null }[];
}

export interface MyProfile {
  name: string;
  initials: string;
  avatarSrc: string | null;
  memberSince: string | null;
  /** Players can edit their bio (admin approves); fans can't. */
  canEditBio: boolean;
  teams: Team[];
  active: PastTournament[];
  completed: PastTournament[];
  stats: CareerStats | null;
  /** The full career stats page, for players who have one. */
  statsHref: string | null;
  bio: string | null;
}

/** Where summarizePastEditions sends the founding tournament. */
export const LEGACY_SITE_HREF = "/website";

const filled = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

export function profileDisplayName(n: { fullName?: string | null; displayName?: string | null; username?: string | null; email?: string | null }): string {
  return filled(n.fullName) ?? filled(n.displayName) ?? filled(n.username) ?? filled(n.email?.split("@")[0]) ?? "Golfer";
}

export function initialsFor(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase());
  return letters.length ? letters.join("") : "?";
}

export function memberSinceLabel(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const onRoster = (names: string[], playerSlug: string) => names.some((name) => getPlayerSlug(name) === playerSlug);

/** The Maroon 2024–26 years this player played, from the static rosters. */
export function maroonYearsPlayed(playerSlug: string | null, tournaments: Tournament[] = pastTournaments): PastTournament[] {
  if (!playerSlug) return [];
  return tournaments
    .filter((t) => onRoster(t.roster.maroon, playerSlug) || onRoster(t.roster.white, playerSlug))
    .sort((a, b) => b.year - a.year)
    .map((t) => ({
      name: "The Maroon Tournament", year: t.year, destination: t.location || null,
      startDate: t.startDate || null, endDate: t.endDate || null, href: `/leaderboard/${t.slug}`,
    }));
}

export function teamsPlayed(playerSlug: string | null, tournaments: Tournament[] = pastTournaments): Team[] {
  if (!playerSlug) return [];
  const teams: Team[] = [];
  if (tournaments.some((t) => onRoster(t.roster.maroon, playerSlug))) teams.push("maroon");
  if (tournaments.some((t) => onRoster(t.roster.white, playerSlug))) teams.push("white");
  return teams;
}

/**
 * Finished years from both sources. A Maroon year the static rosters already
 * cover is dropped from the platform list, so it shows once (with the static
 * row's leaderboard link).
 */
export function mergeCompleted(maroonYears: PastTournament[], platformPast: PastTournament[]): PastTournament[] {
  const covered = new Set(maroonYears.map((t) => t.year));
  const rest = platformPast.filter((t) => !(t.href === LEGACY_SITE_HREF && covered.has(t.year)));
  return [...maroonYears, ...rest].sort((a, b) => b.year - a.year || (b.endDate ?? "").localeCompare(a.endDate ?? "") || a.name.localeCompare(b.name));
}

const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The headline career numbers the player profile shows, year by year. */
export function careerStats(yearStats: { year: number; stats: PlayerYearStats | null }[]): CareerStats | null {
  if (!yearStats.some((y) => y.stats)) return null;
  const row = (label: string, pick: (s: PlayerYearStats) => number | undefined, format: (v: number) => string, total: boolean) => {
    const raw = yearStats.map((y) => (y.stats ? pick(y.stats) : undefined));
    const present = raw.filter((v): v is number => v != null);
    return {
      label,
      values: raw.map((v) => (v != null ? format(v) : null)),
      careerTotal: total && present.length ? format(present.reduce((a, b) => a + b, 0)) : null,
    };
  };
  return {
    years: yearStats.map((y) => y.year),
    rows: [
      row("Scoring Average", (s) => s.scoringAverage, num, false),
      row("Team Points Won", (s) => s.teamPointsWon, num, true),
      row("Total Earned", (s) => s.totalEarned, money, true),
      row("Total Skins", (s) => s.totalSkins, String, true),
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/profile/myProfile.test.ts`
Expected: PASS. (If importing `../data` pulls in something the test runner can't load, import `pastTournaments` from the three year files directly instead and say so in the report.)

---

### Task 3: Server loader — `lib/profile/myProfileServer.ts`

**Files:**
- Create: `lib/profile/myProfileServer.ts`

**Interfaces:**
- Consumes: everything Task 2 produces; `summarizePastEditions` (`lib/platform/pastTournaments.ts`); `createSupabaseServerClient`, `createSupabaseServiceRoleClient` (`@/lib/supabase/server`); `getPlayerProfileBySlug` (`@/lib/data/players`); `getProfileOverrides`, `mergeProfile` (`@/lib/data/players/overrides`); `getPlayerStatsByYear` (`@/lib/data/stats`); RPCs `list_my_active_editions` (Task 1) and `list_my_past_editions` (existing).
- Produces: `loadMyProfile(): Promise<MyProfile | null>` — `null` means signed out.

- [ ] **Step 1: Write the loader**

```ts
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getProfileOverrides, mergeProfile } from "@/lib/data/players/overrides";
import { getPlayerStatsByYear } from "@/lib/data/stats";
import { summarizePastEditions, type PastTournament } from "@/lib/platform/pastTournaments";
import {
  careerStats, initialsFor, maroonYearsPlayed, memberSinceLabel, mergeCompleted, profileDisplayName, teamsPlayed, type MyProfile,
} from "./myProfile";

/** A platform list, or empty if its SQL isn't installed yet or fails. */
async function platformList(fn: "list_my_active_editions" | "list_my_past_editions", profileId: string): Promise<PastTournament[]> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc(fn, { p_profile: profileId });
  if (error) {
    console.error(`${fn} failed:`, error.message);
    return [];
  }
  return summarizePastEditions(data);
}

/**
 * Everything /profile shows for the signed-in person, or null if signed out.
 * The user id comes from the session only (never the request).
 */
export async function loadMyProfile(): Promise<MyProfile | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase.from("profiles").select("player_slug, display_name, username, email").eq("id", user.id).single();
  const playerSlug: string | null = row?.player_slug ?? null;

  let fullName: string | null = null;
  let avatarSrc: string | null = null;
  let bio: string | null = null;
  if (playerSlug) {
    const { data: slot } = await createSupabaseServiceRoleClient().from("player_slots").select("full_name").eq("player_slug", playerSlug).single();
    const staticProfile = getPlayerProfileBySlug(playerSlug);
    fullName = slot?.full_name ?? staticProfile?.fullName ?? null;
    avatarSrc = staticProfile?.avatarSrc ?? null;
    const base = staticProfile ?? { id: playerSlug, slug: playerSlug, fullName: fullName ?? playerSlug, avatarSrc: null, bio: "", history: [] };
    bio = mergeProfile(base, await getProfileOverrides(playerSlug)).bio?.trim() || null;
  }

  const [active, platformPast] = await Promise.all([
    platformList("list_my_active_editions", user.id),
    platformList("list_my_past_editions", user.id),
  ]);
  const name = profileDisplayName({ fullName, displayName: row?.display_name, username: row?.username, email: row?.email ?? user.email });
  const stats = playerSlug ? careerStats(getPlayerStatsByYear(playerSlug)) : null;

  return {
    name,
    initials: initialsFor(name),
    avatarSrc,
    memberSince: memberSinceLabel(user.created_at),
    canEditBio: Boolean(playerSlug),
    teams: teamsPlayed(playerSlug),
    active,
    completed: mergeCompleted(maroonYearsPlayed(playerSlug), platformPast),
    stats,
    statsHref: stats && playerSlug ? `/teams/stats/players/${(getPlayerProfileBySlug(playerSlug)?.id ?? playerSlug).toLowerCase()}` : null,
    bio,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/profile/*` (if the other terminal's files already fail typecheck, list those errors in the report and confirm none are in files this plan touches). If `PlayerProfile` requires fields the synthesized `base` lacks, copy the synthesized object from `app/portal/profile/page.tsx` exactly.

---

### Task 4: The page and its view

**Files:**
- Create: `app/profile/page.tsx`
- Create: `components/profile/ProfileView.tsx`

**Interfaces:**
- Consumes: `loadMyProfile()` (Task 3), `MyProfile` (Task 2), `formatDateRange(start, end)` (`lib/platform/publicSite.ts`).
- Produces: route `/profile`; the view's visible copy is what Task 6 asserts on: tab buttons "Tournaments", "Stats", "About"; toggle buttons "Active", "Completed"; counters labelled "Active" and "Played"; the empty-state strings in Global Constraints; pencil link `aria-label="Edit my bio"`; gear link `aria-label="Settings"`.

- [ ] **Step 1: Write the page** — `app/profile/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { ProfileView } from "@/components/profile/ProfileView";
import { loadMyProfile } from "@/lib/profile/myProfileServer";

export default async function MyProfilePage() {
  const profile = await loadMyProfile();
  if (!profile) redirect("/login");
  return <ProfileView profile={profile} />;
}
```

- [ ] **Step 2: Write the view** — `components/profile/ProfileView.tsx`

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Flag, Pencil, Settings } from "lucide-react";
import { formatDateRange } from "@/lib/platform/publicSite";
import type { MyProfile } from "@/lib/profile/myProfile";
import type { PastTournament } from "@/lib/platform/pastTournaments";

type Tab = "tournaments" | "stats" | "about";
const TABS: { key: Tab; label: string }[] = [
  { key: "tournaments", label: "Tournaments" },
  { key: "stats", label: "Stats" },
  { key: "about", label: "About" },
];

/** The signed-in person's own profile, laid out like a fantasy-app account screen. */
export function ProfileView({ profile }: { profile: MyProfile }) {
  const [tab, setTab] = useState<Tab>("tournaments");
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <div className="min-h-screen bg-maroon-900 text-cream-50">
      <header className="relative bg-[radial-gradient(120%_90%_at_50%_0%,#6b161a_0%,#380001_55%,#240001_100%)] px-4 pb-0 pt-6">
        <Link href="/settings" aria-label="Settings" className="absolute right-4 top-6 rounded-full p-1 text-cream-50 hover:text-gold-300">
          <Settings size={28} aria-hidden="true" />
        </Link>
        <div className="mx-auto flex max-w-[640px] items-center gap-4 pr-10">
          <div className="relative shrink-0">
            <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-maroon-600 font-condensed text-3xl font-bold text-cream-50 shadow-[0_0_0_3px_#c9a86e]">
              {profile.avatarSrc
                ? <Image src={profile.avatarSrc} alt="" width={96} height={96} className="h-full w-full object-cover" />
                : profile.initials}
            </span>
            {profile.canEditBio && (
              <Link href="/portal/profile" aria-label="Edit my bio"
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-maroon-900 bg-gold-400 text-maroon-900">
                <Pencil size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="break-words font-serif text-2xl font-bold leading-tight">{profile.name}</h1>
            {profile.memberSince && <p className="mt-1 text-sm text-cream-50/70">Member since {profile.memberSince}</p>}
            {profile.teams.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Teams">
                {profile.teams.map((team) => (
                  <li key={team}
                    className={team === "maroon"
                      ? "rounded-full border border-gold-400 bg-maroon-700 px-3 py-0.5 font-condensed text-xs font-semibold uppercase tracking-wide text-cream-50"
                      : "rounded-full border border-gold-400 bg-cream-50 px-3 py-0.5 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700"}>
                    Team {team === "maroon" ? "Maroon" : "White"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <nav className="mx-auto mt-6 flex max-w-[640px] justify-around" aria-label="Profile sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
              className={`border-b-4 px-2 pb-2 font-condensed text-lg font-semibold tracking-wide ${tab === t.key ? "border-gold-400 text-cream-50" : "border-transparent text-cream-50/55"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[640px] rounded-t-3xl bg-[#1a0001] px-4 pb-32 pt-6">
        {tab === "tournaments" && (
          <section aria-label="Tournaments">
            <div className="grid grid-cols-2 rounded-full border border-cream-50/40 p-0.5" role="group" aria-label="Show">
              {[{ label: "Active", on: !showCompleted }, { label: "Completed", on: showCompleted }].map((o) => (
                <button key={o.label} type="button" aria-pressed={o.on} onClick={() => setShowCompleted(o.label === "Completed")}
                  className={`rounded-full py-2 font-condensed text-sm font-semibold uppercase tracking-[0.12em] ${o.on ? "bg-cream-50 text-maroon-900" : "text-cream-50"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 divide-x divide-cream-50/20 text-center">
              <div><p className="font-condensed text-5xl font-bold text-gold-300">{profile.active.length}</p><p className="text-sm text-cream-50/70">Active</p></div>
              <div><p className="font-condensed text-5xl font-bold text-gold-300">{profile.completed.length}</p><p className="text-sm text-cream-50/70">Played</p></div>
            </div>
            <div className="mt-6">
              {showCompleted
                ? <TournamentList rows={profile.completed} empty={<p className="text-center text-cream-50/70">No completed tournaments yet</p>} />
                : <TournamentList rows={profile.active} empty={
                    <p className="text-center text-cream-50/70">No active tournaments<br />
                      <Link href="/tournaments/join" className="mt-2 inline-block font-condensed font-semibold uppercase tracking-[0.12em] text-gold-300">Join a Tournament</Link>
                    </p>} />}
            </div>
          </section>
        )}

        {tab === "stats" && (
          <section aria-label="Stats">
            {!profile.stats ? <p className="text-center text-cream-50/70">No stats yet.</p> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left font-condensed uppercase tracking-wide text-cream-50/60">
                      <th className="py-2 pr-2 font-semibold">Stat</th>
                      {profile.stats.years.map((y) => <th key={y} className="px-2 py-2 text-right font-semibold">{y}</th>)}
                      <th className="py-2 pl-2 text-right font-semibold">Career</th>
                    </tr></thead>
                    <tbody>{profile.stats.rows.map((r) => (
                      <tr key={r.label} className="border-t border-cream-50/10">
                        <th scope="row" className="py-2 pr-2 text-left font-normal">{r.label}</th>
                        {r.values.map((v, i) => <td key={i} className="px-2 py-2 text-right tabular-nums">{v ?? "—"}</td>)}
                        <td className="py-2 pl-2 text-right font-semibold tabular-nums text-gold-300">{r.careerTotal ?? "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {profile.statsHref && <Link href={profile.statsHref} className="mt-4 inline-block font-condensed font-semibold uppercase tracking-[0.12em] text-gold-300">Full career stats</Link>}
              </>
            )}
          </section>
        )}

        {tab === "about" && (
          <section aria-label="About">
            {profile.bio ? <p className="whitespace-pre-line leading-relaxed text-cream-50/90">{profile.bio}</p>
              : <p className="text-center text-cream-50/70">No bio yet.</p>}
          </section>
        )}
      </main>
    </div>
  );
}

function TournamentList({ rows, empty }: { rows: PastTournament[]; empty: React.ReactNode }) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <ul className="divide-y divide-cream-50/10 rounded-2xl border border-cream-50/15">
      {rows.map((t) => (
        <li key={`${t.href}-${t.year}`}>
          <Link href={t.href} className="flex items-center gap-3 px-4 py-3">
            <Flag size={20} aria-hidden="true" className="shrink-0 text-gold-300" />
            <span className="min-w-0 flex-1">
              <strong className="block break-words">{t.name} {t.year}</strong>
              {t.destination && <span className="block text-sm text-cream-50/70">{t.destination}</span>}
              {t.startDate && <span className="block text-sm text-cream-50/70">{formatDateRange(t.startDate, t.endDate)}</span>}
            </span>
            <ChevronRight size={18} aria-hidden="true" className="shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

If `formatDateRange`'s module (`publicSite.ts`) imports server-only code and breaks the client bundle, move the call to the server: have `TournamentList` rows carry a precomputed `dates` string instead, built in `myProfileServer.ts`. Report which you did.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: no new errors in `app/profile/*`, `components/profile/*`, `lib/profile/*`.

---

### Task 5: Point Profile links at `/profile`

**Files:**
- Modify: `lib/navigation/siteBottomNav.ts` (the `href === "/account/choose"` branch)
- Modify: `lib/navigation/siteBottomNav.test.ts`
- Modify: `components/nav/SiteBottomNav.tsx` — **only** the Profile tab's `href` (`"/account/choose"` → `"/profile"`)
- Modify: `components/platform/PlatformHeader.tsx` — **only** the account `Link` `href` (`"/account/choose"` → `"/profile"`)

**Interfaces:**
- Produces: `siteBottomNavTabActive(pathname, "/profile")` is true on `/profile`, `/profile/*`, and `/account*`.

- [ ] **Step 1: Update the test** — in `siteBottomNav.test.ts`, inside `test("siteBottomNavTabActive", …)`, replace `assert.equal(siteBottomNavTabActive("/account/settings", "/account/choose"), true);` with:

```ts
  assert.equal(siteBottomNavTabActive("/profile", "/profile"), true);
  assert.equal(siteBottomNavTabActive("/account/choose", "/profile"), true);
  assert.equal(siteBottomNavTabActive("/profiles", "/profile"), false);
  assert.equal(siteBottomNavTabActive("/profile", "/"), false);
```

and add `assert.equal(isSiteBottomNavHidden("/profile"), false);` to the "shows main site routes" test.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx tsx --test lib/navigation/siteBottomNav.test.ts`
Expected: FAIL on `siteBottomNavTabActive("/account/choose", "/profile")` (the generic fallback already makes `("/profile", "/profile")` true).

- [ ] **Step 3: Change the rule** — in `siteBottomNav.ts` replace

```ts
  if (href === "/account/choose") {
    return pathname.startsWith("/account");
  }
```

with

```ts
  // Profile stays lit on the account screens (e.g. the post-login /account/choose).
  if (href === "/profile") {
    return pathname === "/profile" || pathname.startsWith("/profile/") || pathname.startsWith("/account");
  }
```

Then change the two `href`s named in **Files**. Re-read `SiteBottomNav.tsx` right before editing — another terminal edits it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/navigation/siteBottomNav.test.ts` then `npm test`
Expected: PASS; `npm test` shows no new failures (note any pre-existing ones from the other terminal's work separately).

---

### Task 6: Browser check (player, fan, signed out, SQL missing)

**Files:**
- Create: `scripts/test-profile-browser.mjs`
- Modify: `package.json` scripts — add `"test:browser:profile": "node scripts/test-profile-browser.mjs"`

**Interfaces:**
- Consumes: `startFakeSupabase` / `addUser` / `sessionCookie` / `db` from `scripts/fake-supabase.mjs`; the copy listed in Task 4.

- [ ] **Step 1: Write the script**

```js
// End-to-end browser check for /profile against a production build pointed at
// scripts/fake-supabase.mjs (real migrations in an in-memory Postgres).
// Run after `next build`:  node scripts/test-profile-browser.mjs
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startFakeSupabase } from "./fake-supabase.mjs";

const APP_PORT = Number(process.env.APP_PORT ?? 3107);
const FAKE_PORT = Number(process.env.FAKE_PORT ?? 54401);
const app = `http://localhost:${APP_PORT}`;

const fake = await startFakeSupabase({ port: FAKE_PORT });
const fan = await fake.addUser({ name: "fan" });
const player = await fake.addUser({ name: "cadeuser" });
await fake.db.query("update profiles set player_slug = 'cade-barone' where id = $1", [player.id]);

const server = spawn(process.platform === "win32" ? "npx.cmd next start -p " + APP_PORT : "npx", process.platform === "win32" ? [] : ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, SUPABASE_URL: fake.url, SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service" },
  shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const browser = await chromium.launch({ headless: true });
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const phone = async (user, width = 390) => {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  if (user) await context.addCookies([{ ...fake.sessionCookie(user), url: app }]);
  return context.newPage();
};
let failed = false;
try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${app}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Signed out → Log In.
  const out = await phone(null);
  await out.goto(`${app}/profile`);
  assert.match(new URL(out.url()).pathname, /^\/login/);

  // Player.
  const p = await phone(player);
  await p.goto(`${app}/profile`);
  await p.getByRole("heading", { level: 1 }).waitFor();
  assert.match(await p.getByRole("heading", { level: 1 }).innerText(), /Cade Barone/);
  assert.match(await p.locator("body").innerText(), /Member since/i);
  assert.equal(await p.getByRole("link", { name: "Edit my bio" }).getAttribute("href"), "/portal/profile");
  assert.equal(await p.getByRole("link", { name: "Settings" }).getAttribute("href"), "/settings");
  assert.match(await p.getByRole("list", { name: "Teams" }).innerText(), /Team White/i);
  assert.match(await p.locator("main").innerText(), /No active tournaments/i);
  await p.getByRole("button", { name: "Completed" }).click();
  assert.match(await p.locator("main").innerText(), /The Maroon Tournament 2024/i);
  await p.getByRole("button", { name: "Stats" }).click();
  assert.match(await p.locator("main").innerText(), /Scoring Average/i);
  await p.getByRole("button", { name: "About" }).click();
  assert.ok((await p.locator("main").innerText()).trim().length > 0);
  assert.equal(await p.locator('[data-site-bottom-nav] a[aria-current="page"]').innerText().then((t) => t.trim().toLowerCase()), "profile");
  assert.ok((await overflow(p)) <= 0, "player: no sideways scroll at 390px");

  // Fan, at 360px, with the active-tournaments SQL missing (not yet run in production).
  await fake.db.query("drop function public.list_my_active_editions(uuid)");
  const f = await phone(fan, 360);
  await f.goto(`${app}/profile`);
  await f.getByRole("heading", { level: 1 }).waitFor();
  assert.match(await f.getByRole("heading", { level: 1 }).innerText(), /fan/);
  assert.equal(await f.getByRole("link", { name: "Edit my bio" }).count(), 0, "fans get no pencil");
  assert.match(await f.locator("main").innerText(), /No active tournaments/i);
  assert.equal(await f.getByRole("link", { name: /Join a Tournament/i }).getAttribute("href"), "/tournaments/join");
  await f.getByRole("button", { name: "Completed" }).click();
  assert.match(await f.locator("main").innerText(), /No completed tournaments yet/i);
  await f.getByRole("button", { name: "Stats" }).click();
  assert.match(await f.locator("main").innerText(), /No stats yet\./);
  await f.getByRole("button", { name: "About" }).click();
  assert.match(await f.locator("main").innerText(), /No bio yet\./);
  assert.ok((await overflow(f)) <= 0, "fan: no sideways scroll at 360px");

  console.log("profile browser check: PASS");
} catch (error) {
  failed = true;
  console.error(error);
  console.error(serverLog.slice(-4000));
} finally {
  await browser.close();
  server.kill();
  await fake.close();
  process.exit(failed ? 1 : 0);
}
```

If an assertion on copy fails because the real page's wording legitimately differs from Task 4 (e.g. the About bio for `cade-barone` is empty), fix the assertion to match the spec, not the other way round, and say so in the report.

- [ ] **Step 2: Build and run**

Run: `npx next build` then `npm run test:browser:profile`
Expected: `profile browser check: PASS`. If `next build` fails on files outside this plan (the other terminal's work), report the exact error and stop — do not edit those files.

- [ ] **Step 3: Take phone screenshots** (player Tournaments/Completed, Stats, About; fan Tournaments) at 390px and look at them, checking the header matches the screenshot layout in Maroon colors.

---

### Task 7: Spec status + full check

**Files:**
- Modify: `project_specs.md` — the My Profile round heading: change `written spec awaiting approval` to `approved 2026-09-30, built — needs supabase/platform_active_editions.sql run in production`.

- [ ] **Step 1: Update the heading** as above.
- [ ] **Step 2: Run everything**

Run: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run test:browser:profile`
Expected: all pass, or any failure is shown to be pre-existing / from the other terminal's files (with the exact output).
