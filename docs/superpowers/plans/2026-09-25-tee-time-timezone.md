# Tee Time Timezone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded "tee times are always Pacific" assumption with a per-tournament-year configurable venue timezone, while making every non-admin tee-time display on the site render in whoever is actually looking at it's own local time.

**Architecture:** One new `timezone` setting on `live_tournament_settings`, read wherever a tee time is derived or shown venue-locally (Courses & Format, Matchups, the Career Stats archive — all admin tools where Tiger benefits from seeing what he actually typed). Every other display — the public match profile, live leaderboard cards, the Scoring tab, and the portal's "My Matches" cards — switches from a server-computed, zone-fixed string to a browser-formatted one with no explicit zone (which is what "the viewer's own local time" means in JavaScript), following the same server-fetch/client-render split those flows either already have or gain in this plan.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres), `node:test`.

**Spec:** [docs/superpowers/specs/2026-09-25-tee-time-timezone-design.md](../specs/2026-09-25-tee-time-timezone-design.md) — read it alongside this plan.

## Global Constraints

- **Translation boundary, same rule as the prior Sessions/Matchups plan:** Supabase table/column names never change (`live_tournament_settings`, `round_count`, `venue_name`, etc. all stay exactly as they are) — only in-memory JS/TS field names, and this plan's one new column (`timezone`), change.
- **"Venue-local" = the tournament's configured `timezone` setting.** Used only in admin-only screens: Courses & Format (caption only, no derived-time display there), Matchups, and the Career Stats "Round Format Archive."
- **"Viewer-local" = the browser's own local timezone**, obtained by calling `toLocaleTimeString`/`Intl.DateTimeFormat` with **no explicit `timeZone` option** — that is what makes JavaScript default to whatever zone the device itself is set to. Used everywhere else a tee time is shown: the public match profile, live leaderboard cards, the Scoring tab, and the portal's "My Matches" cards.
- **Every viewer-local render must happen in a browser (a `"use client"` component, executing after the data has already reached the client), never during server-side rendering** — the server has no idea what timezone a visitor's device is in. Where a file doesn't already run client-side, this plan adds `"use client"` to it or restructures the data it receives to carry a raw ISO instant instead of a pre-formatted string.
- **`lib/live/sessionTeeTimes.ts`'s existing DST-transition-day correctness (already fixed and tested) must be preserved for whatever zone is passed in, not just Pacific.**
- Every task ends green on: the specific test file(s) it touches. Task 12 runs the full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` sweep.

## Review Focus

- **A tournament year with no `timezone` set yet** (existing rows, before this migration backfills a default) must still work — the DB column has `not null default 'America/Los_Angeles'`, so every existing row gets that value automatically; no code needs a null-check for it. Covered by Task 1's migration and Task 4's type (`timezone: string`, never `string | null`).
- **A timezone selector value that isn't in the curated list** (a stale/tampered request body) must be rejected server-side, not silently written. Covered by Task 5.
- **Changing a tournament's timezone after sessions already have matches** must not silently leave old matches on the previous zone's derived instant — this is exactly the class of bug the prior plan's final review caught and fixed for tee-time edits; the same re-derivation-on-lock path this plan threads a timezone through must keep working. Covered by Task 6 (verify, don't just trust, that the existing re-derivation loop in `sessions/lock/route.ts` still fires correctly once it depends on a second piece of tournament data).
- **A viewer-local render must not crash or show `Invalid Date` before the client has mounted/fetched data** — every site this plan converts to viewer-local already only renders a tee time after real data has arrived (a fetch resolves, or a prop is already populated), so there is no server-rendered placeholder to mismatch during hydration; Task 9's task confirms this is genuinely true for the one site (`ScoringStatusScreen.tsx`) being newly converted to a client component, since that's the one place this plan introduces a new client boundary rather than using an existing one.
- **The "My Matches" card restructure (Task 11) must not break the Live/Past card paths**, which don't involve a timezone at all (`progressLabel` stays a plain "Thru N"/"Final" string) — only the Upcoming path's tee-time field changes shape.

---

## File structure

**New:**
- `supabase/tournament_timezone.sql` — migration adding `timezone` to `live_tournament_settings`.
- `lib/data/timezones.ts` — curated IANA zone list, same pattern as `lib/data/usStates.ts`.
- `lib/live/viewerLocalTime.ts` + `lib/live/viewerLocalTime.test.ts` — the viewer-local formatter.

**Modified:** `lib/live/sessionTeeTimes.ts` (+ test), `lib/live/types.ts`, `components/portal/tiger/MasterSettingsPanel.tsx`, `app/portal/admin/master-settings/[year]/page.tsx`, `app/api/portal/tiger/master-settings/route.ts`, `app/api/portal/tiger/matches/route.ts`, `app/api/portal/tiger/sessions/lock/route.ts`, `components/portal/tiger/MatchupsPanel.tsx`, `app/portal/admin/master-settings/[year]/matchups/page.tsx`, `components/portal/tiger/CoursesFormatPanel.tsx`, `app/portal/admin/master-settings/[year]/courses-format/page.tsx`, `lib/data/liveRoundFormatArchive.ts`, `app/portal/admin/career-stats/page.tsx`, `lib/live/matchProfile.ts`, `components/leaderboard/LiveLeaderboardContent.tsx`, `components/portal/ScoringStatusScreen.tsx`, `lib/portal/matchCards.ts`, `lib/portal/liveMatchCards.ts`, `components/portal/PortalMatches.tsx`, `project_specs.md`.

---

### Task 1: Migration — `timezone` column

**Files:**
- Create: `supabase/tournament_timezone.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/tournament_timezone.sql
-- Adds the tournament year's venue timezone (an IANA zone id, e.g.
-- "America/Los_Angeles") to live_tournament_settings. Tee times for that
-- year are entered and shown venue-local in Tiger's admin tools using this
-- zone; every other display on the site shows the viewer's own local time
-- instead. Defaults to Pacific so the already-in-progress 2027 season (a
-- real California venue) needs no action. Run once in the Supabase SQL
-- Editor.
alter table live_tournament_settings
  add column if not exists timezone text not null default 'America/Los_Angeles';
```

- [ ] **Step 2: Run it against the Supabase project**

Open the Supabase SQL Editor and run this file's contents once. Confirm with:

```sql
select season_year, timezone from live_tournament_settings order by season_year;
```

Expected: every existing row now shows `America/Los_Angeles`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tournament_timezone.sql
git commit -m "Add timezone column to live_tournament_settings"
```

---

### Task 2: `lib/data/timezones.ts` — curated zone list

**Files:**
- Create: `lib/data/timezones.ts`

**Interfaces:**
- Produces: `TIMEZONES: { id: string; label: string }[]`, `TIMEZONE_IDS: Set<string>` — Task 5 (Master Settings UI + API validation) and Task 8's viewer-local work do not need this (viewer-local never picks from a list, it always uses the browser's own zone).

- [ ] **Step 1: Write the file**

```typescript
/** Curated venue-timezone choices for a tournament year, same pattern as US_STATES (lib/data/usStates.ts) — a full IANA zone picker (400+ entries) is bad UX for a trip that only ever lands in a handful of real places. Add more the same way as the list grows. */
export const TIMEZONES: { id: string; label: string }[] = [
  { id: "America/Los_Angeles", label: "Pacific Time" },
  { id: "America/Denver", label: "Mountain Time" },
  { id: "America/Mazatlan", label: "Mexican Pacific Time (e.g. Danzante Bay)" },
  { id: "America/Chicago", label: "Central Time" },
  { id: "America/New_York", label: "Eastern Time" },
];

export const TIMEZONE_IDS = new Set(TIMEZONES.map((zone) => zone.id));
```

- [ ] **Step 2: Commit**

```bash
git add lib/data/timezones.ts
git commit -m "Add curated tournament-timezone list"
```

---

### Task 3: Parameterize `lib/live/sessionTeeTimes.ts` (TDD)

**Files:**
- Modify: `lib/live/sessionTeeTimes.ts`, `lib/live/sessionTeeTimes.test.ts`

**Interfaces:**
- Produces: `deriveMatchTeeTime(date: string | null, timeOfDay: string | null, timezone: string): Date | null` (was 2-arg, hardcoded Pacific), `formatTeeTimeInZone(date: Date, timezone: string): string` (was `formatPacificTeeTime(date: Date)`, hardcoded Pacific). Every caller in Tasks 6–7 passes the tournament's real `timezone` value; Task 2's `TIMEZONES`/`TIMEZONE_IDS` are not used here (this file works with any IANA string, curated or not).

This is a pure parameterization — the DST-correction algorithm itself (the two-pass offset measurement) doesn't change at all, only which zone string it's measured against.

- [ ] **Step 1: Update the failing tests first**

Replace `lib/live/sessionTeeTimes.test.ts`'s content with:

```typescript
// lib/live/sessionTeeTimes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { deriveMatchTeeTime, formatTeeTimeInZone, teeTimeSlotForMatch } from "./sessionTeeTimes.ts";

const PACIFIC = "America/Los_Angeles";
const CENTRAL = "America/Chicago";

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
  const result = deriveMatchTeeTime("2027-07-15", "07:30", PACIFIC);
  assert.equal(result?.toISOString(), "2027-07-15T14:30:00.000Z");
});

test("deriveMatchTeeTime converts a Pacific wall-clock time to the correct UTC instant in PST (winter)", () => {
  const result = deriveMatchTeeTime("2027-01-06", "07:30", PACIFIC);
  assert.equal(result?.toISOString(), "2027-01-06T15:30:00.000Z");
});

test("deriveMatchTeeTime is correct on the spring-forward transition day (2027-03-14)", () => {
  const result = deriveMatchTeeTime("2027-03-14", "07:30", PACIFIC);
  assert.equal(result?.toISOString(), "2027-03-14T14:30:00.000Z");
  assert.equal(formatTeeTimeInZone(result!, PACIFIC), "7:30 AM PDT");
});

test("deriveMatchTeeTime is correct on the fall-back transition day (2027-11-07)", () => {
  const result = deriveMatchTeeTime("2027-11-07", "07:30", PACIFIC);
  assert.equal(result?.toISOString(), "2027-11-07T15:30:00.000Z");
  assert.equal(formatTeeTimeInZone(result!, PACIFIC), "7:30 AM PST");
});

test("deriveMatchTeeTime returns null when the date or the time of day is missing", () => {
  assert.equal(deriveMatchTeeTime(null, "07:30", PACIFIC), null);
  assert.equal(deriveMatchTeeTime("2027-01-06", null, PACIFIC), null);
  assert.equal(deriveMatchTeeTime(null, null, PACIFIC), null);
});

test("deriveMatchTeeTime works for a non-Pacific zone (proves the parameter is actually used, not a renamed constant)", () => {
  // 7:30 AM Central (summer, CDT = UTC-5) is 12:30 UTC.
  const result = deriveMatchTeeTime("2027-07-15", "07:30", CENTRAL);
  assert.equal(result?.toISOString(), "2027-07-15T12:30:00.000Z");
  assert.equal(formatTeeTimeInZone(result!, CENTRAL), "7:30 AM CDT");
});

test("formatTeeTimeInZone labels the instant in whichever zone is passed, regardless of season", () => {
  assert.equal(formatTeeTimeInZone(new Date("2027-07-15T14:30:00.000Z"), PACIFIC), "7:30 AM PDT");
  assert.equal(formatTeeTimeInZone(new Date("2027-01-06T15:30:00.000Z"), PACIFIC), "7:30 AM PST");
});
```

Note the expected label changed from a fixed `"7:30 AM PT"` to season-aware `"7:30 AM PDT"`/`"7:30 AM PST"` — `timeZoneName: "short"` (added in Step 3 below) reports the real abbreviation for whatever zone/date it's given, which is more accurate than the old hand-picked "PT" suffix and is what makes a reader able to tell Pacific from Mountain from Central at a glance once multiple zones are in play.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test lib/live/sessionTeeTimes.test.ts`
Expected: FAIL — `deriveMatchTeeTime`/`formatTeeTimeInZone` don't have the new signatures yet.

- [ ] **Step 3: Update the implementation**

```typescript
import type { MatchFormat } from "./types.ts";

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

function offsetMinutes(utcGuess: Date, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
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
 * times, interpreted as wall-clock time in the given IANA `timezone` (DST
 * handled automatically), into the absolute instant a match's teeTime
 * should be. Null if either input is missing — callers must show a "TBD"
 * fallback rather than format an invalid date.
 */
export function deriveMatchTeeTime(date: string | null, timeOfDay: string | null, timezone: string): Date | null {
  if (!date || !timeOfDay) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = timeOfDay.split(":").map(Number);
  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) return null;
  // First guess: treat the wall-clock time as if it were already UTC, then
  // measure the zone's real offset at that instant and correct for it. On
  // the two DST transition days each year that first measurement can land
  // on the wrong side of the change — a morning tee time is exactly where
  // this happens, because its UTC-shaped guess falls before the transition
  // while the real instant falls after it (or vice versa in November). So
  // re-measure the offset at the corrected instant and, if it moved, correct
  // again from the original guess using the offset that actually applies.
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const firstOffset = offsetMinutes(utcGuess, timezone);
  const firstPass = new Date(utcGuess.getTime() - firstOffset * 60000);
  const secondOffset = offsetMinutes(firstPass, timezone);
  if (secondOffset === firstOffset) return firstPass;
  return new Date(utcGuess.getTime() - secondOffset * 60000);
}

/** "7:30 AM PDT" — for displaying an already-absolute tee time back in a specific zone (venue-local admin screens; see lib/live/viewerLocalTime.ts for the viewer-local equivalent everywhere else). */
export function formatTeeTimeInZone(date: Date, timezone: string): string {
  return date.toLocaleTimeString("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test lib/live/sessionTeeTimes.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/live/sessionTeeTimes.ts lib/live/sessionTeeTimes.test.ts
git commit -m "Parameterize sessionTeeTimes.ts by timezone instead of hardcoding Pacific"
```

---

### Task 4: `TournamentSettings.timezone`

**Files:**
- Modify: `lib/live/types.ts`

**Interfaces:**
- Produces: `TournamentSettings.timezone: string` (never null — the DB column always has a value via its default). Consumed by every task from here on that reads or writes tournament settings.

- [ ] **Step 1: Add the field**

In `lib/live/types.ts`, add `timezone: string;` to the `TournamentSettings` interface, placed after `venueLocked` (it travels with the venue):

```typescript
export interface TournamentSettings {
  sessionCount: number | null;
  completedAt: string | null; // ISO timestamp, null until the tournament is done
  venueName: string | null;
  venueLocked: boolean;
  timezone: string; // IANA zone id, e.g. "America/Los_Angeles" — see lib/data/timezones.ts
  beginDate: string | null; // ISO date (YYYY-MM-DD)
  endDate: string | null; // ISO date (YYYY-MM-DD)
  datesLocked: boolean;
}
```

- [ ] **Step 2: Confirm the resulting compile-error checklist**

Run: `npx tsc --noEmit` — expect new errors in every file that builds a `TournamentSettings` object without a `timezone` field (the server pages that read `live_tournament_settings`) and possibly none yet elsewhere (nothing reads `.timezone` yet). This is your checklist for Task 5.

- [ ] **Step 3: Commit**

```bash
git add lib/live/types.ts
git commit -m "Add TournamentSettings.timezone"
```

---

### Task 5: Master Settings — timezone selector (UI + API)

**Files:**
- Modify: `components/portal/tiger/MasterSettingsPanel.tsx`, `app/portal/admin/master-settings/[year]/page.tsx`, `app/api/portal/tiger/master-settings/route.ts`

**Interfaces:**
- Consumes: `TournamentSettings.timezone` (Task 4), `TIMEZONES`/`TIMEZONE_IDS` (Task 2).
- Produces: `POST /api/portal/tiger/master-settings` now accepts/writes `timezone`. `MasterSettingsPanel` shows a zone `<select>` sharing the Venue Name section's existing lock.

- [ ] **Step 1: `app/portal/admin/master-settings/[year]/page.tsx`**

Add `timezone` to the `.select()` string and the mapped object:

```typescript
  const [{ data: settingsRow }, activeYear] = await Promise.all([
    service
      .from("live_tournament_settings")
      .select("round_count, completed_at, venue_name, venue_locked, timezone, begin_date, end_date, dates_locked")
      .eq("season_year", year)
      .maybeSingle(),
    getActiveSeasonYear(),
  ]);

  const settings: TournamentSettings = {
    sessionCount: settingsRow?.round_count ?? null,
    completedAt: settingsRow?.completed_at ?? null,
    venueName: settingsRow?.venue_name ?? null,
    venueLocked: settingsRow?.venue_locked ?? false,
    timezone: settingsRow?.timezone ?? "America/Los_Angeles",
    beginDate: settingsRow?.begin_date ?? null,
    endDate: settingsRow?.end_date ?? null,
    datesLocked: settingsRow?.dates_locked ?? false,
  };
```

(The `?? "America/Los_Angeles"` fallback only matters for a row that somehow doesn't exist yet — `maybeSingle()` can return `null` — once a row exists the column's own `not null default` guarantees a real value.)

- [ ] **Step 2: `components/portal/tiger/MasterSettingsPanel.tsx`**

Add local state, a `<select>` inside the existing "Venue Name" section (sharing its `venueLocked` toggle — no new lock button), and include `timezone` in the save payload:

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import type { TournamentSettings } from "@/lib/live/types";
import { TIMEZONES } from "@/lib/data/timezones";

const SETUP_BOXES = [
  { label: "Players & Teams", path: "players-teams" },
  { label: "Courses & Format", path: "courses-format" },
  { label: "Matchups", path: "matchups" },
];

export function MasterSettingsPanel({ year, initialSettings, isActiveYear }: { year: number; initialSettings: TournamentSettings; isActiveYear: boolean }) {
  const [beginDate, setBeginDate] = useState(initialSettings.beginDate ?? "");
  const [endDate, setEndDate] = useState(initialSettings.endDate ?? "");
  const [datesLocked, setDatesLocked] = useState(initialSettings.datesLocked);
  const [venueName, setVenueName] = useState(initialSettings.venueName ?? "");
  const [venueLocked, setVenueLocked] = useState(initialSettings.venueLocked);
  const [timezone, setTimezone] = useState(initialSettings.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingActive, setSettingActive] = useState(false);

  async function save() {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/portal/tiger/master-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, beginDate: beginDate || null, endDate: endDate || null, datesLocked, venueName: venueName.trim() || null, venueLocked, timezone }) });
      const data = await response.json();
      if (!data.ok) { setError(data.error); return; }
      window.location.reload();
    } finally { setSaving(false); }
  }

  async function setActiveYear() {
    if (!window.confirm(`Make ${year} the active year? This is what the public site and player scoring will follow.`)) return;
    setSettingActive(true); setError(null);
    try {
      const response = await fetch("/api/portal/tiger/active-season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year }) });
      const data = await response.json();
      if (!data.ok) { setError(data.error); return; }
      window.location.reload();
    } finally { setSettingActive(false); }
  }

  return <div className="mt-6">
    {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
    <div className="mt-3">{isActiveYear ? <span className="rounded-full bg-maroon-700 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white">Active Year</span> : <button type="button" disabled={settingActive} onClick={setActiveYear} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50">{settingActive ? "Setting…" : "Set as Active Year"}</button>}</div>

    <section className="mt-6 rounded-lg border-2 border-stone-300 p-4">
      <div className="flex items-center justify-between"><h2 className="font-serif text-lg font-bold text-ink-900">Tournament Dates</h2><button type="button" disabled={!datesLocked && (!beginDate || !endDate)} onClick={() => setDatesLocked((value) => !value)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50">{datesLocked ? "Unlock" : "Lock"}</button></div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 font-sans text-xs text-ink-700">Begin Date<input type="date" value={beginDate} disabled={datesLocked} onChange={(event) => setBeginDate(event.target.value)} className="rounded-lg border-2 border-stone-300 px-2 py-2 text-sm" /></label><label className="flex flex-col gap-1 font-sans text-xs text-ink-700">End Date<input type="date" value={endDate} disabled={datesLocked} onChange={(event) => setEndDate(event.target.value)} className="rounded-lg border-2 border-stone-300 px-2 py-2 text-sm" /></label></div>
    </section>

    <section className="mt-4 rounded-lg border-2 border-stone-300 p-4">
      <div className="flex items-center justify-between"><h2 className="font-serif text-lg font-bold text-ink-900">Venue Name & Timezone</h2><button type="button" disabled={!venueLocked && !venueName.trim()} onClick={() => setVenueLocked((value) => !value)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50">{venueLocked ? "Unlock" : "Lock"}</button></div>
      <input type="text" value={venueName} disabled={venueLocked} onChange={(event) => setVenueName(event.target.value)} placeholder="e.g. Mission Hills CC" className="mt-3 w-full rounded-lg border-2 border-stone-300 px-2 py-2 text-sm" />
      <label className="mt-3 block font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">
        Venue timezone
        <select value={timezone} disabled={venueLocked} onChange={(event) => setTimezone(event.target.value)} className="mt-1 block w-full rounded-lg border-2 border-stone-300 px-2 py-2 font-sans text-sm normal-case text-ink-900">
          {TIMEZONES.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
        </select>
      </label>
      <p className="mt-2 font-sans text-xs text-ink-500">Match tee times on Courses & Format are entered in this timezone. Everywhere else on the site shows each visitor's own local time.</p>
    </section>

    <button type="button" disabled={saving} onClick={save} className="mt-4 rounded-lg bg-maroon-700 px-5 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">{SETUP_BOXES.map((box) => <Link key={box.path} href={`/portal/admin/master-settings/${year}/${box.path}`} className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">{box.label}</Link>)}<Link href="/portal/admin/scorecards" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Scorecards & Video</Link><Link href="/portal/admin/scoring-preview" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Live Scoring Preview</Link></div>
  </div>;
}
```

- [ ] **Step 3: `app/api/portal/tiger/master-settings/route.ts`**

Add `timezone` to the destructure, validate it against `TIMEZONE_IDS`, and write it:

```typescript
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { TIMEZONE_IDS } from "@/lib/data/timezones";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, beginDate, endDate, datesLocked, venueName, venueLocked, timezone } = await request.json();
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
  if (typeof timezone !== "string" || !TIMEZONE_IDS.has(timezone)) {
    return NextResponse.json({ ok: false, error: "Invalid timezone." }, { status: 400 });
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
    timezone,
  });
  if (error) {
    console.error("Master Settings save failed:", error);
    const needsMultiYearMigration = /season_year|venue_name|venue_locked|begin_date|end_date|dates_locked|timezone|primary key|duplicate key/i.test(error.message);
    return NextResponse.json({
      ok: false,
      error: needsMultiYearMigration
        ? "Your Supabase database needs the current multi-year setup. Run the full supabase/live_match_publication.sql file (and supabase/tournament_timezone.sql) in the Supabase SQL Editor, then save again."
        : `Could not save Master Settings: ${error.message}`,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Manual check**

Run: `npm run dev`, confirm the Venue Name section now shows a timezone dropdown defaulting to "Pacific Time," changing and saving it persists across a reload, and it's disabled while the venue is locked (same as the venue name field).

- [ ] **Step 5: Commit**

```bash
git add components/portal/tiger/MasterSettingsPanel.tsx "app/portal/admin/master-settings/[year]/page.tsx" app/api/portal/tiger/master-settings/route.ts
git commit -m "Add a venue timezone selector to Master Settings"
```

---

### Task 6: Thread the tournament's timezone into tee-time derivation

**Files:**
- Modify: `app/api/portal/tiger/matches/route.ts`, `app/api/portal/tiger/sessions/lock/route.ts`

**Interfaces:**
- Consumes: `deriveMatchTeeTime(date, timeOfDay, timezone)` (Task 3, new 3rd param).

- [ ] **Step 1: `app/api/portal/tiger/matches/route.ts`**

The POST handler's session-row fetch (currently `select("format, course_locked, matchups_locked, started, date, match_tee_times")`) needs the tournament's timezone too. Since `timezone` lives on `live_tournament_settings` (keyed by `season_year`), not `live_round_state`, add one more query:

```typescript
  const { data: sessionRow } = await service.from("live_round_state").select("format, course_locked, matchups_locked, started, date, match_tee_times").eq("season_year", year).eq("round", session).single();
  if (!sessionRow?.course_locked || !sessionRow.format) {
    return NextResponse.json({ ok: false, error: "Lock this session's course and format before building matchups." }, { status: 400 });
  }
  if (sessionRow.started) {
    return NextResponse.json({ ok: false, error: "This session is armed; use Tiger's correction flow for a live matchup." }, { status: 400 });
  }
  const format = sessionRow.format as MatchFormat;

  const { data: tournamentRow } = await service.from("live_tournament_settings").select("timezone").eq("season_year", year).maybeSingle();
  const timezone = tournamentRow?.timezone ?? "America/Los_Angeles";

  const teeTimes = (sessionRow.match_tee_times as (string | null)[] | null) ?? [null, null, null];
  const slot = teeTimeSlotForMatch(format, matchNumber);
  const teeTime = deriveMatchTeeTime(sessionRow.date, teeTimes[slot] ?? null, timezone);
```

(The `?? "America/Los_Angeles"` fallback is defensive only — every real row has a value via the column's `not null default` from Task 1 — but a brand-new season whose settings row hasn't been created at all yet could return `null` from `maybeSingle()`.)

- [ ] **Step 2: `app/api/portal/tiger/sessions/lock/route.ts`**

Same addition, in the `lock === "course"` / `value === true` branch, right after the existing `current` fetch (which already reads `date, course_id, format, course_setup, match_tee_times`) and before the tee-times-set check:

```typescript
      const { data: current } = await service.from("live_round_state").select("date, course_id, format, course_setup, match_tee_times").eq("season_year", year).eq("round", session).single();
      if (!current?.date || !current?.course_id || !current?.format) {
        return NextResponse.json({ ok: false, error: "Set a date, course, and format before locking this session." }, { status: 400 });
      }
      const { data: tournamentRow } = await service.from("live_tournament_settings").select("timezone").eq("season_year", year).maybeSingle();
      const timezone = tournamentRow?.timezone ?? "America/Los_Angeles";
      const teeTimes = (current.match_tee_times as (string | null)[] | null) ?? [null, null, null];
```

And update the two `deriveMatchTeeTime(...)` calls further down in this same branch (the re-derivation loop added by the prior plan's final review) to pass `timezone` as the 3rd argument:

```typescript
      for (const match of existingMatches ?? []) {
        const slot = teeTimeSlotForMatch(match.format as MatchFormat, match.box_number);
        const derived = deriveMatchTeeTime(current.date, teeTimes[slot] ?? null, timezone);
        if (!derived) continue;
```

- [ ] **Step 3: Run the routes' tests**

Run: `npx tsx --test app/api/portal/tiger/matches/route.test.ts app/api/portal/tiger/sessions/lock/route.test.ts` (these only exercise the unauthenticated-rejection branch per the prior plan's own notes, so they should be unaffected — confirm they still pass).

- [ ] **Step 4: Commit**

```bash
git add app/api/portal/tiger/matches/route.ts app/api/portal/tiger/sessions/lock/route.ts
git commit -m "Thread the tournament's configured timezone into tee-time derivation"
```

---

### Task 7: Admin venue-local displays — Matchups

**Files:**
- Modify: `components/portal/tiger/MatchupsPanel.tsx`, `app/portal/admin/master-settings/[year]/matchups/page.tsx`

**Interfaces:**
- Consumes: `formatTeeTimeInZone` (Task 3), `TournamentSettings.timezone` (Task 4).
- Produces: `MatchupsPanel` gains a required `timezone: string` prop.

- [ ] **Step 1: `app/portal/admin/master-settings/[year]/matchups/page.tsx`**

Add a `live_tournament_settings` fetch alongside the existing 3, and pass `timezone` down:

```typescript
  const service = createSupabaseServiceRoleClient();
  const [{ data: sessionRows }, { data: matchRows }, { data: rosterRows }, { data: settingsRow }] = await Promise.all([
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
    service.from("live_tournament_settings").select("timezone").eq("season_year", year).maybeSingle(),
  ]);

  const timezone = settingsRow?.timezone ?? "America/Los_Angeles";
```

...and in the JSX: `<MatchupsPanel year={year} sessions={sessions} initialMatches={matches} roster={roster} timezone={timezone} />`.

- [ ] **Step 2: `components/portal/tiger/MatchupsPanel.tsx`**

Add `timezone` to the props type and destructure, and use it in `teeTimeLabelFor` (replacing `formatPacificTeeTime` with `formatTeeTimeInZone(date, timezone)` in both places it's called, and passing `timezone` as `deriveMatchTeeTime`'s 3rd argument):

```typescript
import { deriveMatchTeeTime, formatTeeTimeInZone, teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
```

```typescript
export function MatchupsPanel({
  year,
  sessions,
  initialMatches,
  roster,
  timezone,
}: {
  year: number;
  sessions: LiveSessionState[];
  initialMatches: LiveMatch[];
  roster: RosterPlayer[];
  timezone: string;
}) {
```

```typescript
  function teeTimeLabelFor(session: LiveSessionState & { format: MatchFormat }, matchNumber: number): string {
    const slot = teeTimeSlotForMatch(session.format, matchNumber);
    const teeTime = deriveMatchTeeTime(session.date, session.matchTeeTimes[slot] ?? null, timezone);
    if (teeTime) return formatTeeTimeInZone(teeTime, timezone);
    // The session's own slots can be empty while its matches already hold a
    // real tee_time — e.g. right after session_tee_times.sql adds the column
    // to a season whose sessions were locked (and matches built) beforehand.
    // Show what the match is actually running on rather than "TBD".
    const saved = initialMatches.find((m) => m.session === session.session && m.matchNumber === matchNumber);
    if (saved?.teeTime && !Number.isNaN(saved.teeTime.getTime())) return formatTeeTimeInZone(saved.teeTime, timezone);
    return "Tee time TBD";
  }
```

No other function in this file references a tee time or the old formatter name — everything else (player selects, lock/save/remove actions) is untouched.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, confirm the Matchups page still shows tee times correctly for the (Pacific-default) active season, and that changing Master Settings' timezone to a different zone and reloading Matchups shows the same underlying instant relabeled in the new zone.

- [ ] **Step 4: Commit**

```bash
git add components/portal/tiger/MatchupsPanel.tsx "app/portal/admin/master-settings/[year]/matchups/page.tsx"
git commit -m "Matchups shows tee times in the tournament's configured venue timezone"
```

---

### Task 8: Admin venue-local displays — Career Stats archive

**Files:**
- Modify: `lib/data/liveRoundFormatArchive.ts`, `app/portal/admin/career-stats/page.tsx`

**Interfaces:**
- Consumes: `formatTeeTimeInZone` (Task 3).
- Produces: `liveRoundFormatArchive(snapshot, slug, year, setups, timezone)` gains a 5th parameter.

- [ ] **Step 1: `lib/data/liveRoundFormatArchive.ts`**

```typescript
import type { LiveTournamentSnapshot } from "@/lib/live/types";
import { formatTeeTimeInZone } from "@/lib/live/sessionTeeTimes";
import type { RoundFormatEntry } from "./roundFormatArchive";
import type { RoundFormatSetup } from "./roundFormatSetups";

export function liveRoundFormatArchive(snapshot: LiveTournamentSnapshot, slug: string, year: number, setups: RoundFormatSetup[], timezone: string) {
  const rounds = [...new Set(snapshot.matchBoxes.map(box => box.session))].sort((a, b) => a - b);
  const dateFor = (round: number) => setups.find(setup => setup.seasonYear === year && setup.round === round)?.datePlayed ??
    snapshot.matchBoxes.find(box => box.session === round)?.teeTime.toLocaleDateString("en-CA", { timeZone: timezone }) ?? "";
  const dates = [...new Set(rounds.map(dateFor))].sort();
  const entries: RoundFormatEntry[] = rounds.map(round => {
    const boxes = snapshot.matchBoxes.filter(box => box.session === round);
    const sameDay = rounds.filter(number => dateFor(number) === dateFor(round));
    return { round, day: dates.indexOf(dateFor(round)) + 1, session: sameDay.indexOf(round) === 0 ? "Morning" : "Afternoon",
      format: boxes[0].format, setup: setups.find(setup => setup.seasonYear === year && setup.round === round),
      matchups: boxes.map(box => ({ side: box.maroonPlayers, opponent: box.whitePlayers,
        href: box.id ? `/leaderboard/${slug}/matches/${box.id}` : undefined,
        teeTime: formatTeeTimeInZone(box.teeTime, timezone) })) };
  });
  return { entries, dayDates: Object.fromEntries(dates.map((date, index) => [index + 1, date])) };
}
```

- [ ] **Step 2: `app/portal/admin/career-stats/page.tsx`**

Fetch the live tournament's timezone and pass it to the one call site (inside the `isPastLeaderboardSwitchover()` branch):

```typescript
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
```

(add this import if not already present — check first, `createSupabaseServerClient` is already imported; the service-role client is a separate helper from the same module, already used elsewhere in this codebase e.g. in the Matchups/Courses & Format pages)

```typescript
  if (isPastLeaderboardSwitchover()) {
    const snapshot = await buildLiveTournamentSnapshot(nextTournament.year, { confirmedOnly: true });
    const service = createSupabaseServiceRoleClient();
    const { data: settingsRow } = await service.from("live_tournament_settings").select("timezone").eq("season_year", nextTournament.year).maybeSingle();
    const timezone = settingsRow?.timezone ?? "America/Los_Angeles";
    roundFormatTournaments.unshift({ slug: nextTournament.slug, year: nextTournament.year, venue: nextTournament.venue, orphans: [], ...liveRoundFormatArchive(snapshot, nextTournament.slug, nextTournament.year, setups, timezone) });
  }
```

- [ ] **Step 3: Manual check**

Run: `npm run dev`, confirm the Career Stats page's "Round Format Archive" section still loads without error for the active season (only reachable once `isPastLeaderboardSwitchover()` is true — if it isn't yet for the current test data, confirm at minimum that `npx tsc --noEmit` and a page load of the rest of Career Stats succeed).

- [ ] **Step 4: Commit**

```bash
git add lib/data/liveRoundFormatArchive.ts app/portal/admin/career-stats/page.tsx
git commit -m "Career Stats archive shows tee times in the tournament's configured venue timezone"
```

---

### Task 9: `CoursesFormatPanel.tsx` caption

**Files:**
- Modify: `components/portal/tiger/CoursesFormatPanel.tsx`, `app/portal/admin/master-settings/[year]/courses-format/page.tsx`

**Interfaces:**
- Consumes: `TIMEZONES` (Task 2, to look up the configured zone's human label), `TournamentSettings.timezone` (Task 4).

This task does **not** change how tee times are entered or derived here — the `<input type="time">` fields already just hold/echo the raw "HH:MM" string, which has no ambiguity to fix. It only fixes the caption, which currently hardcodes "Tee times are Pacific Time." regardless of what's actually configured. `CoursesFormatPanel` already receives the whole `TournamentSettings` object as its existing `initialSettings` prop (confirmed: `components/portal/tiger/CoursesFormatPanel.tsx`'s signature already has `initialSettings: TournamentSettings` — no new prop needed, just read `initialSettings.timezone`).

- [ ] **Step 1: `app/portal/admin/master-settings/[year]/courses-format/page.tsx`**

This page has its own separate `live_tournament_settings` query (a different file from the Master Settings page Task 5 already updated — this one currently reads `"round_count, completed_at, venue_name, venue_locked, begin_date, end_date, dates_locked"`, missing `timezone`). Add `timezone` to both the `.select()` string and the mapped `settings` object, the same way Task 5 Step 1 did for the Master Settings page:

```typescript
    service
      .from("live_tournament_settings")
      .select("round_count, completed_at, venue_name, venue_locked, timezone, begin_date, end_date, dates_locked")
      .eq("season_year", year)
      .maybeSingle(),
```

```typescript
  const settings: TournamentSettings = {
    sessionCount: settingsRow?.round_count ?? null,
    completedAt: settingsRow?.completed_at ?? null,
    venueName: settingsRow?.venue_name ?? null,
    venueLocked: settingsRow?.venue_locked ?? false,
    timezone: settingsRow?.timezone ?? "America/Los_Angeles",
    beginDate: settingsRow?.begin_date ?? null,
    endDate: settingsRow?.end_date ?? null,
    datesLocked: settingsRow?.dates_locked ?? false,
  };
```

No JSX change needed — `<CoursesFormatPanel year={year} initialSettings={settings} initialSessions={sessions} initialCourses={courses} />` already passes the whole (now timezone-bearing) `settings` object.

- [ ] **Step 2: `components/portal/tiger/CoursesFormatPanel.tsx`**

No props change. Add the import and change the caption to look up the configured zone's label from `initialSettings.timezone`:

```typescript
import { TIMEZONES } from "@/lib/data/timezones";
```

```typescript
              <p className="mt-2 font-sans text-xs text-ink-500">Tee times are {TIMEZONES.find((zone) => zone.id === initialSettings.timezone)?.label ?? initialSettings.timezone} (set in Master Settings).</p>
```

- [ ] **Step 3: Manual check**

Run: `npm run dev`, confirm the Courses & Format page's caption now reads "Tee times are Pacific Time (set in Master Settings)." for the default season, and updates correctly if Master Settings' zone is changed.

- [ ] **Step 4: Commit**

```bash
git add components/portal/tiger/CoursesFormatPanel.tsx "app/portal/admin/master-settings/[year]/courses-format/page.tsx"
git commit -m "Courses & Format caption names the tournament's actual configured timezone"
```

---

### Task 10: `lib/live/viewerLocalTime.ts` (TDD)

**Files:**
- Create: `lib/live/viewerLocalTime.ts`, `lib/live/viewerLocalTime.test.ts`

**Interfaces:**
- Produces: `formatViewerLocalTeeTime(date: Date): string`. Consumed by Tasks 11–13.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/live/viewerLocalTime.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { formatViewerLocalTeeTime } from "./viewerLocalTime.ts";

test("formatViewerLocalTeeTime formats using the runtime's own local timezone, with a short zone label", () => {
  const date = new Date("2027-07-15T14:30:00.000Z");
  const expected = `${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ${date.toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop()}`;
  assert.equal(formatViewerLocalTeeTime(date), expected);
});
```

(This test deliberately re-derives its expectation from the same no-explicit-zone JS APIs the implementation uses, rather than hardcoding a specific zone's answer — the whole point of this function is that its output depends on whatever machine runs it, which in CI/test is the runner's own system zone, not a fixed one this repo controls.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test lib/live/viewerLocalTime.test.ts`
Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/live/viewerLocalTime.ts

/**
 * Formats an absolute instant in whoever is running this code's own local
 * timezone — deliberately passes NO explicit `timeZone` option, which is
 * what makes `toLocaleTimeString` default to the runtime's local zone. Only
 * ever call this from a "use client" component after the component has
 * mounted in a real browser; calling it during server-side rendering
 * formats in the SERVER's zone, not the visitor's, which defeats the point.
 */
export function formatViewerLocalTeeTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test lib/live/viewerLocalTime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/live/viewerLocalTime.ts lib/live/viewerLocalTime.test.ts
git commit -m "Add the viewer-local tee-time formatter"
```

---

### Task 11: Viewer-local — already-client sites

**Files:**
- Modify: `lib/live/matchProfile.ts`, `components/leaderboard/LiveLeaderboardContent.tsx`

**Interfaces:**
- Consumes: `formatViewerLocalTeeTime` (Task 10).

Both call sites already execute in the browser (`profileMatch()` is called from `components/match/LiveMatchProfile.tsx`, a `"use client"` component that fetches raw match data via `GET /api/live/matches/[id]?profile=1` and formats it client-side; `LiveLeaderboardContent.tsx` is itself `"use client"` and formats inline) — this is a parameter swap, not a restructure.

- [ ] **Step 1: `lib/live/matchProfile.ts`**

```typescript
    teeTimeCst: match.tee_time && Number.isFinite(Date.parse(match.tee_time)) ? formatViewerLocalTeeTime(new Date(match.tee_time)) : undefined,
```

Add the import: `import { formatViewerLocalTeeTime } from "./viewerLocalTime";`. The field name `teeTimeCst` stays exactly as-is (shared with hand-typed historical per-year data files this plan never touches — same carve-out the prior plan already established for this exact field).

- [ ] **Step 2: `components/leaderboard/LiveLeaderboardContent.tsx`**

```typescript
    teeTimeCst: formatViewerLocalTeeTime(new Date(match.tee_time)),
```

Add the import: `import { formatViewerLocalTeeTime } from "@/lib/live/viewerLocalTime";`.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, open a public match profile page and the live leaderboard, confirm a tee time still renders (no crash, no "Invalid Date"). If you can change your OS/browser timezone (or use DevTools' sensor override for timezone), confirm the displayed time changes accordingly — this is the actual feature working, not just "didn't break."

- [ ] **Step 4: Commit**

```bash
git add lib/live/matchProfile.ts components/leaderboard/LiveLeaderboardContent.tsx
git commit -m "Match profile and live leaderboard tee times render in the viewer's own local time"
```

---

### Task 12: Viewer-local — Scoring tab (new client boundary)

**Files:**
- Modify: `components/portal/ScoringStatusScreen.tsx`

**Interfaces:**
- Consumes: `formatViewerLocalTeeTime` (Task 10).

This file currently has no `"use client"` directive and is rendered by a server component page (`app/portal/scoring/page.tsx`) that already fetches and passes it the full `CurrentSessionResult` (including the raw `matchBox.teeTime: Date`) as a prop — no prop-shape change is needed, only marking this component client and swapping its formatter.

- [ ] **Step 1: Add `"use client"` and swap the formatter**

```typescript
"use client";

import Link from "next/link";
import { LoadingScreen } from "@/components/LoadingScreen";
import { matchupLabel, type CurrentSessionResult } from "@/lib/live/currentRoundForPlayer";
import { scoringSides } from "@/lib/live/holeSubmission";
import type { ScoringStage } from "@/lib/live/scoringStage";
import { stageButtonLabel, stageNote } from "@/lib/live/scoringStageCopy";
import { getPlayerDisplayName } from "@/lib/data/players";
import { nextTournament } from "@/lib/data";
import { formatViewerLocalTeeTime } from "@/lib/live/viewerLocalTime";
```

Delete the local `formatTeeTime` function entirely, and change its one call site:

```typescript
      <p className="font-sans text-lg text-cream-50/90">{formatViewerLocalTeeTime(matchBox.teeTime)}</p>
```

Nothing else in this file changes — the rest of the component (the "Waiting For Matchup" branch, `matchupLabel`, `scoringSides`, stage copy, the Begin/Continue/View button) is untouched.

- [ ] **Step 2: Confirm this doesn't break the file's parent chain**

Run `npx tsc --noEmit` and confirm no new errors originate from `app/portal/scoring/page.tsx` (a server component passing props into a component that's now `"use client"` is exactly the supported Next.js pattern — a Server Component can render a Client Component and pass it serializable props, including a `Date`, with no special handling needed — but confirm the type-checker agrees).

- [ ] **Step 3: Manual check**

Run: `npm run dev`, open the Scoring tab as a logged-in player with an upcoming match, confirm the tee time still renders correctly (no crash, no hydration-mismatch console warning — there shouldn't be one, since the parent's data fetch already gates what reaches this component, so there's no server-rendered placeholder using a different value than the client's first paint).

- [ ] **Step 4: Commit**

```bash
git add components/portal/ScoringStatusScreen.tsx
git commit -m "Scoring tab tee time renders in the viewer's own local time"
```

---

### Task 13: Viewer-local — portal "My Matches" cards (restructure)

**Files:**
- Modify: `lib/portal/matchCards.ts`, `lib/portal/liveMatchCards.ts`, `components/portal/PortalMatches.tsx`

**Interfaces:**
- Consumes: `formatViewerLocalTeeTime` (Task 10).
- Produces: `PortalMatchCard` gains `progressTeeTime: string | null` (an ISO instant, only non-null for an `"Upcoming"` card).

This is the one site where the tee time is currently formatted **server-side** (in `liveMatchCard()`, called from `app/portal/page.tsx`, a server component) and handed down as an already-formatted string — there's no browser involved yet at the point it's built. The fix: stop pre-formatting it server-side; carry the raw instant instead, and format it in `PortalMatches.tsx`, which is already `"use client"`.

- [ ] **Step 1: `lib/portal/matchCards.ts`**

Add the new field to the interface, set it to `null` in `archivedMatchCard` (archived matches are always `"Past"`, never `"Upcoming"` — there's no tee time to show), and change `liveMatchCard`'s `"Upcoming"` branch to stop formatting and instead populate the new field:

```typescript
export interface PortalMatchCard {
  id: string;
  status: "Live" | "Upcoming" | "Past";
  /** Course name for the top of the box; null when a live round's course hasn't been set yet, or an archived round has no scorecard on file. */
  course: string | null;
  /** e.g. "Round 2 · Fourball" (live/upcoming) or "Round 4 · Afternoon · Singles" (archived). */
  roundFormatLabel: string;
  maroonPlayers: string[];
  whitePlayers: string[];
  maroonOdds: number | null;
  whiteOdds: number | null;
  /** Bigger center line — match-play score, e.g. "2 Up", "AS", "3&2", or "VS" before tee-off. */
  statusLabel: string;
  /** Smaller center line underneath — "Thru 8" while live, "Final" once decided. Empty ("") when status is "Upcoming"; render progressTeeTime instead in that case (see PortalMatches.tsx). */
  progressLabel: string;
  /** The raw tee-time instant, only set when status is "Upcoming" — null otherwise. Formatted client-side, in the viewer's own local time, by whatever renders this card; never pre-formatted here because this card can be built server-side, where the viewer's timezone isn't known. */
  progressTeeTime: string | null;
  /** Winning side once decided, for the center box's win fill (see CompactMatchRow's finalLabelColor); null while undecided. */
  leader: Team | "tie" | null;
}
```

```typescript
export function archivedMatchCard(tournament: Tournament, match: RealMatch, scorecards: PlayerScorecard[]): PortalMatchCard {
  const { round, course } = archivedRoundAndCourse(tournament, match, scorecards);
  return {
    id: match.id,
    status: "Past",
    course,
    roundFormatLabel: `Round ${round} · ${match.session} · ${match.format}`,
    maroonPlayers: match.maroonPlayers,
    whitePlayers: match.whitePlayers,
    maroonOdds: match.maroonWinProbability ?? null,
    whiteOdds: match.whiteWinProbability ?? null,
    statusLabel: liveLabel(match),
    progressLabel: "Final",
    progressTeeTime: null,
    leader: matchLeader(match),
  };
}
```

```typescript
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
    return { ...base, statusLabel: "VS", progressLabel: "", progressTeeTime: input.teeTime.toISOString(), leader: null };
  }

  const official = input.official;
  const holesRemaining = official ? Math.max(0, 18 - official.thru) : 18;
  const final = input.status === "Past" || Boolean(official?.mathematicallyComplete);
  return {
    ...base,
    statusLabel: official ? liveStatusLabel(official.leader, official.margin, holesRemaining, final) : "AS",
    progressLabel: final ? "Final" : official && official.thru > 0 ? `Thru ${official.thru}` : "—",
    progressTeeTime: null,
    leader: final ? (official?.leader ?? null) : null,
  };
}
```

`LiveMatchCardInput` itself is unchanged — `input.teeTime: Date` was already there.

- [ ] **Step 2: `lib/portal/liveMatchCards.ts`**

No changes needed — it already passes `teeTime: matchBox.teeTime` (a raw `Date`) into `liveMatchCard(...)`; Step 1's change to `liveMatchCard` is what makes that raw value flow through to `progressTeeTime` instead of being formatted away. Confirm this by reading the file; do not add anything.

- [ ] **Step 3: `components/portal/PortalMatches.tsx`**

`CenterBox` renders `card.progressLabel` for the smaller line — change it to prefer `progressTeeTime` when present:

```typescript
import { formatViewerLocalTeeTime } from "@/lib/live/viewerLocalTime";
```

```typescript
function CenterBox({ card }: { card: PortalMatchCard }) {
  const fillClass =
    card.leader === "maroon" ? "bg-maroon-700 text-white" : card.leader === "white" ? "bg-white text-maroon-700" : "bg-cream-100 text-maroon-700";
  const progressClass = card.leader === "maroon" ? "text-white/80" : card.leader === "white" ? "text-maroon-700/70" : "text-ink-500";
  const progress = card.progressTeeTime ? formatViewerLocalTeeTime(new Date(card.progressTeeTime)) : card.progressLabel;
  return (
    <div className={["flex flex-col items-center justify-center gap-0.5 border-x border-gold-300 px-1 py-2 text-center", fillClass].join(" ")}>
      <span className="font-sans text-base font-black leading-tight">{card.statusLabel}</span>
      <span className={["font-sans text-2xs font-bold leading-tight", progressClass].join(" ")}>{progress}</span>
    </div>
  );
}
```

Nothing else in this file changes.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, confirm the portal home's "My Matches" section still shows Live/Upcoming/Past cards correctly, with the Upcoming tab's cards showing a tee time (not blank, not "undefined").

- [ ] **Step 5: Commit**

```bash
git add lib/portal/matchCards.ts components/portal/PortalMatches.tsx
git commit -m "Portal 'My Matches' upcoming tee time renders in the viewer's own local time"
```

---

### Task 14: Full verification and project_specs.md

**Files:**
- Modify: `project_specs.md`

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass, at least 2 more than before this plan (Task 3's new zone test + Task 10's new file).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean on every file this plan touched.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 5: Manual walkthrough**

Log in as host (if credentials/live Supabase are available in this environment — otherwise do what earlier tasks' manual checks already established: dev-server smoke tests confirming no 500s): set a tournament year's timezone to something other than Pacific in Master Settings, confirm Courses & Format's caption and Matchups' tee-time labels reflect it, confirm a public match profile page and the live leaderboard still render a tee time without error. If you can override your own browser/OS timezone, confirm those last two actually change to match it (the real point of this whole plan) rather than just "didn't crash."

- [ ] **Step 6: Update `project_specs.md`**

Add one new entry under "Previously shipped rounds," matching the file's existing style (see the entry directly above this plan's own prior "Session rename" entry for tone/length/what-to-flag-as-unverified). Cover: the new `timezone` setting and its default, that `supabase/tournament_timezone.sql` has not yet been run in production (flag exactly like the other pending migration in this file), which screens show venue-local vs. viewer-local and why, and that the 2027 season's existing Pacific-based setup needed zero manual changes because of the column's default.

- [ ] **Step 7: Commit**

```bash
git add project_specs.md
git commit -m "Document configurable venue timezone and viewer-local tee time display"
```
