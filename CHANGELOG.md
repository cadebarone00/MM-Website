# Changelog

Platform-level changes (multi-tenant productization). Detailed history of
the founding tournament's features lives in `project_specs.md`.

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
