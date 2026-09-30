# The Maroon — Master Product Spec

> Permanent source of truth for turning The Maroon from one friend group's
> tournament site into a multi-tenant golf tournament platform.
> `project_specs.md` stays the detailed log of shipped rounds for the
> existing tournament; this file owns the **platform** direction.
> Update this file whenever an architectural or product decision changes.

- **Created:** 2026-09-29
- **Status:** Phase A (Discovery) and B (Spec) done. Phase C, step 1
  (additive platform tables) built and tested locally, **not yet run in
  production**. Everything after that is proposed.
- **Naming:** per the 2026-09-29 rebrand, the brand is **The Maroon**, the
  founding event is **The Maroon Tournament** (formerly "The Maroon
  Masters"), and the host area is the **Admin Center** (formerly "Tiger
  Center"). Code still says `tiger` in many places.

---

## 1. Product

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
| `platform_plans` | Plan catalog with an `entitlements` jsonb. **No prices** (pricing lives in the payment provider later). Seeds only `founder` (everything on). | — |
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

### 6.2 Next (Phase C step 2): tenant key on live tables
1. Add nullable `edition_id` to each `live_*`, `broadcast_*`,
   `career_archive_*`, odds and wager table.
2. Backfill: `edition_id = (Maroon edition where season_year = row.season_year)`.
3. `before insert` trigger: if `edition_id` is null, derive it from
   `season_year` for the legacy tournament. Legacy code keeps working
   unchanged.
4. After all code writes `edition_id`, make it `not null`, move unique
   keys from `season_year` to `edition_id`, and drop the `between 2027 and
   2034` checks.
5. SQL functions (`submit_live_hole_reliable`, `start_live_round_atomic`,
   publication trigger, etc.) gain an edition parameter. Wrappers keep the
   old `(season_year, …)` signature for Maroon until callers move over.

### 6.3 Then (Phase C step 3): teams as data
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
  and `/t/[tournament]/history`. *(Proposed; needs owner sign-off, see §17.)*
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
Features check `hasEntitlement(org, key)`. Candidate plans (Free / Maroon
Tournament / Maroon Championship / White Glove) and their limits are
**undecided product calls**. Only the `founder` plan (everything
unlocked) is seeded, for The Maroon. Later: subscriptions table, payment
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
| C1 ✅ built | Platform tables + seed (§6.1) | Low (additive) | Dropping the new tables |
| C2 | `edition_id` columns + backfill + defaulting trigger | Medium: touches live tables | Drop column and trigger |
| C3 | Code reads through `resolveEdition()`; Maroon is the default edition | Medium: many files | Git revert |
| C4 | Keys switch to `edition_id`; year checks dropped | **High**: run only off-season, after a backup | Restore the backup |
| C5 | Teams as data (§6.3) | High: touches match/roster code | Git revert; column-compatible |
| C6 | Roles: `requireTournamentRole` replaces `requireHost` | Medium | Git revert |
| D | Wizard creates tournaments/editions | Low (new code) | — |
| E | `/t/[tournament]/...` site; legacy URLs aliased | Medium | — |
| F | Texas Cup created via UI; isolation + regression tests | — | — |

**Historical data:** 2024–2026 static TS files stay as a read-only
archive adapter behind the tournament interface in V1. Importing them into
DB tables is tech debt, not a V1 requirement. Known historical oddities
(2025 "Round INDI"/round 0, 2024 archive-only match, 2026 renumbering) are
already documented in `project_specs.md` and must be preserved exactly.

**Production DB safety:** every SQL file is tested in PGlite against the
full migration chain before the owner runs it. Before C2 and C4, take a
Supabase backup (Dashboard → Database → Backups). Never migrate during a
live event.

## 17. Open product decisions (need owner input)
1. **URL shape** for tournament sites: `/t/[tournament]/[year]` (proposed)
   vs `/tournaments/[tournament]-[year]`.
2. **Who can create a tournament** in V1: anyone who signs up (self-serve)
   vs invite-only beta approved by a platform admin (recommended to start).
3. **Historical import** of 2024–2026 into the database: now vs later
   (recommended: later).
4. **Wagers/fantasy** stay Maroon-only (recommended) or become a
   platform feature (needs legal review for anything real-money).
5. **Plan limits and pricing** (player caps, editions per year, premium
   features).

## 18. Technical debt
See `TECHNICAL_DEBT.md`. Change history: `CHANGELOG.md`.
