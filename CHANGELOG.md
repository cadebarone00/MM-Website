# Changelog

Platform-level changes (multi-tenant productization). Detailed history of
the founding tournament's features lives in `project_specs.md`.

## 2026-09-30 — Organizer preview of the public site

**What changed**
- `supabase/platform_public_site.sql`: the site data is built by one shared
  `tournament_site_projection`. `get_public_tournament_site` keeps the
  same access checks and returns byte-identical output. New
  `get_tournament_site_preview(profile, edition)` returns it only to people
  who can manage the edition (`can_manage_edition`, so this file now also
  needs `platform_dashboard.sql`); The Maroon is refused. Service role only.
- `lib/platform/publicSite.ts`: `publicBasePath` / `previewBasePath`;
  `publicSiteServer.ts`: `loadTournamentPreview`.
- `components/platform/PublicTournamentPage.tsx`: the renderer is now
  `TournamentSiteView`, used by both the public site and the preview.
- New `components/platform/TournamentPreviewPage.tsx` (+ CSS module) and
  routes `app/tournaments/[tournament]/[year]/preview/{layout,page,[section]/page}.tsx`.
- Dashboard: a "Preview Website" link. `SiteChrome`: no Maroon chrome on
  preview pages.

**Testing**
- `lib/platform/preview.test.tsx` (4): owner/organizer/admin can preview an
  unpublished tournament while `/t` stays hidden; stranger, player, another
  tournament's owner, anon and The Maroon are refused; preview data and
  markup equal the public site's; no emails/handicaps/ids; no live-scoring
  tables read or changed; empty states and disabled sections.
- `npm test` 605/605, `test:db` and `test:db:platform` pass, compliance OK,
  lint: the same 7 older errors, type check: only `databaseBackup.ts`'s 2
  older errors.
- Production build (isolated copy): 239 pages. Browser
  (`test:browser:public`, `test:browser:dashboard`) pass, including the
  preview flow end to end.

## 2026-09-30 — Public tournament site /t/[tournament]/[year]

**What changed**
- `supabase/platform_public_site.sql`: `can_view_tournament`,
  `get_public_tournament_site` (the one visitor-safe loader; returns public
  data only) and `get_public_tournament_years` (latest edition). Service
  role only; no live-scoring tables read.
- `lib/platform/publicSite.ts` (adapter to the kit: pages, links, robots,
  schedule/date formatting, disabled sections left out, scoring notice) and
  `publicSiteServer.ts` (loader; malformed slug/year never reach the
  database).
- Routes `app/t/[tournament]/[year]/{page,[section]/page,layout}.tsx` and
  `app/t/[tournament]/page.tsx` (latest edition), plus
  `components/platform/PublicTournamentPage.tsx`.
- `components/nav/SiteChrome.tsx`: no Maroon chrome under `/t`.
- Public UI kit (other session's), reused with additive extensions:
  - optional `Team.points`, `Course.par`/`yardage`
  - partial `SiteLinks`
  - an `information` page
  - `ScoringPending` and `MediaLinks`
  - `scoringNotice`/`mediaLinks` data fields

  All 6 of its original tests pass unchanged.
- Compliance: new `public-tournament-site` registry entry (review required).
  `featureRegistry.test.ts`'s hard-coded count went from 14 to 16; it was
  already stale from the other session's `backup-recovery` entry.
- Test tooling: `scripts/test-public-site-browser.mjs`
  (`npm run test:browser:public`). `lib/platform/testDatabase.ts` holds the
  shared practice-DB helpers, moved out of `dashboard.test.ts`.

**Testing**
- `npm test` 601/601. The 8 new public-site tests cover:
  - public visible; unpublished and test season hidden, even from organizers
  - private: members/admins only, identical to "missing" for others
  - unlisted: by link, noindex
  - no emails, handicaps, ids or organizer fields
  - no cross-tournament leakage; wrong year/slug resolves nothing
  - The Maroon never served, and the loader never reads live tables
  - disabled sections hidden from nav, URL and data
  - each tournament's own branding, neutral when unset
- `test:db` 9/9, `test:db:platform` 9/9, compliance check OK.
- Lint: the same 7 older errors.
- Type check: 0 errors in this work. `lib/platform/databaseBackup.ts` (the
  other session's in-progress backup work) has 2 `NODE_ENV` type errors
  that will fail `next build` until fixed.
- Production build of this work: 239 pages.
- Browser (`test:browser:public`), against the real build + practice DB:
  - visibility and resolution of every case above, over HTTP
  - latest-edition redirect
  - Blue/Gold branding; no Maroon chrome, text or emails
  - nav under `/t`, and holding states
  - disabled sections 404 and are absent from nav
  - noindex for unlisted/private; member access to private
  - no sideways scroll at phone width
- **Maroon regression:** production builds before (`50d97c4`) and after,
  run side by side against the real database (read-only), gave identical
  visible content on 13 pages and identical JSON on 5 endpoints. On the
  real database, which has no platform functions yet, `/t/...` returns a
  clean 404 with no errors.

**Known limitations:**
- Organizers can't preview an unpublished site.
- Handicaps aren't shown publicly (a consent setting is needed).
- The kit's header and hero copy ("THE CHAMPIONSHIP", "THE CUP",
  "Tradition in the making") is fixed text.
- The studio `/tournaments/*` still sits in The Maroon's chrome.

## 2026-09-30 — Persistent Tournament Dashboard, readiness engine, PUBLISH

**What changed**
- `supabase/platform_dashboard.sql`: `can_manage_edition`,
  `get_tournament_setup`, `save_tournament_section` (10 sections; every id
  checked against this tournament/edition; refuses the legacy Maroon
  tournament) and `set_edition_published`. Service role only. Writes
  platform tables only.
- `supabase/platform_foundation.sql` (still not in production):
  - `edition_courses` and `edition_rounds` (planned setup; a round can only
    use its own edition's course)
  - `edition_settings.media` (`none` / `device_external` /
    `maroon_hosted`)
  - `tournament_editions.published_at`
  - `create_tournament_shell` now writes planned rounds to `edition_rounds`
- `lib/platform/readiness.ts`: the one readiness engine (stages,
  percent, missing items, publish/play gates). The draft preview's
  `draftSetup` now uses it too, so the old hard-coded statuses are gone.
- `lib/platform/sectionRules.ts`: per-section field rules, run on the
  server. They reuse the shared rulebook (`LIMITS`, `isRealDate`,
  `isHexColor`, `isEmail`, and `normalizeScoring`, now extracted from
  `validateTournamentConfig`).
- `lib/platform/setup.ts` (one saved-setup shape),
  `dashboardApi.ts` (publish gate and error mapping; "not allowed" reads as
  404), `dashboardServer.ts`.
- Routes: `GET /api/platform/tournaments/[t]/[y]`, `PATCH …/sections/[section]`,
  `POST …/publish`. `/tournaments/[t]/[y]` is now the editable dashboard
  (`components/tournament-dashboard/`, one editor per section).
- Retired `lib/platform/savedTournament*.ts`, replaced by
  `get_tournament_setup`.
- Test infrastructure: `scripts/fake-supabase.mjs` (a stand-in Supabase
  API over all real migrations in PGlite, test-only, never used by the app)
  and `scripts/test-tournament-dashboard-browser.mjs`
  (`npm run test:browser:dashboard`).

**Why:** organizers can now finish setup at their own pace, save by
section, and publish when ready, with one engine deciding readiness.

**Migrations:** `platform_dashboard.sql` (plus the amended C1 and CREATE
files). None run in production.

**Testing**
- `npm test` 588/588. New tests cover section rules, the readiness engine
  (stages, rising percent, accurate missing lists, publish lock/unlock,
  optional sections and media never blocking, commercial "Blocked"
  before C4), the dashboard database functions, and the publish gate.
- The database tests cover:
  - every section saves and reloads identically
  - organizer, co-organizer and admin can edit; players, strangers and
    other owners can't read, save or publish
  - ids from another tournament are rejected
  - hosted media is refused for beta
  - The Maroon can't be edited
  - zero live-scoring or Maroon rows change
- `test:db` 9/9 and `test:db:platform` 9/9. `tsc` 0 errors. Lint shows the
  same 7 older errors, none new.
- Fresh production build (239 pages). **Browser, signed in, end to end:**
  - quick create
  - six sections saved one by one, with the percent rising each time
  - a reload that keeps everything
  - optional media that doesn't block
  - publish as its own step
  - a stranger gets 404 by page and API
  - no live or Maroon rows touched
- The other session's wizard browser test (updated to the engine's 18% and
  46%) and the signed-out create browser test also pass.

**Known limitations:** pairings aren't built (they belong with live
scoring, C4). The public site `/t/[tournament]/[year]` isn't built yet.
Players are per-edition entries, with no picking of returning players.
Courses aren't linked to the course library.

## 2026-09-29 — CREATE → EXIST: saving a new tournament

**What changed**
- `supabase/platform_create_tournament.sql`: `create_tournament_shell` makes,
  all-or-nothing, the creator's organization (beta plan, reused after the
  first), the Tournament (draft, private by default), its first Edition,
  owner membership, teams and `edition_settings`. It enforces invite-only
  access itself.
- `supabase/platform_foundation.sql` (still not in production): adds
  `edition_settings.plan` for planned headcount, rounds and formats.
- `lib/platform/tournamentConfig.ts`: shared `tournamentSlugError` and
  `suggestTournamentSlug` (reserved list now includes `t`, `tournaments`).
- `lib/platform/tournamentDraft.ts`: web address and year added; dates
  optional (both or neither); no forced `-tournament` suffix; Basics shows
  "Needs Attention" until dates are set.
- `lib/platform/tournamentCreate.ts`: the server runs the same draft rules
  and builds the database payload. Teams get non-Maroon starting colors, and
  logo URLs from the browser are ignored (no hosted media).
- `lib/platform/tournamentAccess.ts`: `requireTournamentRole` (platform
  admins act as owner). `lib/platform/savedTournament*.ts` loads a saved
  tournament back into the dashboard's shape.
- `POST /api/platform/tournaments` and `/tournaments/[tournament]/[year]`
  (organizers only, 404 otherwise).
- Wizard: **Create now, finish later** on Basics, web address and year
  fields, saving with a local-draft fallback. The dashboard markup moved
  unchanged into `TournamentSetupDashboard`, shared by drafts and saved
  tournaments.
- Checklist: the new migration, plus SQL to make yourself admin and approve
  organizers (tested on the practice database).

**Bug caught by tests before shipping:** the first version of the access
check let anyone create in invite-only mode. SQL's "unknown" result for a
missing access row slipped past `if not (...)`. It's fixed, and a
12-combination test now proves the database matches `canCreateTournament`
exactly.

**Migrations:** `platform_create_tournament.sql` (needs C1). Not run in
production.

**Testing**
- `npm test` 561/561. That includes 11 new create/draft tests: payload
  rules, the atomic create, a taken address leaving nothing behind, the
  permission matrix, service-role only, and a round trip from what was
  entered to what the saved dashboard shows.
- `test:db` 9/9 and `test:db:platform` 9/9 (the chain now includes the
  create function).
- `tsc` 0 errors. Lint shows the same 7 older errors, none new.
- Fresh isolated production build (239 pages). The new signed-out browser
  test passes (401 without an account, strangers get 404, quick create with
  a name only, the address follows the name until edited, local fallback),
  and so does the other session's original wizard browser test.

**Known limitations:** signed-in end-to-end create hasn't been run against
a real Supabase (debt #31). Saved sections are read-only (debt #28). There's
no request-access flow yet (debt #27).

## 2026-09-29 — Review of the Tournament Creation Wizard prototype (`/tournaments/new`)

The wizard itself was built by another session (commit `bf3be2c`). This
entry records the review and the small changes it produced.

**Findings:** see spec §5.1 "Implementation status" and
`TECHNICAL_DEBT.md` #21–#26. In short:
- **Good:** the reuse of `TournamentConfig` types and the format registry,
  readiness logic kept in `lib/` rather than UI components, honest TBD
  handling, and locked publish/play.
- **Scope:** no C3, live-scoring, SQL or API files were touched.
- **Gaps:** creation isn't minimal yet, nothing is saved, readiness is a
  placeholder, and there's a slug collision risk.
- **Outside the wizard:** `components/maroon/MaroonMenu.tsx` got a small
  visual change (spacing, 9px text, dropdown arrow hidden on phones).

**Changed in this review**
- Removed the stale `.next/types` (generated at 19:38, before the rename,
  with 150 `portal/tiger` references). `tsc` went from 50 errors to 0.
- New `hosted_media` entitlement: on for `founder` (The Maroon), off for
  `beta`, in `supabase/platform_foundation.sql` (not yet in production) and
  `lib/platform/entitlements.ts`, with a test.
- Dashboard Media card wording no longer promises hosted uploads or
  broadcast to commercial tournaments.
- `eslint.config.mjs`: `.vercel/**` (git-ignored deployment copies) and
  `.superpowers/**` are no longer linted, and `.cjs` scripts may use
  `require()`. Full lint went from 32 errors to 7. The 7 left are
  pre-existing React rule issues in broadcast/fantasy/scorecard screens and
  aren't from today's work.

**Testing**
- Fresh production build (isolated worktree, 238 pages including
  `/tournaments/new`).
- `tsc` 0 errors with freshly generated route types.
- `npm test` 543/543, `test:db` 9/9, `test:db:platform` 9/9.
- The wizard's own browser test passes against the fresh build.

## 2026-09-29 — Platform Phase C3: code reads and writes through an edition scope

**What changed**
- New `lib/platform/editionScope.ts`: `EditionScope`, `maroonEdition`,
  `editionFilter`, `editionColumns`, `editionRealtimeFilter`,
  `editionYearParam`, and a guard (`EditionNotLiveError`) that refuses any
  tournament but The Maroon until C4. `getActiveEdition()` was added to
  `lib/live/activeSeason.ts`.
- About 60 files in `lib/live`, `lib/broadcast`, `lib/wagers`, `lib/data`,
  `lib/countdownServer.ts`, API routes and Admin pages now filter and write
  live tables through those helpers. Library functions take
  `edition: EditionScope` instead of `seasonYear: number` (compiler-checked).
- Deliberately left as-is, with the reasons in spec §6.5: pointer tables,
  multi-year readers, `onConflict` strings, wager market keys, and golfer
  handicap history.

**Why:** C4 must filter every live query by edition, not just year. Now
that switch happens in one file, and a second tournament can't touch The
Maroon's rows in the meantime.

**Migrations:** none.

**Affected features:** all live scoring, Admin Center, broadcast and
wagers code paths, with **no behavior change**.

**Testing**
- `npm test`: 537/537. That includes 7 new C3 tests (the scope guard, plus
  real Supabase-client proof that `.match(editionFilter())`/`editionColumns()`
  send byte-identical reads, updates, deletes, inserts and upserts) and 5
  tests another session added for its tournament-draft work.
- `npm run test:db` 9/9 and `npm run test:db:platform` 9/9. `tsc` shows 0
  errors and `eslint` is clean.
- **Before/after comparison against the real database:** production builds
  of the pre-C3 commit (`83cbd2b`) and the C3 commit (`6042114`) both built
  (238 pages). Run side by side on isolated ports, they returned
  byte-identical JSON on 13 read-only endpoints (countdown, season catalog,
  rosters, player profiles, broadcast state/leaderboard/match play/
  playlist) and identical visible content on 10 public pages. There were no
  server errors. Only non-writing endpoints were called.
- Route unit tests only cover "rejects when not signed in", so the
  comparison above, not those tests, is the evidence for the converted
  query paths.

**Known limitations:** multi-year readers and pointer tables are still
Maroon-wide (C4). Signed-in Admin pages weren't in the side-by-side
comparison (it had no login); they're covered by the type checker and the
request-equivalence tests.

## 2026-09-29 — Platform Phase C2: edition tag on live tables, backup tooling, owner decisions

**Pre-flight gates (all passed, owner-requested):** the Tiger → Admin
rename was committed (`69af7b0`, `33193bd`) with a clean tree and no `tiger`
code paths left. A fresh `next build` of that commit passed (238 pages,
run in an isolated worktree so the running dev server was untouched), and
`tsc` showed 0 errors after it. The earlier `.next/types` errors were stale
output from before the rename. `npm test` passed 515/515 before any C2 work.

**What changed**
- `supabase/platform_editions.sql` (C2): nullable `edition_id` + composite
  FK `(edition_id, season_year)` + index + `set_edition_id` trigger on all
  **30** year-keyed tables. It backfills The Maroon's edition for every
  existing row, with the existing triggers switched off only for the
  backfill. `supabase/platform_editions_rollback.sql` undoes it exactly.
- `supabase/platform_foundation.sql` (C1, amended; never run in production
  yet): adds the `beta` plan, `platform_settings` (invite-only vs
  self-serve creation) and `tournament_creator_access`. New
  `supabase/platform_foundation_rollback.sql`.
- `lib/platform/entitlements.ts`: `hasEntitlement` (anything not granted is
  off), `maxPlayers`, and `canCreateTournament`.
- `lib/platform/tableBackup.ts` + `scripts/backup-production.ts`
  (`npm run backup:production`): read-only export of every table to
  `out/backups/<time>/`, checked against the server's own row counts.
- `docs/production-migration-checklist.md`: the step-by-step production
  procedure, including verification queries tested on the practice database.
- `scripts/test-scoring-reliability.mjs`: opt-in `WITH_PLATFORM`
  (`npm run test:db:platform`) re-runs every scoring scenario on top of
  C1 + C2. The default `npm run test:db` is unchanged.
- The spec records the owner decisions (§17), the wizard principle (§5.1),
  and C2 as built (§6.2).

**Why:** C2 lets every live row say which tournament edition it belongs to
without changing any existing behavior. That's the prerequisite for a
second tournament.

**Migrations:** `platform_foundation.sql`, then `platform_editions.sql`.
**Neither has been run in production.** Follow the checklist.

**Affected features:** none at runtime. No existing app code reads or
writes `edition_id` yet.

**Testing:** `npm test` shows 525/525 passing (505 original + 20 platform tests), with 10 added in this round:
- C2 leaves **every row of every table and every trigger's on/off state
  byte-identical**. It ran against a production-shaped database with a real
  started, scored, published and closed-out match, including a settled
  wager. A mutation test (backfill without switching triggers off) makes
  this test fail, which proves the guard is needed and effective.
- Existing scoring functions still work after C2, and every row they
  create is tagged automatically.
- Year and edition can't disagree. Changing the year re-tags the row. A
  second legacy tournament is refused.
- Both rollbacks restore the pre-migration database exactly. C2 can be
  re-applied, and the C1 rollback refuses to run while C2 is present.
- Plans and entitlements, the invite-only/self-serve rule, and backup
  paging and error handling.
- `npm run test:db` 9/9 and `npm run test:db:platform` 9/9. `tsc` and
  `eslint` are clean.

**Known limitations:** until C4, only The Maroon can write to the live
tables, because keys are still year-based. The backup script copies data,
not database code (that lives in `supabase/` in git).

## 2026-09-29 — Platform Phase A–C1: audit, spec, foundation

**What changed**
- Added `THE_MAROON_PRODUCT_SPEC.md`: full audit of the existing system,
  hard-coded assumptions, target multi-tenant model, roles, wizard
  configuration model, migration plan, and open product decisions.
- Added `supabase/platform_foundation.sql` (additive): `platform_plans`,
  `organizations`, `tournaments`, `tournament_editions`,
  `tournament_members`, `tournament_players`, `edition_teams`,
  `edition_roster`, `edition_settings`, plus `profiles.platform_role`.
  It seeds The Maroon Tournament as tenant #1 from existing data.
- Added `lib/platform/formats.ts`: a format registry (Singles, Fourball,
  Alternate Shot) that derives matches and tee times per round from team
  size instead of the hard-coded 12-player numbers.
- Added `lib/platform/tournamentConfig.ts`: the validated configuration
  contract the Create Tournament wizard will submit, plus a structure
  summary (matches, tee times, points available, points to win).

**Why:** the first step of turning The Maroon into a platform other golf
groups can use without code changes.

**Migrations:** `supabase/platform_foundation.sql`. **Not yet run in
production.** It is safe to run at any time (additive and idempotent), but
nothing reads it yet.

**Affected features:** none. No existing file was modified.

**Testing:** `npm test` shows 515/515 passing (505 existing + 10 new). New tests:
- The migration runs on top of the full production migration chain in
  PGlite, twice, and seeds correctly from existing hosts, player slots and
  2027 roster.
- The database rejects cross-tenant roster rows: a player from another
  tournament, a team from another edition, or a forged tournament id.
- Visitors (anon/authenticated) cannot read or write the new tables.
- The format registry reproduces today's hard-coded numbers exactly.
- The real 2026 edition expressed as a config reproduces its real 33
  points available / 17 to win.
- A 16-player Blue vs Gold "Texas Cup" validates with no code changes.
- Validation error paths.

`tsc --noEmit` and `eslint` are clean for the new files. `next build` was
not run because another terminal's dev server shares `.next`.

**Known limitations:** the live engine does not read any of this yet
(spec §16, steps C2+). Stroke-play-only events are not supported yet.
