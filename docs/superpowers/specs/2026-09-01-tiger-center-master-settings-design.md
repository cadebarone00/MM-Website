# Tiger Center: Master Settings (multi-year) — Design Spec

## Goal

Turn the Tiger Center from a single, implicit "current tournament" into an
explicit, per-year operator screen covering 2027 through 2034. Each year
gets its own **Master Settings** page: a Course Upload section, a
Tournament Dates field and a Venue Name field (each independently
lockable), a universal Save, and the four existing setup boxes (Players &
Teams, Courses & Format, Matchups, Scorecards & Video) relocated inside
it. The Tiger Center home screen collapses to a year picker plus one
"`{year}` Master Settings" box. Edit Scores (never built) is deleted, not
just hidden.

This is scoped to the *setup* side only. The automatic-triggers idea
("dates arming things to start automatically") is explicitly **out of
scope** — it gets its own spec once this exists to trigger off of.

## Background

Today, "the live tournament" is two disconnected systems:

1. **Static files** (`lib/data/2027-upcoming.ts`, `lib/data/2027-venue.ts`)
   — hand-written, imported directly as `nextTournament`/`nextVenue` in
   `lib/data/index.ts`. These feed the public homepage, leaderboard, and
   schedule pages. There is no year dimension here beyond "whichever file
   is imported" — moving to 2028 today would mean hand-editing the import.
2. **Supabase `live_*` tables** (`live_courses`, `live_round_state`,
   `live_roster`, `live_tournament_settings`, `live_match_boxes`,
   `live_hole_scores`, `live_match_box_submissions`) — read/written by
   Tiger Center and the player scoring portal. Built as a **singleton**:
   there is no year column at all (one was added for `live_match_boxes`
   during the original port, then deliberately dropped when Matchups
   shipped, since only one tournament existed).

Real 2027 data already lives in both places today (the static files, and
real rows in `live_round_state`/`live_roster`/`live_match_boxes` from
Tiger actually setting up the 2027 trip). Neither can be discarded.

## Data model

### New/changed tables

Every table below gains a `season_year integer` column, `check
(season_year between 2027 and 2034)`, folded into that table's primary or
unique key. `live_courses` is **not** touched — courses are a shared pool
across years, matching how they have no year concept today.

```sql
-- live_tournament_settings: singleton -> one row per year
alter table live_tournament_settings drop constraint live_tournament_settings_singleton;
alter table live_tournament_settings drop column id;
alter table live_tournament_settings add column season_year integer;
-- backfill existing singleton row to 2027, then:
alter table live_tournament_settings alter column season_year set not null;
alter table live_tournament_settings add constraint live_tournament_settings_season_year_check check (season_year between 2027 and 2034);
alter table live_tournament_settings add primary key (season_year);

alter table live_tournament_settings add column venue_name text;
alter table live_tournament_settings add column venue_locked boolean not null default false;
alter table live_tournament_settings add column begin_date date;
alter table live_tournament_settings add column end_date date;
alter table live_tournament_settings add column dates_locked boolean not null default false;

-- live_round_state: round -> (season_year, round)
alter table live_round_state add column season_year integer;
-- backfill existing rows to 2027, then:
alter table live_round_state alter column season_year set not null;
alter table live_round_state drop constraint live_round_state_pkey;
alter table live_round_state add primary key (season_year, round);

-- live_roster: player_slug -> (season_year, player_slug)
alter table live_roster add column season_year integer;
-- backfill existing rows to 2027, then:
alter table live_roster alter column season_year set not null;
alter table live_roster drop constraint live_roster_pkey;
alter table live_roster add primary key (season_year, player_slug);

-- live_match_boxes: add season_year, repoint the round FK and unique key
alter table live_match_boxes add column season_year integer;
-- backfill existing rows to 2027, then:
alter table live_match_boxes alter column season_year set not null;
alter table live_match_boxes drop constraint live_match_boxes_round_fkey; -- exact name may differ, check pg_constraint
alter table live_match_boxes add constraint live_match_boxes_round_fkey
  foreign key (season_year, round) references live_round_state (season_year, round);
alter table live_match_boxes drop constraint live_match_boxes_round_box_number_key;
alter table live_match_boxes add constraint live_match_boxes_season_round_box_number_key
  unique (season_year, round, box_number);

-- live_hole_scores: add season_year, widen the unique key
alter table live_hole_scores add column season_year integer;
-- backfill existing rows to 2027, then:
alter table live_hole_scores alter column season_year set not null;
alter table live_hole_scores drop constraint live_hole_scores_player_slug_round_hole_key;
alter table live_hole_scores add constraint live_hole_scores_season_year_player_slug_round_hole_key
  unique (season_year, player_slug, round, hole);
drop index live_hole_scores_round_idx;
create index live_hole_scores_season_round_idx on live_hole_scores (season_year, round);

-- New: which year is actually live for the public site / player scoring
create table live_active_season (
  id boolean primary key default true,
  season_year integer not null check (season_year between 2027 and 2034),
  constraint live_active_season_singleton check (id)
);
insert into live_active_season (season_year) values (2027);
```

All backfills set `season_year = 2027` for every existing row — that's
the one real tournament that exists today. `live_tournament_settings`'s
2027 row also gets seeded with `venue_name = 'Mission Hills CC'`,
`begin_date = '2027-01-06'`, `end_date = '2027-01-09'` (copied from the
static files) so nothing on the public site goes blank the moment this
ships.

RLS: same "public read, service-role writes" pattern every `live_*` table
already uses — `select using (true)` on all of the above, no
insert/update policy (writes go through host-only Route Handlers with the
service-role key, as today).

### `lib/live/types.ts` changes

`TournamentSettings` gains `venueName: string | null`, `venueLocked:
boolean`, `beginDate: string | null`, `endDate: string | null`,
`datesLocked: boolean`. `LiveRoundState` and `RosterEntry` gain
`seasonYear: number`. `LiveMatchBox` and `LiveHoleScore` gain `seasonYear:
number`.

## Routes and API

### Tiger Center home — `/portal/admin`

Unchanged shell (auth/host check, `StartRoundBanner`, MM Coins Settlement
link — both stay scoped to the **active** year, not whatever the dropdown
shows). `<TigerCenterNav />` is replaced by a new client component:

- A `<select>` of years 2027–2034, defaulting to `live_active_season.season_year`.
- One box, `Link`-styled like today's enabled boxes, labeled
  `"{selected year} Master Settings"`, linking to
  `/portal/admin/master-settings/{selected year}`.

Changing the dropdown only relabels/re-points the box — nothing is
fetched or saved until the box is clicked.

### Master Settings — `/portal/admin/master-settings/[year]`

Server component: auth/host check (same as every other Tiger Center
page), validates `year` parses to an integer in 2027–2034 (else
`notFound()`), fetches that year's `live_tournament_settings` row (or
treats a missing row as "everything blank/unlocked" — rows are created
lazily on first Save, not pre-seeded for unconfigured years) and the
shared `live_courses` list and current `live_active_season.season_year`.
Renders a new client component, `MasterSettingsPanel`:

- **Course Upload** — reuses the existing `AddCourseForm` plus a list of
  `live_courses` (name, holes, rating, slope). This becomes the one
  canonical place to manage the shared pool; `CoursesFormatPanel` keeps
  its own inline "Add Course" shortcut for convenience when assigning a
  course to a round — same form, same underlying `live_courses` table, no
  behavior change there.
- **Tournament Dates** row — begin/end date inputs (same visual pattern
  `CoursesFormatPanel` already uses for a round's date input: plain
  inputs, `disabled` while locked) + one Lock/Unlock button for the pair.
  Lock is disabled unless both dates are filled in.
- **Venue Name** row — text input + its own Lock/Unlock button. Lock
  disabled unless non-empty.
- Locking is **local-only** until Save: toggling Lock just flips client
  state (and disables the inputs), nothing is written yet. This lets
  Tiger fill in dates, lock them, fill in venue, lock that, then Save
  once — matching "a universal save button for all the changes made."
- **Save** button: one `POST /api/portal/tiger/master-settings` call with
  `{ year, beginDate, endDate, datesLocked, venueName, venueLocked }`
  (server re-validates: a field can't be saved locked without a value;
  upserts the year's row). Page reloads on success (same pattern
  `CoursesFormatPanel.saveRoundCount` uses).
- **Active year indicator**: if `year` matches `live_active_season`, a
  small "Active Year" badge. If not, a "Set as Active Year" button that
  asks for confirmation (this is what flips the public site and player
  scoring over) before `POST /api/portal/tiger/active-season { year }`.
- Below all of that: the same 4-box grid `TigerCenterNav` renders today
  (`Players & Teams`, `Courses & Format`, `Matchups`, `Scorecards &
  Video`), links updated to
  `/portal/admin/master-settings/{year}/players-teams` etc. **No Edit
  Scores box** — deleted, not disabled.

### Moved pages

`app/portal/admin/{players-teams,courses-format,matchups,scorecards}`
move under `app/portal/admin/master-settings/[year]/...`. Their data
fetching gains a `season_year` filter on every `live_*` query (`.eq
("season_year", year)`); their Route Handlers
(`/api/portal/tiger/{roster,rounds,rounds/lock,rounds/remove,rounds/start,
matchboxes,matchboxes/remove}`) gain a required `year` field in every
request body, used in the corresponding `.eq("season_year", ...)`
filter/insert. `Scorecards & Video` (`archived_scorecard_*` tables) is
keyed by `tournament_slug`, not `season_year` — its route moves for
consistency but its query logic is unaffected.

### New route: `/api/portal/tiger/active-season`

`POST { year }` — host-only, upserts `live_active_season`. This is the
only write path that changes what the public site and player portal
treat as live.

## Public site wiring

`lib/data/index.ts`'s `nextTournament`/`nextVenue` stop being the raw
static import. Instead:

```ts
export async function getNextTournament(): Promise<UpcomingTournament> {
  const base = upcoming2027; // static per-year file, unchanged content otherwise
  const overrides = await fetchActiveSeasonSettings(); // venue_name, begin_date, end_date from Supabase
  if (!overrides) return base;
  return {
    ...base,
    venue: overrides.venueName ?? base.venue,
    startDate: overrides.beginDate ?? base.startDate,
    endDate: overrides.endDate ?? base.endDate,
    dateLabel: overrides.beginDate && overrides.endDate ? formatDateLabel(overrides.beginDate, overrides.endDate) : base.dateLabel,
  };
}
```

Same overlay pattern the Player Bio Portal already established
(`player_profile_overrides` layered on the static `PlayerProfile`) —
location, roster, `notes`, `liveAt` stay hand-edited in the static file;
only venue name and dates become live. `getVenueBySlug`'s handling of
`nextVenue` gets the same treatment for `venueName`. Callers of the
now-`Promise`-returning functions (home page, leaderboard, schedule —
all already Server Components) add `await`; no client-side callers exist
today.

Only `2027-upcoming.ts`/`2027-venue.ts` exist right now — years without a
static file simply have no public-site presence yet (matches today's
reality: nobody's building the public 2028 page before 2028's trip is
being planned). Master Settings for those years still works for
Tiger's own setup purposes even with no static file to overlay onto.

## Error handling

- Selecting an unconfigured year (2028–2034 today) in Master Settings
  shows every field blank and unlocked — no error, no auto-created row.
- Saving with a lock requested on an empty field is rejected server-side
  with a message, mirroring `CoursesFormatPanel`'s existing error banner
  pattern.
- "Set as Active Year" requires confirmation client-side (destructive,
  outward-facing) before the request fires.
- A `year` outside 2027–2034 in the URL 404s.

## Testing

`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Manual walkthrough: Tiger Center home shows the year dropdown defaulting
to 2027 and one box; switching the dropdown relabels it without
navigating. Opening 2027 Master Settings shows the real, backfilled
venue/dates as locked-or-not matches production state; opening 2030 shows
everything blank/unlocked. Lock both dates, lock venue, Save, reload —
both read-only and persisted. Unlock venue, change it, Save — only venue
changed. "Set as Active Year" on 2028 (after confirming) flips
`live_active_season`; the public homepage/leaderboard then reflect 2028's
(blank, since no static file) state — flag this as an expected rough edge
in the walkthrough, not a bug, since no year past 2027 has a static file
yet. Flip back to 2027 to leave production in its real state. Confirm
Players & Teams / Courses & Format / Matchups still work end-to-end
against `/portal/admin/master-settings/2027/...` with real 2027 data
intact (nothing lost in the `season_year` backfill).

## Out of scope

- Automatic triggers off Tournament Dates ("arming things to start
  automatically") — separate future spec.
- Pre-creating static `lib/data/{year}-upcoming.ts`/`{year}-venue.ts`
  files for 2028–2034 — created by hand when each year's trip is actually
  being planned, same as every past year.
- Any change to `live_courses` (shared pool, unaffected).
- Locking/changing `round_count` or `completedAt` from Master Settings —
  those stay inside Courses & Format, untouched.
