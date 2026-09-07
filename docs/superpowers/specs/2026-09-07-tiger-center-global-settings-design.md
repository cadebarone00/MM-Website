# Tiger Center: Global Settings (Home / Leaderboard / Team / More) — Design Spec

## Goal

Add four new boxes to Tiger Center's existing "Global Tools" grid —
**Home Settings**, **Leaderboard Settings**, **Team Settings**, **More
Settings** — one backend settings screen per public-facing area of the
site. This is the first step toward a standardized app: instead of every
future tweak ("rotate these photos," "change when this switches over")
needing new code, a host makes the change in Tiger Center and the public
site picks it up.

This round ships:
1. **Scheduled season go-live** (Home Settings) — a host can schedule the
   public site to switch to a new season year at a future date/time,
   instead of only being able to flip it immediately.
2. **Home photo rotation** (Home Settings) — a host can upload photos that
   rotate on the public homepage.
3. **Leaderboard / Team / More Settings** ship as real, wired pages with
   no fields yet — the plumbing (table, route, page) exists so the first
   actual setting on any of them is a small, isolated change.

This is explicitly the follow-up the
[Master Settings spec](2026-09-01-tiger-center-master-settings-design.md)
deferred: "the automatic-triggers idea ('dates arming things to start
automatically') is explicitly out of scope — it gets its own spec once
this exists to trigger off of." Master Settings (per-year setup) now
exists; this spec is that trigger, scoped to the one trigger asked for
(season switchover) rather than a general trigger framework.

## Background

- Tiger Center's "Global Tools" section
  ([app/portal/admin/page.tsx](../../../app/portal/admin/page.tsx)) is a
  grid of boxes linking to standalone admin pages (Career Stats, Wager
  Types, Odds Model, Broadcast Controls, Course Library). This spec adds
  four more boxes to that same grid.
- Which season year the public site treats as active is one function,
  `getActiveSeasonYear()` (`lib/live/activeSeason.ts`), reading a
  singleton `live_active_season` row. Every public-facing read that
  depends on "which year" — `getNextTournament`, `getNextVenue`,
  `getUpcomingRoundSchedule` (all in `lib/data/activeSeasonOverlay.ts`),
  and the live-scoring routes — ultimately reads through this one place.
  A host currently changes it with an immediate "Set as Active Year"
  button in per-year Master Settings
  ([MasterSettingsPanel.tsx](../../../components/portal/tiger/MasterSettingsPanel.tsx)).
  That button is unchanged by this spec — this adds a second, independent
  way to schedule the same switch for later.
- There is no photo-rotation feature anywhere on the public site today —
  this is new, not a retrofit of an existing carousel.
- Naming convention for new tables: this codebase's native live-platform
  tables (season-scoped tournament state) use a `live_` prefix. The
  tables in this spec are site-wide admin config, not per-season
  tournament state, so they use a new `portal_` prefix instead — matching
  the `/portal/admin` URL namespace that owns them. `live_active_season`
  itself keeps its existing name; this spec only adds a schedule
  alongside it.

## Data model

New file `supabase/global_settings.sql`, applied the same way as the
project's other incremental migration files (e.g.
`supabase/course_library_tee_setups.sql`).

```sql
-- One row (id always true), same singleton pattern as live_active_season.
-- go_live_at null means "no schedule set" — the manual "Set as Active
-- Year" button is the only way to change the active year in that case.
create table if not exists live_active_season_schedule (
  id boolean primary key default true,
  constraint live_active_season_schedule_singleton check (id),
  season_year integer not null check (season_year between 2027 and 2034),
  go_live_at timestamptz not null
);
alter table live_active_season_schedule enable row level security;
create policy live_active_season_schedule_select_all on live_active_season_schedule for select using (true);

-- Home page rotating photos.
create table if not exists portal_home_photos (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  position integer not null,
  created_at timestamptz not null default now()
);
alter table portal_home_photos enable row level security;
create policy portal_home_photos_select_all on portal_home_photos for select using (true);

-- Generic catch-all for Leaderboard/Team/More (and any future Home
-- setting that doesn't need its own table). One row per page; `data` is
-- whatever shape that page's TS interface currently defines. Adding a
-- field later is a code change to that interface + this JSON, not a
-- migration.
create table if not exists portal_page_settings (
  page text primary key check (page in ('leaderboard', 'team', 'more')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table portal_page_settings enable row level security;
create policy portal_page_settings_select_all on portal_page_settings for select using (true);
```

Host-only writes to all three go through service-role API routes (below)
the same way every other Tiger Center write does — no separate write
policy needed since the client never writes directly.

## Season-timing engine change

`getActiveSeasonYear()` (`lib/live/activeSeason.ts`) becomes:

1. Read `live_active_season.season_year` (today's value) and
   `live_active_season_schedule` (may not exist).
2. If a schedule row exists, its `go_live_at` has passed
   (`now() >= go_live_at`), and its `season_year` differs from the stored
   active year — return the **scheduled** year instead.
3. Otherwise, return the stored active year (today's behavior, unchanged).

This is evaluated fresh on every read — no cron job, no write-on-read.
That keeps it consistent with how `isPastLeaderboardSwitchover()`
(`lib/data/index.ts`) already handles a calendar-based cutover, and avoids
needing any always-on server process. Every function listed in
Background that reads through `getActiveSeasonYear()` gets the scheduled
switch automatically — this is the one change that makes the whole site
"timed correctly" together, rather than four separate timers.

The stored `live_active_season` row itself is **not** rewritten when the
schedule fires — the schedule stays the one source of truth for "is there
a pending switch," so Home Settings can keep showing "switches to 2028 on
Jan 1" right up to (and just past) that moment without a second write
path fighting the read logic. If a host later clicks "Set as Active Year"
manually (e.g., to go live early), that write is unaffected: it updates
`live_active_season` directly, and step 2 above naturally stops firing
once the stored year already matches the schedule's year.

## Tiger Center admin UI

### Global Tools grid

`app/portal/admin/page.tsx` gains four more `Link` boxes, same styling as
the existing five, added as a second row: **Home Settings**,
**Leaderboard Settings**, **Team Settings**, **More Settings**, linking to
`/portal/admin/settings/home`, `/leaderboard`, `/team`, `/more`.

### `/portal/admin/settings/home`

New route (`app/portal/admin/settings/home/page.tsx`, host-gated the same
way every other `/portal/admin/*` page is), rendering a new
`HomeSettingsPanel` client component with two sections:

- **Scheduled Go-Live**: shows the current active year; a year `<select>`
  (2027–2034) plus a datetime picker to set `season_year`/`go_live_at`; a
  "Clear schedule" action when one is set. Saves via
  `POST /api/portal/tiger/settings/season-schedule`.
- **Rotating Photos**: a grid of current `portal_home_photos` (ordered by
  `position`) with up/down reorder and delete, plus an uploader. Reuses
  the existing signed-upload pattern already used for scorecard video and
  broadcast playlist uploads (`sign` → direct-to-storage `PUT` → `confirm`
  writes the row) rather than inventing a new upload flow. Saves via new
  `/api/portal/tiger/settings/home-photos/{sign,confirm,delete,reorder}`
  routes, mirroring the existing playlist routes' shapes.

### `/portal/admin/settings/{leaderboard,team,more}`

Each is a real route + page + a `PageSettingsPanel` component reading and
writing its `portal_page_settings` row through one shared route,
`GET/POST /api/portal/tiger/settings/page?page={leaderboard|team|more}`.
With no fields defined yet, the page shows "No settings configured yet
for this page." Adding the first real field later means: add it to that
page's TS settings interface, add one form input, no new route or table.

## Public-facing consumption

- **Timing**: no page-specific change needed anywhere on the public
  site — it all flows from the `getActiveSeasonYear()` change above.
- **Home photo rotation**: a new small client component
  (`components/home/HomePhotoRotation.tsx`) reads `portal_home_photos`
  (ordered) and cross-fades between them on an interval, placed in the
  existing homepage hero area. Zero photos configured → the homepage
  renders exactly as it does today (no empty carousel chrome).
- **Leaderboard/Team/More**: no public read side yet — added when a real
  setting exists to read.

## Testing

- `lib/live/activeSeason.test.ts`: the scheduled-switch logic in
  `getActiveSeasonYear()` is the one piece of new pure-ish decision logic
  here — extract the "does the schedule override the stored year"
  comparison into a small pure function (given stored year, schedule row,
  and `now()`) so it can be unit tested directly without Supabase, the
  same way `lib/data/liveCourseSchedule.ts`'s transform was tested in the
  schedule-tab fix. The Supabase-calling wrapper functions follow this
  codebase's existing convention for such code (see
  `lib/data/activeSeasonOverlay.test.ts`): a test documenting that they
  reject when Supabase isn't configured, real behavior verified by hand
  against a real Supabase project.
- New API routes get a `route.test.ts` following the existing pattern
  used by every other `/api/portal/tiger/*` route (e.g.
  `app/api/portal/tiger/master-settings/route.test.ts`) — auth rejection
  or a payload-validation case, whichever exists for that route.
- Manual verification against a real Supabase project (per
  `docs/supabase-setup.md`) for: scheduling a switch and confirming the
  public site flips at the right time; uploading/reordering/deleting home
  photos and confirming the homepage reflects it.

## Out of scope

- Any settings content for Leaderboard/Team/More beyond the empty,
  wired scaffold — none were requested this round.
- A general-purpose "trigger framework" (arbitrary automatic actions on a
  date) — this spec builds exactly one trigger (season switchover), not a
  generic scheduler.
- Retrofitting photo rotation onto any existing image spot (course
  photos, loading screens) — Home Settings' photo rotation is a new,
  separate feature.
- Migrating `live_active_season` itself to a new shape — it's read as-is;
  only a new schedule table sits alongside it.
