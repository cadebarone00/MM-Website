# Account retirement and legacy-testing architecture (approved decisions, 2026-10-30)

**Status: PREPARED FOR REVIEW. Nothing has been run.** No hosted SQL, no Supabase or Vercel setting change, no
deletion, no restore of production data, no local legacy stack started, nothing pushed, merged or deployed. The scripts
in `scripts/legacy-local/` were tested only against throwaway local databases built from local test data.

This document supersedes the sequencing parts of `docs/account-reset-plan-2026-10-30.md` (its scripts, coverage
checklist and test evidence still apply, with the corrections in section 6). The V2 sign-up enforcement design is in
`docs/v2-auth-enforcement-spec-2026-10-30.md`.

## 1. Approved decisions (owner, 2026-10-30)

| # | Decision |
|---|---|
| 1 | Legacy testing uses a separate LOCAL Supabase in Docker (`maroon-legacy`), not `maroon-auth-dev` |
| 2 | Production Supabase is on the **Free** plan: no Supabase-managed backups, so our own backup is the only one |
| 3 | The local copy keeps real public Maroon Masters archive player names |
| 4 | The local copy keeps legacy profile photos |
| 5 | V1 registration stays open until the approved production cutover; it closes only then |
| 6 | Production is not reset until V2 authentication is fully built and tested |
| 7 | Tester allowlist and strict 13+ are enforced at the Supabase / server boundary, including direct API and OAuth paths |
| 8 | Encrypted backups are kept until the owner explicitly approves deleting them |

**Goals:** V2 starts with zero legacy logins; everyone (organizers and past players too) registers again; every
independent Maroon Masters record stays in production; legacy golf data is kept only in the isolated local copy; nothing
reconnects old records to new accounts automatically; owner and organizer powers come back only after a fresh sign-up
and an explicit grant.

## 2. Where every kind of data ends up

| Data | Production after reset | Local copy (`maroon-legacy`) | Encrypted backup |
|---|---|---|---|
| **Maroon Masters history**: archived scorecards (`archived_scorecard_*`, 159 rounds), archived shot videos, career archive and stats (`career_*`), edition rosters / teams / rounds / courses / settings (`edition_*`), live scoring (`live_*`), handicap rounds, broadcast, odds, player records (`player_slots`, 13) and overrides, season calendar, The Maroon tournament + its 11 editions + its players, course library, settings | **Kept, unchanged.** Only account links are emptied (`player_slots.claimed_by`, `tournament_players.profile_id`, audit "who" columns) | Kept | Kept |
| Typed-in contact details on kept Maroon records (`player_slots.email`, `tournament_players.email`) | Emptied (group S7; owner confirms) | Removed by sanitizing | Kept |
| Legacy logins (16) and Supabase login data: identities, sessions, refresh tokens, MFA, one-time codes, half-finished OAuth | **Removed** | Kept as test logins: `legacy-NN@legacy.invalid`, one test password, no real tokens / sessions / OAuth | Kept (real) |
| Profiles (14), display names, usernames, bios | Removed | Kept as rows with **anonymized** names / usernames ("Legacy Golfer NN", `legacy_NN`), bios removed, photos kept (local only), test emails | Kept |
| Personal golf: 162 `player_rounds` (personal copies), 1 golf trip and everything under it, 2 shared rounds, personal scoring groups, code tournaments, MM coin / wagers | Removed (Part 1, groups S1-S4, S6) | **Kept, all relationships intact** | Kept |
| Customer (non-Maroon) platform tournaments | Removed (S5) | Kept | Kept |
| Account-only rows: friends, memberships, creator access / requests, claim invitations, V2 activation rows, deletion ledger | Removed (Part 2); powers re-granted explicitly | Kept | Kept |
| Storage `profile-photos` | Removed (dashboard, after backup) | Kept (decision 4) | Kept |
| Storage `tournament-docs` (code-tournament PDFs) | Removed with S4 | Kept | Kept |
| Storage `shot-videos` (Maroon media) | Kept | Kept if backed up (optional, may be large) | Optional |
| Push subscriptions (real device endpoints) | Removed (with S1) | **Removed** (sanitize) | Kept |
| Supabase sign-in log (`auth.audit_log_entries`) | Kept (D6 on hold) | Never restored | Kept |

Prerequisite read-only check before Part 1 (production SQL editor, owner): `player_rounds` and `scoring_groups` grouped
by `source`. **Any `scoring_groups.source = 'tournament'` row stops Part 1** (it may be a Maroon card).

## 3. Local legacy copy: architecture

| Item | Value |
|---|---|
| Project id | `maroon-legacy` (Docker containers `supabase_*_maroon-legacy`) |
| Ports | 57320-57324 (API 57321, database 57322, Studio 57323, Mailpit inbox 57324); app on 3998 |
| Work folder | `out/legacy-local` (git-ignored; holds only the stack config, never backups) |
| Schema and data | Only from a verified production backup. No repository migrations are applied |
| Restored | Whole `public` schema (tables, data, functions, triggers, policies, grants); `auth.users` + `auth.identities` rows only; Storage buckets and files through the local Storage API |
| Never restored | Sessions, refresh tokens, one-time codes, MFA, OAuth flow state, sign-in log, `cron`, `net` / webhooks, `supabase_functions`, Realtime, Vault, extensions |
| Email | No SMTP: everything lands in the local Mailpit inbox; every address is `@legacy.invalid` anyway |
| Sign-ups | Off. Testers sign in as `legacy-01@legacy.invalid` ... with the test password |
| Off | Realtime, Edge Functions, analytics, pooler, Google / Apple providers |
| Webhooks / jobs | Triggers that can call the internet are disabled by sanitize; pg_cron jobs deactivated if present |
| App settings | Built from scratch by `start-app.mjs`: local API and keys only; email, push, cron, Google Sheet / Scorekeeper, R2, OpenAI, Places forced empty |
| Guards | No script takes a connection string: they reach only the `supabase_db_maroon-legacy` container. Production (`msvrbifhdvltibafzrdb`) and `maroon-auth-dev` (`llqqddiundaptmsgccwj`) ids are refused everywhere |
| `maroon-auth-dev` | Untouched |

### Scripts (`scripts/legacy-local/`)

| File | What it does | Writes? |
|---|---|---|
| `guard.mjs` (+ `guard.test.mjs`) | Forbidden project ids, hosted-address check, outbound settings, safe backup folder, `--confirm` | No |
| `config.toml` | The stack's Supabase settings | No |
| `stack.mjs` | `check` (default) / `start` / `status` / `stop` / `destroy` | Only the local stack, with `--confirm maroon-legacy` |
| `local.mjs` | The only way to reach a database: the local container | No |
| `../backup-database.ts` (changed) | `npm run backup:database`: now requires `MAROON_BACKUP_DIR` (outside Git / synced folders) and the production project | Backup folder only |
| `backup-storage.mjs` | READ-ONLY download of production Storage files, SHA-256 per file | Backup folder only |
| `verify-backup.mjs` | Offline: checksums, dump readable, Postgres version | No |
| `restore-local.mjs` (+ `restore-list.test.mjs`) | Verified backup -> empty local stack, one transaction, counts vs `--expected`, Storage upload with checksum | Local stack |
| `expected-counts.example.json` | Phase 0 numbers as reported (to re-check against the CSV) | No |
| `sanitize-legacy.sql`, `sanitize.mjs` | One transaction; refuses to finish if anything real remains | Local stack |
| `history-snapshot.sql`, `rehearse-reset.mjs` | Full reset rehearsal, always ROLLBACK | No (rolled back) |
| `start-app.mjs` | Website on the sanitized copy | No |

## 4. Implementation sequence

Each step needs the previous one to pass. **Bold steps need an explicit owner approval (section 8).**

**Track V: V2 authentication (decision 6: before any production reset)**
1. V1. Approve `docs/v2-auth-enforcement-spec-2026-10-30.md`.
2. V2. Build it on `maroon-auth-dev` and the local auth stacks only (hook, birthday-first, allowlist, tester activation).
3. V3. Bypass test suite passes (spec section 9). The age gate is not called secure before this.
4. V4. Email: verified sending domain + custom SMTP + code templates on `maroon-auth-dev` first.

**Track L: local legacy copy (can run in parallel with V, needs no production change)**
5. **B1. Backup location.** Owner prepares an encrypted folder (e.g. a BitLocker drive `D:\MaroonBackups`) outside Git and
   outside OneDrive. `MAROON_BACKUP_DIR` points at it.
6. **B2. Production backup (read-only on production).** `npm run backup:database`, then
   `node scripts/legacy-local/backup-storage.mjs --into <that folder>`, then the read-only inspection CSV again (same window).
7. B3. `node scripts/legacy-local/verify-backup.mjs <folder>` -> "BACKUP VERIFIED".
8. **L1. Start the empty local stack.** `node scripts/legacy-local/stack.mjs start --confirm maroon-legacy`.
9. **L2. Restore locally.** `restore-local.mjs <folder> --confirm maroon-legacy --expected <counts.json>`.
10. **L4. Sanitize.** `sanitize.mjs --confirm maroon-legacy`.
11. L6. Rehearse the reset: `rehearse-reset.mjs --confirm maroon-legacy` -> "REHEARSAL PASSED" (rolled back).
12. L7. Use it: `start-app.mjs --confirm maroon-legacy`; testers check trips, rounds, scores and photos.

**Track P: production cutover (only after V3, V4 and L6 pass)**
13. **P1. Cutover window.** No live event; owner confirms Supabase / Vercel / GitHub / registrar admin access (two owners,
    two-factor). Database webhooks and jobs listed by the inspection switched off.
14. **P2. Close V1 registration** (Supabase setting). Required before P4: the live Oct 8 site auto-claims an unclaimed
    Maroon player record when someone signs up with a matching "MM..." username, and P4 releases every claim.
15. **P3. Fresh backup + verify** (B2 + B3 again, minutes before P4), and a second local restore + rehearsal on it.
16. **P4. Reset.** Part 1 dry run -> COMMIT; Part 2 dry run -> COMMIT (typed approved numbers); Storage dashboard: empty
    `profile-photos` (and `tournament-docs` if S4).
17. P5. Inspection again: 0 logins, Maroon counts equal to P3, no leftover account ids.
18. **P6. V2 database files** (separately approved): `profile_initialization.sql` -> `account_deletion.sql` ->
    `profile_friends.sql` / `profile_read_model.sql` if missing -> amended `account_activation.sql` ->
    `auth_code_attempts.sql` -> auth hook function. **Never** `account_activation_enforcement.sql` (Stage D).
19. **P7. Deploy V2 and promote** (the live site leaves V1); enable the hook in mode `testers`.
20. **P8. Owner signs up fresh, completes onboarding; re-grant `owner`.** Then each organizer (e.g. Cam): fresh sign-up,
    then re-grant `organizer` (explicit, one person at a time).
21. **P9. Testers on production**, then **public launch** (spec section 8).
22. **C1. Later: delete the local copy** (section 7), and **backups only with explicit approval** (decision 8).

## 5. Backup and restore verification checklist

- [ ] `MAROON_BACKUP_DIR` is on an encrypted drive, outside every Git working copy and every synced folder (the scripts
      refuse Git and OneDrive / Dropbox / Google Drive / iCloud / Box folders; encryption is the owner's check)
- [ ] `database/<id>/manifest.json` says `success`; `database.dump` size and SHA-256 match
- [ ] `storage-manifest.json` says `success`; bucket list matches the inspection's section H; every file's SHA-256 matches
- [ ] `verify-backup.mjs` prints BACKUP VERIFIED; "Dumped from database version" major = 17 (the local stack's version)
- [ ] The dump contains `auth.users` data
- [ ] Inspection CSV taken in the same window; its numbers copied into a counts file outside Git
- [ ] Local restore finished in one transaction; restored counts equal the counts file (logins, profiles, player rounds,
      trips, shared rounds, player records, editions, archived scorecards)
- [ ] Every Storage file re-downloaded locally with a matching checksum
- [ ] Sanitize finished (state `sanitized`): 0 real emails / passwords / tokens / sessions / OAuth identities / push
      endpoints; webhook triggers disabled
- [ ] Rehearsal PASSED: Maroon history unchanged, 0 legacy logins, re-grants correct, no relinking, rolled back
- [ ] Earlier backups untouched (`..\MM-Website\out\backups` holds 2 older ones: move them to the encrypted folder; never
      delete without approval)
- [ ] **Rollback path known:** before sign-ups reopen, production can be restored from this dump (Supabase docs: restore
      into the project with `psql` / `pg_restore`); after V2 accounts exist, fix forward only

## 6. Corrections made to the existing drafts (2026-10-30)

| File | Change | Why |
|---|---|---|
| `account-reset-part1-shared-data-DRAFT.sql` | S2 deletes only `scoring_groups.source = 'personal'` and stops if any `'tournament'` group exists | `<> 'trip'` would also delete tournament cards, possibly Maroon records |
| `account-reset-part2-accounts-DRAFT.sql` | Allowed-loss list: `profile_friend_requests` (not `profile_friends`), plus `account_security_events`, `historical_link_requests` | The friends table name was wrong: Part 2 would have stopped mid-reset on any friend request |
| `admin-regrant-DRAFT.sql` | Input is `(email, 'owner' or 'organizer')`; organizer gets only The Maroon organizer membership, never downgrades an owner | Organizer powers (e.g. Cam) need their own explicit, narrower grant |
| `scripts/backup-database.ts` | Requires `MAROON_BACKUP_DIR` and the production project id | Backups must stay out of the repository and synced folders; never back up the wrong project |

Cascades and blockers (from the repository SQL; production confirmed `profiles.id`, `player_rounds.profile_id` and
`golf_trips.created_by` cascade): deleting a login cascades to its profile, and from there to player rounds, trips
(and everything under them), code tournaments, shared rounds, scoring-group players (hole scores, submitted cards,
corrections), MM coin, memberships, creator access, friend requests. **Blocking links** (no delete rule) that Part 1 must
clear first: `scoring_groups.created_by`, `scorecard_submissions.submitted_by`, `scorecard_submission_revisions.submitted_by`,
`scorecard_correction_requests.requested_by / decided_by`, `wagers_market_settlements.settled_by`. **Set-null links**
(row kept, link emptied): player records, tournament players, organizations, tournaments, live official state and audit,
career imports, historical tables, odds runs. **No Maroon history table cascades from an account.**

Storage ownership: `storage.objects.owner` has no foreign key, so files are never removed by SQL. After the reset, kept
`shot-videos` files may still name a removed owner id (harmless for a public bucket); `profile-photos` are removed in the
dashboard (P4).

## 7. Removing the local copy later (C1)

1. `node scripts/legacy-local/stack.mjs destroy --confirm maroon-legacy`: containers, data volumes and `out/legacy-local`.
2. `docker ps -a | findstr maroon-legacy` shows nothing; `docker volume ls | findstr maroon-legacy` shows nothing.
3. Delete any counts file and any copied file used for the restore that lives outside the backup folder.
4. Record the date in `project_specs.md`. Production is not involved. Backups stay until separately approved (decision 8).

## 8. Approval gates (nothing destructive without its own written go-ahead)

| Gate | What is approved | Reversible? |
|---|---|---|
| G1 | Backup location and running B2 (reads production) | n/a (read-only) |
| G2 | Starting the local stack and restoring REAL production data into it (L1, L2) | Yes: `destroy` |
| G3 | Sanitize (L4) | Yes: restore again |
| G4 | V2 enforcement spec, then its implementation on non-production | Yes |
| G5 | Cutover window, closing V1 registration (P1, P2) | Yes: reopen |
| G6 | Production Part 1 and Part 2 COMMIT with typed numbers (P4) | Only by restoring the backup, before P8 |
| G7 | Storage deletion in production (P4) | Only from the backup |
| G8 | V2 migrations and the auth hook (P6, P7), deploy and promote | Rollback deployment; SQL has undo notes |
| G9 | Each re-grant (owner, each organizer) | Yes |
| G10 | Opening testers, then public registration (P9) | Yes: hook mode |
| G11 | Deleting the local copy (C1); deleting any backup (separately, per backup) | Local copy: no; backup: no |

## 9. Risks and unresolved dependencies

1. **Phase 0 evidence missing from disk:** no CSVs in `out/phase0`. Numbers come from the owner's summary. Needed: the
   CSVs (session revocation, legacy, account-reset with sections C / E / F / G / H / X) and the `source` breakdown query.
2. **Free plan = no Supabase backups.** Our dump is the only recovery path; restoring into the hosted project has never
   been rehearsed. Consider a temporary Pro month around P3-P8 for daily backups (owner decision, cost).
3. **Supabase Auth version drift:** `auth.users` / `auth.identities` columns differ between Auth versions; the local
   restore stops (one transaction, nothing half-restored) if production has a column the local stack lacks. Fix: update
   the Supabase CLI so local Auth is at least production's version.
4. **Hook coverage gaps** (spec section 10): Supabase does not document whether the admin API path runs the hook, and
   OAuth sign-ups carry no age proof. Not secure until the bypass tests pass.
5. **V1 open until cutover:** the hook cannot be enabled on production before P7 without closing V1, so production-level
   enforcement exists only from cutover; all V2 testing happens on `maroon-auth-dev` / local. The earlier idea of a
   Preview on production Supabase is replaced by a Preview on `maroon-auth-dev` (owner to confirm).
6. **Pending profiles visible in search** without Stage D (`search_golfers`): needs a small non-Stage-D fix before testers.
7. **The 2 older backups** in `..\MM-Website\out\backups` hold personal data inside a repository folder: move them to the
   encrypted folder (do not delete; decision 8).
8. **`scoring_groups.source = 'tournament'`** in production: unknown until the read-only query runs; if any exist, the
   reset needs a design decision.
9. Local `start-app.mjs` makes Next.js add `out/next-legacy/types` to `tsconfig.json` (a tracked file) the first time it
   runs; revert or commit that line deliberately.
10. ~~Display names / usernames in the local copy~~: **decided 2026-10-30 (G4 approval):** private account names,
    usernames, bios, trip member names and customer-tournament player names are anonymized; public Maroon archive names
    and (local-only) photos are kept. Also decided: V2 testing on `maroon-auth-dev` (risk 5), new Apple / Google
    registrations disabled for the beta (spec option A without OAuth sign-up), no Supabase Pro for now (revisit before
    cutover, risk 2).

## 10. Local environment setup (when G2 is approved; not done yet)

1. Docker Desktop running. In the repository folder: `node scripts/legacy-local/stack.mjs` (check: ports 57320-57324 free).
2. `node scripts/legacy-local/stack.mjs start --confirm maroon-legacy` -> empty stack; Studio at http://127.0.0.1:57323.
3. Counts file: copy `scripts/legacy-local/expected-counts.example.json` OUTSIDE Git, fix numbers from the CSV.
4. `node scripts/legacy-local/restore-local.mjs <backup folder> --confirm maroon-legacy --expected <counts file>`.
5. In the same terminal: `$env:LEGACY_TEST_PASSWORD = "<12+ characters>"`, then
   `node scripts/legacy-local/sanitize.mjs --confirm maroon-legacy`; close the terminal afterwards.
6. `node scripts/legacy-local/rehearse-reset.mjs --confirm maroon-legacy` -> REHEARSAL PASSED.
7. `node scripts/legacy-local/start-app.mjs --confirm maroon-legacy` -> http://127.0.0.1:3998.
8. Unit tests any time: `node --test scripts/legacy-local/guard.test.mjs scripts/legacy-local/restore-list.test.mjs`.

## Test evidence (throwaway local databases only, 2026-10-30)

- Guard and restore-list unit tests: 9 / 9 pass. ESLint clean; TypeScript `tsc --noEmit` clean; `databaseBackup` tests pass.
- Refusals: backup into OneDrive, backup of `maroon-auth-dev`, and start / sanitize / rehearse without `--confirm` all refused.
- Real local dump (local test data, not production) restored with the exact filter and flags into a throwaway database:
  83 tables, 157 functions, 121 policies, 30 logins and 30 identities equal to the source; 29 sessions NOT copied. First
  run found that `--disable-triggers` does not apply to mixed restores; fixed by restoring login rows first.
- Sanitize on that copy: refused without a password; one run (after fixing a missing-table check found by the test)
  left 0 real emails / sessions / OAuth identities / phones / metadata / typed-in emails; test password valid for all 30;
  a webhook-style trigger was disabled; a second run was safe; the failed run had changed nothing.
- Rehearsal on that copy: PASSED (52 history tables unchanged, owner and organizer re-grants correct, no relinking),
  rolled back (logins / profiles / trips unchanged). First run caught `player_slots.password_created` (derived from the
  claim) and it was classified as claim bookkeeping. Deliberately deleting one history row made it FAIL as intended.
- Not tested: production, the real `maroon-legacy` stack (not started), Storage upload against a real local Storage
  service, the hosted Storage list API, and any hook.
