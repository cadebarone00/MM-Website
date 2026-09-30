# The Maroon — Master Product Spec

> Permanent source of truth for turning The Maroon from one friend group's
> tournament site into a multi-tenant golf tournament platform.
> `project_specs.md` stays the detailed log of shipped rounds for the
> existing tournament; this file owns the **platform** direction.
> Update this file whenever an architectural or product decision changes.

- **Created:** 2026-09-29
- **Status (2026-09-29):** Spec **approved by the owner**, with the
  decisions in §17. Phases A and B are done. C1 (platform tables) and C2
  (edition tag on live tables) are built and tested against the practice
  database. **Neither has been run in production yet**; follow
  `docs/production-migration-checklist.md`. C3 (code reads and writes
  through an edition scope, §6.5) is built and committed (`6042114`), and
  was verified to change no behavior. Next: the Tournament Creation Wizard
  (§5.1), then C4.
- **Reference implementation:** The Maroon Tournament is the production
  reference. Losing any of its existing functionality counts as a regression.
- **Naming:** per the 2026-09-29 rebrand, the brand is **The Maroon**, the
  founding event is **The Maroon Tournament** (formerly "The Maroon
  Masters"), and the host area is the **Admin Center** (formerly "Tiger
  Center"). The code rename (`tiger` → `admin`) was finished on
  2026-09-29.

---

## 1. Product

**Main Page entry (2026-09-30):** `/` uses a mobile-first platform home: centered wordmark with menu/account icons, Log In, Create Tournament, Join Tournament holding state, and Feed linking to existing editorial categories. `/the-maroon` retains the editorial landing and `/website` the founding tournament. Login and two-step Create Account share a centered cream panel. Email/username authentication and existing required signup fields remain; Mobile is disabled. Join does not grant membership; tournament activity is not implemented. No auth endpoint, schema or authorization changes; deployment not verified.

### Vision
**The Maroon is the digital home for competitive golf trips.** Long term that
covers tournaments, golfer profiles, course reviews/rankings, trip guides,
instruction, video, and sponsorship. The priority now is the tournament
platform.

### Commercial use case
A golf group that runs a recurring trip (Ryder Cup-style, buddies trip,
member-guest, stroke-play championship) signs up, creates its tournament
through a wizard, invites its golfers, and gets a branded tournament site
with live scoring, leaderboards, match play standings, scorecards, stats,
media, and permanent history, with no developer involved.

### Target customer
- **Primary:** the organizer of a recurring 8–24 player golf trip. Usually
  one person, not technical, and does the work for free.
- **Secondary:** players and their friends and family who follow along.
- **Later:** clubs and member events, charity outings, corporate outings.

### The one test that defines V1 success
> A completely unrelated golf group can create its own fully branded
> tournament through the UI without a developer changing any code.

---

## 2. Current system: audit (Phase A, 2026-09-29)

### 2.1 Architecture summary
| Layer | What exists |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript, Tailwind v4. (`CLAUDE.md`'s "Python" tech stack section is stale boilerplate.) |
| Database/auth | Supabase Postgres + Supabase Auth. Server routes use the **service-role key** and authorize in code. RLS is enabled everywhere, with public read-only policies on live tables and no write policies. |
| Migrations | Hand-run SQL files in `supabase/` pasted into the Supabase SQL editor. `schema.sql` plus about 30 one-off files. There is no migration runner or record of which files ran. |
| Historical data | 2024 Pinehurst, 2025 Danzante, 2026 Palm Springs live as **static TypeScript** (`lib/data/*.ts`, `scorecards-*.ts`, `stats/*`), plus DB archive tables (`archived_scorecard_*`, `career_*`). |
| Live engine | `live_*` tables keyed by `season_year` (+ `round`, `box_number`, `player_slug`). SQL functions handle atomic hole submission, publication, official match state, odds, and wager settlement (`live_match_publication.sql`, `scoring_reliability.sql`, `live_round_submission.sql`). |
| Scoring logic (TS) | `lib/live/scoring.ts` (player summaries), `lib/live/orchestration.ts` (match validation, scorer rules), `lib/live/matchProfile.ts`, `officialMatchState.ts`, `roundStatus.ts`. |
| Host tools | `/portal/admin/*` (Admin Center): master settings per year (Players & Teams, Courses & Format, Matchups/Sessions), course library, scorecards editor, broadcast controls, wagers, website settings, odds model. |
| Player tools | `/portal/*`: scoring (`/portal/scoring/play`), handicap tracker, profile/bio edits, career, round video. |
| Public site | `/`, `/leaderboard/[slug]`, `/teams/[slug]`, `/schedule/[slug]`, `/history`, `/players`, `/watch-live`, `/broadcast`, `/wagers`, `/fantasy`, and editorial `/the-maroon/*`. |
| Media | Cloudflare R2 (`lib/r2`) via presigned uploads: shot videos, broadcast playlist, round videos. |
| Legacy | Google Sheet + Apps Script (`appscript/`) live feed and backup. Being replaced by Supabase-primary live scoring. |
| Tests | `npm test`: 505 passing on 2026-09-29, including PGlite (in-memory Postgres) migration tests. |

### 2.2 Hard-coded tournament assumptions
| Assumption | Where | Severity |
|---|---|---|
| Two teams named Maroon and White | `Team = "maroon" \| "white"` in `lib/live/types.ts` and `lib/data/types.ts`; `live_roster.team check in ('maroon','white')`; `live_match_boxes.maroon_players/white_players` columns; about 75 source files | **Critical** |
| One tournament in the whole database | Every `live_*` table is keyed by `season_year` only; singleton tables `live_active_season`, `broadcast_display_year`; `website_section_settings` | **Critical** |
| Year ranges | `season_year between 2027 and 2034` checks in about 10 tables; `SEASON_YEARS`, `DISPLAY_YEARS`; 2034 hard-reserved as the test season | High |
| 12-player roster, 6 per team | `ROSTER_SIZE = 12`, `matchesPerSession` (Singles 6, others 3), `box_number between 1 and 6` | High |
| 3 tee-time slots per session | `live_round_state.match_tee_times default [null,null,null]`, `teeTimeSlotForMatch` | Medium |
| 6–10 sessions | `live_tournament_settings.round_count check (6..10)`, settings route | Medium |
| Three formats | `format check in ('Fourball','Foursome','Singles')` | Medium (fine for V1, needs a registry) |
| One global host | `profiles.is_host` boolean; `requireHost()` means host of everything | **Critical for multi-tenancy** |
| Global player identity via slugs | `player_slots.player_slug` primary key; `MM` + name usernames; 13 seeded players; hand-written `lib/data/players/*.ts` | High |
| Branding | `app/globals.css` maroon/cream/gold tokens; "The Maroon Masters" in about 60 files; logos in `public/` | Medium |
| Handoff timezone | `America/Chicago` inside `sync_season_calendar()` | Low |
| Past editions in code | `pastTournaments = [pinehurst2024, danzante2025, palmSprings2026]`, `nextTournament = upcoming2027` | High (historical, see migration) |
| Wagers ("MM Coins") | Market keys and odds tables are global and year-keyed | Medium; see §12 |

### 2.3 Reusable as-is
- **Scoring math:** hole results, match state (up/down, dormie, clinch
  "3&2"), player summaries, the handicap/WHS engine (`lib/handicap/*`), and
  course/tee modeling (`LiveCourse`, `LiveTeeSet`). These are
  tournament-agnostic apart from the team type.
- **Course library** (`live_courses` with tee sets, rating/slope,
  location). This is already global, which matches the goal of reusable
  courses.
- **Atomic, idempotent hole submission** and the audit log
  (`live_score_audit_events`). This is production-grade and needs only a
  tenant key.
- **Auth flows** (signup, login, invite via Supabase, reset).
- **Round lifecycle concepts:** Scheduled → Armed → Live → Final, session
  lock, Begin Round, Submit Round.
- **Media pipeline** (R2 presign → confirm).
- **UI components:** scorecard, leaderboard, and match cards. They need
  their team colors and names passed in instead of hard-coded.

### 2.4 Needs refactoring
1. Tenant key on every live table (`season_year` → `edition_id`).
2. Teams as data: `maroon`/`white` literals become team rows; match
   "sides" become `side A`/`side B` with a team reference.
3. Roles: global `is_host` becomes per-tournament membership roles plus a
   platform admin flag.
4. Player identity: tournament-scoped player records bridged to the
   existing `player_slug`.
5. Structure limits (12 players, 3 tee times, 6–10 sessions, box ≤ 6)
   become derived from configuration.
6. Branding: CSS tokens become per-tournament theme variables.
7. Routing: tournament-scoped URLs.

---

## 3. Domain model (target)

```
Organization (billing + ownership)          e.g. "The Maroon Golf Club", "Texas Cup Group"
 └─ Tournament (a recurring event/series)    e.g. "The Maroon Tournament", "Texas Cup"
     ├─ TournamentMember (user ↔ role)       owner / organizer / player / viewer
     ├─ TournamentPlayer (per-tournament golfer record, persists across years)
     │    └─ optional link → Profile (auth user) → future Golfer Profile
     └─ TournamentEdition (one playing of it) e.g. "2027 · Silver Springs"
          ├─ EditionTeam (name, colors, logo, captain; 0 teams = individual event)
          ├─ EditionRosterEntry (TournamentPlayer ↔ team, handicap for this edition)
          ├─ EditionSettings (scoring rules, visibility of site sections)
          ├─ Round/Session (day, date, course+tee, format, tee times)  = live_round_state
          │    └─ Match (side A team + players, side B team + players) = live_match_boxes
          │         └─ HoleScore / Submission / OfficialState / AuditEvent
          ├─ Media / Highlights
          └─ Results (final standings, champion; frozen at finalization)
Course (global library; optional owning organization) ← referenced by rounds
Plan / Entitlements ← Organization
```

**Why Tournament and Edition are separate:** recurring groups are the core
customer. The Maroon Tournament has 2024, 2025, 2026 and 2027 editions,
and the history page and all-time records are about the tournament. The
existing `season_year` is already an edition key in all but name, which
makes the migration mechanical rather than a redesign.

**Isolation unit:** live data is isolated per **edition**. Players,
branding defaults and history belong to the **tournament**. Billing belongs
to the **organization**. The database enforces this with composite foreign
keys (see §6), not just application code.

---

## 4. Roles & permissions

| Role | Scope | Can |
|---|---|---|
| **Platform admin** | Whole platform (`profiles.platform_role = 'admin'`) | Everything: all tournaments, users, troubleshooting, plans |
| **Owner** | One tournament | Everything an organizer can do, plus delete the tournament, transfer ownership, and manage billing |
| **Organizer** | One tournament | Configure, invite/manage players, teams, courses, schedule, pairings, tee times, start/finalize sessions, edit scores, override stats, media, branding, site visibility |
| **Player** | One tournament | See their matches, enter permitted scores (existing scorer-pairing rule), view everything public, upload permitted media, edit their own bio (with approval) |
| **Viewer / public** | One tournament | Whatever the organizer marks public |

**Enforcement:** every mutating route resolves `(tournament, edition)` from
the URL or body, then calls `requireTournamentRole(tournamentId, minRole)` on
the server. UI hiding is cosmetic only. The existing `requireHost()` becomes
`requireTournamentRole(maroonId, 'organizer')` during migration, so
behavior stays the same.

**Legacy mapping:** every `profiles.is_host = true` account becomes
**owner** of The Maroon Tournament. Cade additionally becomes platform
admin. That promotion is a manual step, never automatic in SQL.

---

## 5. Tournament configuration model

### 5.1 Creation principle: CREATE → EXIST → COMPLETE → PUBLISH → PLAY
Owner decision, 2026-09-29. **Creating a tournament must not be a long
mandatory questionnaire.**

| Stage | What happens | Required |
|---|---|---|
| **CREATE** | A short form makes the tournament shell | Only the minimum: tournament name, web address (slug; suggested from the name), year |
| **EXIST** | The tournament and its first edition exist right away, with its own Tournament Dashboard and a private site at `/t/[tournament]/[year]` | — |
| **COMPLETE** | From the dashboard, in any order and over any number of visits: branding, players, teams, courses, schedule/formats, scoring rules, dates, destination. A checklist shows what's still missing | Nothing up front |
| **PUBLISH** | The organizer makes the site public. Publishing is blocked until the essentials are complete (the "ready to publish" check) | Readiness check passes |
| **PLAY** | Sessions start, live scoring, leaderboards | Published or private-but-complete |

**Implementation status (2026-09-30):** CREATE, EXIST, COMPLETE and
PUBLISH are built and tested against the practice database. None of the
platform migrations has run in production (see
`docs/production-migration-checklist.md`).
- **CREATE → EXIST:** `/tournaments/new`. Basics asks for name, web
  address and year; dates are optional. **Create now, finish later** saves
  immediately via `create_tournament_shell` (organization, Tournament, first
  Edition, owner, teams, settings, planned rounds). Invite-only is enforced in
  the database. Signed out, not invited, or not switched on: the wizard keeps
  a local draft and says why.
- **COMPLETE:** `/tournaments/[tournament]/[year]` resolves the same
  Tournament + Edition the public site will use at `/t/[tournament]/[year]`.
  It's organizers-only; everyone else gets 404, by page and by API. Each of
  the 10 setup sections has its own editor and saves on its own:
  `PATCH /api/platform/tournaments/[t]/[y]/sections/[section]` →
  `lib/platform/sectionRules.ts` (server) → `save_tournament_section`,
  which re-checks the organizer and writes only platform tables.
- **PUBLISH:** its own action (`POST …/publish`). The server refuses unless
  the readiness engine says the setup is ready. Unpublishing is always
  allowed. The Maroon Tournament can't be edited or published here (it's run
  from the Admin Center), and its dashboard is read-only.
- **Still open:** the public site `/t/[tournament]/[year]`, pairings, a
  request-access flow, a neutral platform layout, and C4 (live scoring for
  commercial tournaments).

**Where each section is stored** (all platform tables; nothing in `live_*`):

| Section | Stored in |
|---|---|
| Basics | `tournaments` (name, short name, description, visibility) + `tournament_editions` (destination, dates, timezone). Address and year are fixed after creation. |
| Players | `tournament_players` (name, email) + `edition_roster` (team, handicap) + `edition_settings.plan.expectedPlayerCount` |
| Teams | `edition_teams` (name, color, captain) + `edition_settings.plan.competitionType` |
| Courses | `edition_courses` (planned; not the live course library) |
| Rounds | `edition_rounds` (number, day, label, format, course): planned only |
| Schedule | `edition_rounds` (play date, tee times or shotgun, start time) |
| Rules | `edition_settings.scoring` |
| Branding | `tournaments.branding` (colors; no logo uploads) |
| Website | `edition_settings.site` (which public sections show) |
| Media | `edition_settings.media` (`none` or `device_external` + links; `maroon_hosted` needs the `hosted_media` entitlement) |
| Publish | `tournament_editions.published_at` / `status` (+ `tournaments.status`) |

### 5.1a Readiness engine (`lib/platform/readiness.ts`)
One engine judges saved tournaments *and* local drafts. The dashboard only
renders its answer, and the publish route enforces it.

- **Publish requires:**
  - start and end dates
  - a two-team competition with exactly 2 teams
  - scoring rules chosen
  - at least one round, every round with a format
- **Play also requires:**
  - at least 2 players, every player on a team, and enough players per team
    for the formats
  - at least 1 course, every round with a course
  - every round with a date and a tee time or shotgun start
  - the tournament published
  - finally, the shared rulebook `validateTournamentConfig` passes
- **Never required:** Branding, Website, Media.
- **Percent** = met requirements ÷ all publish + play requirements.
- **Stages:**
  - *Created*: nothing beyond creation.
  - *Setup Incomplete*
  - *Ready to Publish*
  - *Published*: play requirements still missing.
  - *Ready to Play*
  - *Blocked*: setup is complete, but live scoring isn't available. That's
    every commercial tournament until C4, so commercial tournaments are
    never playable yet.

Route plan: create at
`/tournaments/new`; management (dashboard) per tournament under
`/tournaments/…`; the public site only at `/t/[tournament]/[year]`.

This means the full `validateTournamentConfig` rules (below) are the
**publish/play readiness check**, not a gate on creation. Each dashboard
section saves on its own with the same per-field rules. The creation form
validates only its few fields.

### 5.2 Configuration fields
What an organizer configures (validated by `lib/platform/tournamentConfig.ts`):

| Group | Fields |
|---|---|
| Basics | name, short name, slug, description, destination, start/end date, timezone, visibility (`public` / `unlisted` / `private`) |
| Branding | logo, primary/secondary/accent colors (hex), hero image; optional per-team colors/logos |
| Players | name, email (optional), handicap (optional), photo, team |
| Teams | mode `individual` or `teams` (2–8 teams); name, short name, color, logo, captain |
| Courses | pick from library or add: name, location, tee, par, yardage, rating, slope, holes |
| Structure | rounds: day, date, session label (e.g. Morning), course + tee, format, tee times / shotgun |
| Scoring | mode `match_play` or `stroke_play`; points for win/halve; handicap `gross` or `net` with allowance %; allow concessions; allow early finish (clinch); tie handling |

### Formats (code registry, not config)
Formats are business logic, so they live in code
(`lib/platform/formats.ts`). A tournament only chooses which formats it uses.

| Key | Label | Players per side | Individual stats? |
|---|---|---|---|
| `Singles` | Singles | 1 | yes |
| `Fourball` | Fourball (better ball) | 2 | yes |
| `Foursome` | Alternate Shot / Foursomes | 2 | no (team ball) |

Matches per round are **derived**:
`min(team roster sizes) ÷ players per side`. For The Maroon's 6-a-side
this gives Singles = 6 and Fourball/Foursome = 3, the same as today's
hard-coded constants. Adding a format later (Scramble, Shamble, Stableford)
means adding one registry entry and one scoring rule.

### Templates
A template is a pre-filled configuration: format mix, round count, scoring
rules. V1 ships **Ryder Cup Style** (The Maroon's shape) and **Custom**.
Presidents Cup, Buddies Trip, Stroke Play Championship and Fourball Event
are template entries added later without schema changes.

### Duplicate last tournament
Creates a new **edition** of the same tournament and copies teams, roster,
settings, branding and formats. Dates, destination, courses, tee times and
pairings start empty. Results never copy, because they are keyed by edition.

---

## 6. Database model

### 6.1 Built (Phase C step 1): `supabase/platform_foundation.sql`
Purely additive. It changes no existing table, and existing code never
reads these tables yet.

| Table | Purpose | Isolation guarantees |
|---|---|---|
| `platform_plans` | Plan catalog with an `entitlements` jsonb. **No prices** (pricing lives in the payment provider later). Seeds `founder` (The Maroon: everything on) and `beta` (everything needed to create/run/test a tournament; **no wagers, no fantasy, no broadcast, no custom domain**). | — |
| `platform_settings` | Single row. `tournament_creation` = `invite_only` (V1) or `self_serve` (later: one switch, no other change) | — |
| `tournament_creator_access` | Invite-only beta: who asked to create tournaments and whether a platform admin approved (`requested` / `approved` / `revoked`) | PK = profile |
| `organizations` | Owner/billing entity, `plan_key` → `platform_plans` | — |
| `tournaments` | Series: slug (globally unique), names, visibility, status, branding jsonb, legacy flag | FK → organization |
| `tournament_editions` | One playing: `season_year`, label, destination, dates, timezone, status, `is_test`, `legacy_slug` | FK → tournament; unique `(tournament_id, season_year)`; exposes `(id, tournament_id)` for composite FKs |
| `tournament_members` | profile ↔ tournament role | unique `(tournament_id, profile_id)` |
| `tournament_players` | Tournament-scoped golfer record; optional `profile_id`; `legacy_player_slug` bridges to `player_slots` | unique `(tournament_id, legacy_player_slug)`; exposes `(id, tournament_id)` |
| `edition_teams` | Team per edition: key, name, colors, logo, captain, order | unique `(edition_id, key)`; exposes `(id, edition_id)` |
| `edition_roster` | Player on an edition (and optionally a team) | **composite FKs**: the player must belong to the edition's tournament, and the team must belong to the same edition. A cross-tenant row is impossible at the DB level. |
| `edition_settings` | Validated scoring/structure/site-visibility jsonb per edition | PK = edition |
| `profiles.platform_role` | New nullable column (`'admin'`) | — |

The seed creates organization "The Maroon", tournament
`the-maroon-tournament` (legacy = true), and editions for every
`season_year` from 2024 to 2034 (2034 flagged `is_test`, matching today's
test-season convention). It also creates `maroon` / `white` teams on every
edition, a tournament player for every `player_slots` row, Maroon/White
rosters from `live_roster` for live years, and owner membership for every
`is_host` profile. It is idempotent and safe to re-run.

All tables have RLS enabled with **no policies**, so only the service role
can use them. This matches the existing pattern where server routes
authorize in code.

### 6.2 Built (Phase C step 2): `supabase/platform_editions.sql`
Undo: `supabase/platform_editions_rollback.sql`.

1. **All 30 tables keyed by `season_year`** (inventoried by loading the full
   migration chain into PGlite, not by grep) gain a nullable `edition_id`,
   an index, and a composite FK `(edition_id, season_year)` →
   `tournament_editions (id, season_year)`. **The edition and the year can
   never disagree.**
2. **Backfill** tags every existing row with The Maroon's edition for that
   year. The existing triggers on these tables (archive mirror,
   publication queue, locked-round archive, team-winner wager settlement,
   archive status guard) would otherwise treat the backfill as real edits.
   So only the triggers that are currently on are switched off for the
   backfill and back on afterwards, all in one transaction. A mutation test
   proves the backfill *does* change data without this.
3. **`set_edition_id` trigger** (before insert/update) on every one of
   those tables: a writer that only sets `season_year` (all current code)
   gets the legacy tournament's edition automatically. Changing the year
   moves the edition with it. A year with no edition yet gets an empty
   container edition, so the tag is never null.
4. `legacy_edition_id(year)` resolves the legacy tournament's edition.
   Only **one** tournament may be `is_legacy` (unique index).
5. **Not changed:** no existing function, key, check, or row value. The
   full 9-scenario scoring regression (`npm run test:db:platform`) passes on
   top of C2.

**Still to do (C4, high risk, off-season only):** once all code writes
`edition_id`, make it `not null`, move unique keys from `season_year` to
`edition_id`, and drop the `between 2027 and 2034` checks. SQL functions
(`submit_live_hole_reliable`, `start_live_round_atomic`, etc.) gain an
edition parameter, with wrappers keeping the `(season_year, …)` signature
for The Maroon until callers move over. **Until C4, only The Maroon can
use the live tables:** a second tournament's 2027 rounds would collide
with The Maroon's on the year-based keys.

### 6.3 Then (Phase C step 5): teams as data
- `live_roster.team`: drop the `('maroon','white')` check and validate
  against `edition_teams.key` (composite FK `(edition_id, team)`).
  Maroon's keys *are* `maroon`/`white`, so existing rows stay valid.
- `live_match_boxes`: add `side_a_team`, `side_b_team` (team keys). The
  existing `maroon_players` / `white_players` columns are reinterpreted
  as side A / side B player arrays. For Maroon, side A is always `maroon`.
  A later column rename is cosmetic.
- TypeScript `Team` becomes `string` (team key), with display data looked
  up from the edition's teams.

### 6.4 Principles
Stable UUIDs; slugs only for URLs and the legacy bridge; foreign keys and
checks for every relationship; `created_at`/`updated_at` everywhere;
append-only audit (already exists for scores); results frozen at
finalization; no deletion of historical rows without a documented reason.

### 6.5 Built (Phase C step 3): the edition scope in code
`lib/platform/editionScope.ts`. No database change, and it works the same
before or after C1/C2 are run.

- **`EditionScope` = `{ tournamentSlug, seasonYear }`**: which tournament,
  which year. The Maroon's is built in memory by `maroonEdition(year)` (no
  database read, no added latency). `getActiveEdition()` returns its live
  edition.
- **Every live-table query and write goes through one helper:**
  `.match(editionFilter(scope))`, `...editionColumns(scope)`,
  `editionRealtimeFilter(scope)` (browser live updates), and
  `editionYearParam(scope)` (`p_year` for existing SQL functions). Today
  they produce exactly the old `season_year` values; **C4 switches them to
  `edition_id` in this one file.**
- **Guard:** until C4, these helpers **refuse any tournament but The
  Maroon** (`EditionNotLiveError`), so a future tournament can never read or
  write The Maroon's year-keyed rows by accident.
- **Where the scope comes from (boundaries):** routes build it right after
  validating the requested year. Broadcast code builds it from the display
  year. Player and wager code uses `getActiveEdition()`. Library functions
  take `edition: EditionScope` instead of `seasonYear: number`, so the type
  checker proves every caller passes one.
- **Deliberately unchanged (C4 list):**
  - *Pointer tables* store a choice of year, not an edition's data:
    `live_active_season`, `broadcast_display_year`,
    `website_section_settings`, the test-season reset's switch back to the
    real season. These become per-tournament settings in C4.
  - *Multi-year readers* read all of The Maroon's years and need a
    tournament filter in C4: `seasonCalendarServer` (calendar list),
    `seasonOverviewServer` (overview years), `careerStatsDatabase`,
    `roundFormatSetups` (read-all), `app/api/home-team-rosters`.
  - `onConflict: "season_year,…"` strings follow the unique keys, which
    change in C4.
  - Wager market keys (`team-winner:2027`) stay year-based on purpose:
    wagers are Maroon-only (§17.4).
  - **Handicap/golfer history** (`lib/handicap/futureRounds.ts`) stays
    global on purpose: it is the golfer's own record across tournaments (§13).
- **Verified no behavior change:**
  - Real-client tests show the new helpers send byte-identical requests.
  - The pre-C3 (`83cbd2b`) and C3 (`6042114`) production builds, run side
    by side against the real database, returned identical responses on 13
    read-only endpoints and identical visible content on 10 public pages.
  - All scoring regressions pass.

---

## 7. Scoring architecture
- **Hole entry:** existing atomic, idempotent submission with the dual-entry
  agreement model (player and assigned opponent scorer). This stays.
- **Match engine:** a pure function from `(format, hole scores, handicap
  strokes)` to match state. Clinch/early finish follows the rule. Status is
  **Waiting on Pairings → Scheduled → Live → Final**. A completed match
  shows its result (e.g. "3&2", "1 UP", "Halved"), **never "Thru 18"**.
- **Points:** `pointsForWin` / `pointsForHalve` come from `edition_settings`
  (Maroon: 1 / ½). Team totals and "points to win"
  (`total available ÷ 2 + ½`) are derived.
- **Stroke play / individual leaderboard:** gross or net per settings;
  Foursome never counts toward individual stats (existing rule, now a
  registry property).
- **Handicaps:** the existing WHS engine. Net match play applies allowance %
  from settings.
- **Finalization:** organizer closes out a session, the result freezes,
  and wagers/fantasy settle (Maroon only). Later corrections recompute
  (existing lifecycle design).

## 8. Tournament lifecycle
`draft` (wizard in progress) → `scheduled` (published, before start) →
`live` (at least one session started) → `completed` (all sessions final) →
`archived` (read-only history). Sessions have their own state:
`setup → locked → live → final`. Today's `season_calendar` active/pass
dates become per-edition activation dates.

## 9. Website architecture
- **Platform home:** `/` (The Maroon brand: tournaments, editorial, sign-up).
- **Tournament sites:** `/t/[tournament]` shows the latest edition.
  `/t/[tournament]/[year]/{leaderboard,matches,schedule,players,teams,courses,stats,media,results}`
  and `/t/[tournament]/history`. *(Decided 2026-09-29.)*
- **Legacy URLs are kept forever:** `/leaderboard/[slug]`, `/teams/[slug]`,
  `/schedule/[slug]` keep serving The Maroon Tournament, and eventually
  resolve through the same tournament-scoped code.
- **Branding:** a tournament layout injects CSS variables
  (`--brand-primary`, …) from `tournaments.branding`, so components use
  variables instead of `maroon-700`.
- **Visibility:** per-section public/members-only flags in
  `edition_settings.site`.
- **Editorial** (`/the-maroon/*`) stays a separate route group and codebase
  area (`components/maroon`), untouched by tenant work.

### 9.1 Built: public tournament site (2026-09-30; not yet in production)
- **Routes:**
  - `/t/[tournament]/[year]` (Home)
  - `/t/[tournament]/[year]/{schedule,teams,players,courses,information,leaderboard,matches,results}`
  - `/t/[tournament]` redirects to the newest edition this visitor may see
- **UI:** the public UI kit `components/platform/tournament-site/`, reused
  with small additive extensions: partial nav links, optional team points
  and course par/yardage, a scoring-pending state, media links, and an
  Information page.
- **Shell:** customer sites get the kit's own header, nav and footer.
  `SiteChrome` renders no Maroon chrome under `/t`. The founding
  tournament keeps its own site and legacy URLs, unchanged (verified
  identical before and after).
- **One visitor-safe loader:** `get_public_tournament_site`
  (`supabase/platform_public_site.sql`) → `lib/platform/publicSiteServer.ts`
  → `lib/platform/publicSite.ts` (adapter to the kit).
  - **Edition must be published** and not the test season. The legacy
    tournament is never served.
  - **Public:** anyone.
  - **Unlisted:** anyone with the link; noindex; never listed.
  - **Private:** tournament members and platform admins only.
  - Everyone else gets a 404, identical to "no such tournament".
- **Public data only:**
  - names, description, branding colors (and https/root-relative logo or hero, if ever set)
  - dates, destination, timezone, status
  - teams: name and color
  - players: name, team and captain flag
  - courses: name, location, tees, par and yards
  - rounds: format, course, date and start
  - rules: mode, points, gross/net
  - Website toggles, and media links (device_external only)
  - **Never served:** emails, handicaps (no public-consent setting yet),
    organizer/plan/entitlement data, creator access, or database ids
    (public labels t1/p1/c1 are used instead).
- **Website settings:** a disabled section disappears from the nav, 404s
  by direct URL, and its data is left out of the page. Home and
  Information are always on.
- **Scoring pages (before C4):** Leaderboard, Matches, Results and Home's
  scoring panels show the kit's locked state: "Scores, matches and results
  will appear here once live scoring opens for this tournament." Nothing
  reads live-scoring tables, and there's no fallback to The Maroon.

### 9.2 Built: organizer preview (2026-09-30; not yet in production)
- **Flow:** Dashboard → "Preview Website" →
  `/tournaments/[tournament]/[year]/preview` (and `/preview/[section]`).
  A banner sits above the site: "Preview — this tournament is not public
  yet." (or "this is your published site"), the future `/t/...` address,
  and "Back to setup". Always noindex.
- **Who:** only people who can manage the edition (owner, organizers,
  platform admins), checked twice: `resolveManagedEdition` in the server
  loader, and `can_manage_edition` inside `get_tournament_site_preview`.
  Everyone else, including players and signed-out visitors, gets a 404.
  The Maroon is refused (it's managed in the Admin Center).
- **Same data, same screens:** the public reader and the preview share one
  projection, `tournament_site_projection` (service role only, no access
  checks of its own). The preview renders with the same
  `TournamentSiteView` component as `/t`; only the link base differs.
  Website toggles, branding and empty states behave identically.
- **Public reader unchanged:** `get_public_tournament_site`'s access
  checks are word-for-word the same, and its output is byte-identical.
  Unpublished editions still 404 at `/t/...`, even for their owner.

### 9.3 Built: neutral organizer studio (2026-09-30)
- **Where:** every `/tournaments/...` route (`/new`, `/<slug>/<year>`,
  `/<slug>/<year>/preview`) renders `components/platform/OrganizerStudioShell.tsx`.
  `SiteChrome` gives these routes no Maroon Tournament chrome.
- **Shows:** "The Maroon · Tournament Studio" (the platform, not a
  tournament), Create Tournament, the account menu, and, for a saved
  tournament, its name, a Published / Not published tag, and Setup ·
  Preview Website · Public Site (the last only once published). The bar
  refreshes after each dashboard save.
- **Never shows:** defending champions, Maroon vs White, the countdown, the
  Maroon Tournament's nav/tab bar/More menu, sponsor rotator, install
  prompt, or the Maroon footer.
- **Unchanged:** the Admin Center (`/portal/admin`) and every Maroon page
  keep their own chrome. Access is still decided by each page (organizer
  check, 404 otherwise); the shell renders only after that.
- **Phone:** compact bar, scrollable tab row, the save status pinned to the
  bottom of the screen, no sideways scroll.
- **My Tournaments** (`/tournaments`, added the same day) is the studio's
  home; the header links to it next to Create Tournament.

### 9.4 Built: My Tournaments (2026-09-30; not yet in production)
- **Route:** `/tournaments`, signed-in only (signed out → `/login`).
- **Who sees what:** only tournaments where the user is **owner** or
  **organizer** (`tournament_members`). Players, viewers and strangers see
  none. **Platform admins** are treated like everyone else here: they see
  only their own memberships (they can still open any dashboard by URL).
  The Maroon Tournament (Admin Center) and test editions never appear.
  Private tournaments do appear to their organizers.
- **Data:** `list_managed_editions(profile)` in
  `supabase/platform_dashboard.sql` returns each managed edition's setup
  (same as the dashboard, minus player emails, handicaps, player ids and
  entitlements), the role and a last-updated time.
  `lib/platform/myTournaments.ts` runs the one readiness engine and keeps only
  what the page shows (name, slug, visibility, role; per edition: year,
  destination, dates, published, stage, percent, last updated). No live
  tables are read.
- **Page:** one card per tournament with its editions beneath (newest year
  first), each with Continue Setup, Preview Website and (once published)
  Public Site. Empty state: "No tournaments yet" + Create Tournament, with
  the invite-only beta explained.

### 9.5 Built: beta creator-access requests (2026-09-30; not yet in production)
- **Who can create** is still decided only by `tournament_creator_access`
  (+ `platform_settings` and platform admin), exactly as
  `create_tournament_shell` enforces. A request never grants anything.
- **Requester** (`/tournaments/request-access`, signed-in only): name
  (prefilled), account email (read-only, snapshotted server-side), tournament
  or group name, year, approximate players, optional location, optional note.
  One pending request per person (database unique index); a second submit
  shows the existing one. States: form → "Request received" (creation stays
  unavailable) → "You're approved" (Create Tournament) or "Request not
  approved" (decision note + Contact us; no re-request loop).
- **Entry points:** `/tournaments/new` shows a notice (request access / being
  reviewed / not approved) above the draft workspace; the empty My
  Tournaments page offers Request access instead of Create; the create API's
  403 now points to the request page. Local drafts still work.
- **Platform admin** (`/admin/tournament-access`, neutral shell labelled
  "Platform Admin", not the Admin Center; 404 for everyone else): pending and
  reviewed requests, Approve / Deny with an optional note shown to the
  requester. Approval upserts `tournament_creator_access` = approved; denial
  changes nothing else; a reviewed request can't be re-decided. Requests are
  identified by a short reference number, not the row id.
- **Data:** `tournament_access_requests` (`supabase/platform_access_requests.sql`),
  service role only. No notifications (status is shown in the site).

### 9.6 Built: tournament activity + commissioner announcements (2026-09-30; backend only, not yet in production)
- **Language:** tournament = league, edition = season, organizer =
  commissioner, player = league member (user-facing only; database roles
  owner/organizer/player/viewer are unchanged and still decide permissions).
- **One model:** `tournament_activity` (`supabase/platform_activity.sql`):
  edition, type, actor, visibility (`everyone` / `players_only`), title,
  body, metadata (counts only), created_at. Types now:
  commissioner_announcement, tournament_published, schedule_updated,
  players_updated, teams_updated. Reserved for C4 (not accepted yet):
  pairings_posted, match_started, match_final, team_score_changed,
  round_started, round_final, leaderboard_changed. C4 replaces the named
  check constraint; the TS parser already skips unknown types.
- **Who sees it:** `get_tournament_activity(slug, year, viewer)` first applies
  the public site's own rule (reusing `get_public_tournament_years`:
  published, not test, public/unlisted/private), or lets commissioners and
  platform admins in before publishing. Then players-only items go only to
  players, organizers, owner and platform admins (not `viewer` members).
  Items carry short refs (a1...) numbered within what that viewer sees; author
  names only for members; no ids or emails. `get_public_tournament_site` is
  unchanged.
- **Who posts:** owner/organizer (`can_manage_edition`) and platform admins,
  via `POST /api/platform/tournaments/<t>/<y>/announcements` (plain text,
  title up to 120, body up to 2,000). Players, viewers, strangers and
  visitors can't. The Maroon stays in the Admin Center.
- **Automatic events** (recorded by the save/publish routes, best effort,
  never failing a save): only for published editions; published once per
  edition; players added/removed, teams added/removed or players moving
  teams, rounds added/removed/rescheduled or tournament dates changing.
  Renames, typo fixes, colors, rules and identical re-saves produce nothing;
  a repeat of the latest event within 15 minutes is merged into it.
- **Contract for the Tournament Home UI:** `lib/platform/activity.ts`
  (types, `parseActivityFeed`, `activitySummary`), server helper
  `loadTournamentActivity(slug, year)` in `activityServer.ts`, and
  `GET /api/platform/tournaments/<t>/<y>/activity`. Viewer capabilities:
  `role`, `isPlatformAdmin`, `canPostAnnouncement`, `canSeePlayersOnly`.
  No UI was built.

## 10. App architecture
The Player Portal (`/portal`) and Admin Center (`/portal/admin`) become
tournament-scoped: a user with several memberships picks a tournament. An
"active tournament" cookie picks the default. The live scoring screen
already reads its match by player, so it only needs the edition resolved.

## 11. API architecture
- New platform routes live under `/api/platform/*` (tournament CRUD, wizard
  submit, members, invitations).
- Tournament-scoped routes accept `tournamentSlug` + `year` (or
  `editionId`) and resolve them server-side through one helper
  (`resolveEdition`). They never trust a client-sent tenant ID without a
  membership check.
- Existing `/api/portal/tiger/*` and `/api/portal/admin/*` routes keep
  working for Maroon via the legacy default edition during migration.

## 12. Media, broadcast, wagers, fantasy
- **Media:** a future `edition_media` table (edition, uploader, kind =
  shot/upload/recording/highlight, round/hole/match refs, R2 key, status).
  Existing `archived_shot_videos` and playlist tables get `edition_id` in
  step 2.
- **Broadcast:** preserved as-is for Maroon and tenant-keyed in step 2.
  Treated as a **premium/future** platform feature (entitlement
  `broadcast`).
- **Wagers (MM Coins) and fantasy:** kept as **Maroon-only features behind
  an entitlement flag**, not offered to other tournaments in V1.
  **Real-money wagering is excluded from the commercial platform**: taking
  real-money bets for other groups is regulated gambling, a legal/licensing
  question, not an engineering one. The existing real-money design doc
  (`2026-08-05-wagers-phase3-real-money-design.md`) should not ship to
  customers without legal review.

## 13. Player profiles
- **Tournament player** (`tournament_players`): name/handicap/photo/bio as
  that tournament knows them; persists across editions of the same
  tournament.
- **Golfer profile** (future): the user's global identity (`profiles` plus
  a future `golfer_profiles`), linked from tournament players via
  `profile_id`. Career records, handicap (already global via the handicap
  tracker), course history, media and achievements aggregate over every
  linked tournament player. Nothing social is built in V1.

## 14. Monetization-ready architecture
`platform_plans` (entitlements jsonb, no prices) → `organizations.plan_key`.
Features check `hasEntitlement(plan, key)` (`lib/platform/entitlements.ts`).
Anything a plan doesn't explicitly grant is off. Seeded plans:
**founder** (The Maroon; everything on) and **beta** (invited beta
tournaments; full create/configure/run/test; no wagers/fantasy; no
`hosted_media`: commercial V1 media is none, on-device, or external links,
and hosted uploads stay The Maroon's). Paid plan
limits and pricing are decided **after** the wizard and real beta testing,
and undefined pricing never blocks productization. Later: subscriptions table, payment
provider webhooks, sponsors/ads slots per tournament site, custom domains
(Vercel domains API).

## 15. Features

### Current (Maroon, working)
Live hole-by-hole scoring with dual-entry agreement, sessions/matchups/tee
times, match play + individual leaderboards, scorecards, historical
archive 2024–2026, career stats, handicap tracker, course library, player
bios with approval, invites, broadcast (rotation, overlays, playlist,
countdown), MM Coins wagers, fantasy, editorial shell, website
year-per-section controls.

### V1 platform (to build)
Multi-tournament foundation, roles, wizard, configurable teams/players/
courses/structure/formats/scoring, branding, tournament site,
duplicate edition, Maroon migrated onto it, Texas Cup created through the UI.

### Excluded from V1
Payments, editorial CMS, ad marketplace, sponsorship sales, social network,
AI recommendations, full broadcast studio for other tenants, course/travel
booking, real-money wagers, custom domains (architected only).

## 16. Migration plan — The Maroon Tournament
Principles: incremental, additive first, every step reversible, no
historical score edits, no fabricated data.

| Step | Change | Risk | Reversible by |
|---|---|---|---|
| C1 ✅ built, not yet in prod | Platform tables + seed (§6.1) | Low (additive) | `platform_foundation_rollback.sql` |
| C2 ✅ built, not yet in prod | `edition_id` columns + backfill + defaulting trigger (§6.2) | Medium: touches live tables (tested: no row or trigger changes) | `platform_editions_rollback.sql` |
| C3 ✅ built, committed `6042114` | Code reads and writes through the edition scope (§6.5); Maroon's scope is built in memory | Medium: ~60 files (verified identical behavior) | Git revert |
| C4 | Keys switch to `edition_id`; year checks dropped | **High**: run only off-season, after a backup | Restore the backup |
| C5 | Teams as data (§6.3) | High: touches match/roster code | Git revert; column-compatible |
| C6 | Roles: `requireTournamentRole` replaces `requireHost` | Medium | Git revert |
| D | Tournament Creation Wizard (§5.1). UI prototype (other session) ✅; CREATE → EXIST ✅ (`platform_create_tournament.sql`); persistent COMPLETE + PUBLISH + readiness engine ✅ (`platform_dashboard.sql`, §5.1a). None in prod yet | Low (new code, platform tables only) | Drop the functions (checklist) |
| E | `/t/[tournament]/...` site; legacy URLs aliased | Medium | — |
| F | Texas Cup created via UI; isolation + regression tests | — | — |

**Historical data:** 2024–2026 static TS files stay as a read-only
archive adapter behind the tournament interface in V1. Importing them into
DB tables is tech debt, not a V1 requirement. Known historical oddities
(2025 "Round INDI"/round 0, 2024 archive-only match, 2026 renumbering) are
already documented in `project_specs.md` and must be preserved exactly.

**Production DB safety:** every SQL file is tested in PGlite against the
full migration chain before the owner runs it. Every production migration
follows `docs/production-migration-checklist.md`: safe time, a data backup
(`npm run backup:production`), the Supabase backup check, run, verify
queries, a site check, and the undo path. Never migrate during a live
event, and never while the repository is in an inconsistent state.

## 17. Product decisions (owner, 2026-09-29)
1. **URL shape:** `/t/[tournament]/[year]`.
2. **Tournament creation:** invite-only beta; platform admins approve
   creators (`tournament_creator_access`). Self-service later by switching
   `platform_settings.tournament_creation` to `self_serve`, with no core rework.
3. **Historical 2024–2026:** stay on the current static adapter for V1,
   behaving exactly as today. Database import is later technical debt.
4. **Wagers / MM Coins / fantasy:** exclusive to The Maroon Tournament
   behind entitlements. **Real-money wagering is never exposed to
   commercial tournaments.**
5. **Plans/pricing:** no hard-coded pricing. Founder (The Maroon, all on)
   and Beta (full tournament features) now; paid limits decided after the
   wizard and beta testing.
6. **Wizard principle:** CREATE → EXIST → COMPLETE → PUBLISH → PLAY (§5.1).
   Minimal creation; everything else completable later from the Tournament
   Dashboard.
7. **The Maroon Tournament is the production reference implementation.**
   Any loss of its existing functionality is a regression.

## 18. Technical debt
See `TECHNICAL_DEBT.md`. Change history: `CHANGELOG.md`.
