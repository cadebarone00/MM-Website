# V2 legacy account reset: audit and plan for approval (2026-10-30, revised)

**Status: DRAFT. Nothing has been run, deleted or changed in production.** No production connection was made, and no
production deployment or authentication setting was touched. All scripts are dry runs: they end with `rollback`, which
undoes everything. They are **not** to be run against production until this plan is approved, and even then only in the
order in section 7.

The project rule is that Claude never runs SQL on a hosted project, and production keys stay out of this workspace.
Production numbers therefore come from the read-only inspection the owner runs (step R0). Everything else here comes from
the repository's SQL, which was loaded into throwaway in-memory databases and tested.

**Decision being implemented:** every existing (legacy) login is removed. Nobody is migrated. Everyone signs up fresh
through V2 onboarding and gets a new permanent profile id. A universal **historical data import** for any organizer is a
separate future product feature. It is not part of this rollout.

## Files

| File | What it is |
|---|---|
| `docs/database-inspection-account-reset.sql` | Read-only check (counts and structure only, no personal data). Reviewed for side effects: none (§8) |
| `docs/account-reset-part1-shared-data-DRAFT.sql` | **Part 1: shared golf records**, in six groups (S1–S6). Each group is approved `delete` or `keep` with its own count. Never touches an account |
| `docs/account-reset-part2-accounts-DRAFT.sql` | **Part 2: accounts only.** Refuses if removing accounts would delete any shared record |
| `docs/admin-regrant-DRAFT.sql` | Gives the owner's new V2 profile every admin power back, in one checked step. Run once per new admin |
| `docs/account-reset-inventory-2026-10-30.md` | The production inventory, filled from the inspection CSV, ending with the final scope to approve |

Part 1 now has a seventh group, **S7**: it empties the typed-in emails on kept Maroon records (D7). Part 2 refuses to
clear the Supabase sign-in log while D6 is on hold. All scripts give up after 5 s instead of waiting behind a busy table.

---

## 1. Numbers (filled in from the R0 inspection)

Every figure below is _pending R0_. The inspection section that supplies it is in brackets.

**Accounts (Part 2)**
- Logins, and how many signed in during the last 7 / 30 days (A)
- Sign-in methods in use: email / Google / Apple (A)
- Profiles, orphan profiles, half-finished sign-ups (B)
- Admins: `is_host`, platform admin, Maroon owners (D)
- Sessions, sign-in log entries, half-finished Google / Apple sign-ins (A)

**Shared data (Part 1)**
- S1 trips, override history, push subscriptions (S)
- S2 personal scoring groups, player rounds (S)
- S3 shared rounds (S)
- S4 code tournaments (S)
- S5 customer tournaments, their editions, players and organizations (S)
- S6 MM coin bets, accounts and settlements (S)

**Other**
- Profile photos and tournament PDFs (H)
- Which safety SQL is installed (C)

**Exact effects:** section E lists, per group, every table linked to it and how many rows each would lose. Every group
empties its top table, so those numbers are exact (S5 keeps The Maroon, so its numbers are an upper bound). The rehearsal
on a restored copy (R4) prints the exact before/after count of every table for each part.

Repository evidence, to be confirmed by section C: as of 2026-10-17, `profile_initialization.sql` and
`account_deletion.sql` were not in production, and V2 onboarding is not public. So every production account is legacy.

## 2. Two separate parts, approved separately

**Part 1: shared golf records (decisions D2–D4).** Six groups, each `delete` or `keep`:
- **S1 trips:** every trip and everything under it (members, invitations, rounds, scores, submitted cards and their
  history, corrections, flights, plans, games, chat, push subscriptions), plus the score-override history.
- **S2 personal scoring:** scoring groups not tied to a trip, and player rounds.
- **S3 shared rounds.**
- **S4 code tournaments.**
- **S5 customer tournaments:** platform tournaments that are not The Maroon, and organizations left with no
  tournament.
- **S6 MM coin:** bets, wager accounts and market settlements.

Part 1 checks at the end that no login or profile changed.

**Part 2: accounts.** Removes:
- logins, together with Supabase's identities, sessions, refresh tokens, MFA and one-time codes
- profiles
- records that exist only for an account: friends, creator access and requests, tournament memberships, claim
  invitations, sign-up code attempts, tombstone ledger, V2 activation records
- half-finished Google / Apple sign-ins
- optionally, Supabase's sign-in log (D6)

It releases legacy player claims. It refuses with the table's name if a kept shared record would block the deletion or
be deleted with the accounts. So **an account deletion can never silently remove a trip, scorecard or tournament.**

If Part 1 keeps a group that depends on accounts (for example S1 trips, whose organizer is an account), Part 2 will
refuse. With today's database design, those records can't exist without their owner. Keeping one means a separate design
change, not this reset.

**Kept and unlinked (never deleted by either part):**
- The Maroon public archive and live system (player records, career archive, live scoring, handicap rounds, The Maroon
  tournament and its editions, broadcast, season calendar)
- course library
- site and platform settings
- legal document versions
- Highlights configuration history (D5)

## 3. Administrative control: recovery and re-grant

**Permanent control lives outside the app.** Whoever owns the Supabase project (dashboard and SQL editor) and the Vercel
project can always restore app admin rights. The reset never touches those accounts. Supabase dashboard logins are
separate from the app's logins in `auth.users`, so deleting app accounts can't lock anyone out of the dashboard. No app
code hard-codes an admin id or email (checked): admin rights live only in the database flags the re-grant sets.

Before R2, the owner confirms and writes down (no secrets in the plan):
1. **Supabase:** two owners of the organization (two people, or two separate logins you control), both with two-factor
   sign-in and recovery codes stored offline. The SQL editor opens on production.
2. **Vercel:** two owners of the team, with two-factor sign-in. You can open Project → Settings and Deployments →
   Promote.
3. **GitHub** (the repository) and the **domain registrar** (`themaroon.site`): the same two-owner, two-factor check.
4. **Apple and Google developer accounts** (Sign in with Apple / Google settings): an owner can sign in.
5. **The Maroon:** the dedicated admin email for the new V2 account exists and you control its inbox.

**What the app loses at the reset:**
- Maroon Admin Center (`is_host`)
- platform admin (`platform_role = 'admin'`: tournament-access approvals, Highlights admin, birthday review)
- tournament-creator access
- The Maroon Tournament owner membership

All of these belong to legacy accounts.

**Re-grant (`docs/admin-regrant-DRAFT.sql`, step R8):**
1. The owner signs up through V2 with a dedicated admin email and finishes onboarding.
2. The owner types that email into the script and runs it as a dry run, then for real.
3. The script picks exactly one login with that email, confirmed and Active (not a tombstone). It stops on 0 or 2+
   matches. It grants all four powers, never prints the email, and is safe to repeat.
4. Rehearse it on the restored copy (R4) before production.

**If it goes wrong:**
- **V2 sign-up broken after Part 2:** sign-ups stay closed and nothing is lost. Either fix forward, or restore from the
  backup (§6) before R9.
- **Admin lost after launch:** run the re-grant again from the SQL editor.
- **Supabase dashboard access lost:** recover through the second organization owner, or Supabase support.

## 4. Coverage checklist

| Item | How it's handled | Proven by |
|---|---|---|
| Auth identities (email / Google / Apple) | Removed with each login (Supabase cascade) | Tests: 0 left; inspection E |
| Sessions, refresh tokens, MFA, one-time codes | Removed with each login | Tests: 0 left; inspection E |
| Half-finished Google / Apple sign-ins (`auth.flow_state`) | No foreign key, so Part 2 clears them | Found by the leftover-id scan in testing; now cleared |
| Supabase sign-in log (`auth.audit_log_entries`, emails and IPs) | Optional clear (D6) | Tests |
| Foreign keys | Inspection E per group; Part 2 refuses on any blocker or shared cascade | Tests: refused and named the table, changed nothing |
| Columns holding ids with no foreign key | Inspection F (public and auth); both parts scan every uuid column for a removed id | Tests: leftover id stopped the run |
| Triggers | Inspection G lists every trigger on touched tables. Score-override and submitted-card history locks are handled. Profile and player-claim guards are handled with their own flags | Tests in both designs |
| Database webhooks | Inspection G flags any trigger that sends a web request. If one exists, decide whether to switch it off first | Tests: flagged |
| Storage files | SQL can't delete them. Inspection H counts them; R7 empties `profile-photos` and `tournament-docs` in the dashboard; `shot-videos` is kept (The Maroon) | Inspection H after R7 |

**External personal data, outside the database (not touched by the scripts):**

| Where | What | Plan |
|---|---|---|
| Email provider (Resend) | Logs of emails sent to old addresses | Delete per its retention settings (D8) |
| Browser push services | Old push endpoints | They stop working once the subscriptions are deleted (S1) |
| MM-Scorekeeper backend and Google Sheet | Maroon scoring by player name | Not account-based; unchanged |
| Earlier backups | **2 production backup folders in `../MM-Website/out/backups`** hold personal data | Keep encrypted or delete (D8) |
| Vercel and Supabase logs | Request logs | Expire on the provider's schedule |
| Apple and Google | Still remember people approved the app | Harmless; people sign in again and get a new account |
| Phones and browsers | Cached old sign-in | Refused at next use; the app sends people to sign in |
| Static player pages (`lib/data/players`) and R2 videos | The Maroon public archive | Unchanged |

## 5. Is the tombstone deletion design right for this? No. Keep it for later.

`account_deletion.sql` is for one person leaving while everyone else stays: it keeps their profile row forever as an
anonymous tombstone, hands trips over, locks their legacy player record and keeps a permanent block-list. For a full
reset it would leave one tombstone per account, the opposite of zero accounts. Parts 1 and 2 are the one-time purge. They
work whether or not the tombstone design is installed (tested both ways). The tombstone design then handles individual
deletions after V2 launches.

## 6. Backup and rollback

**Backup, in the same window, immediately before Part 1:**
1. Supabase → Database → Backups: write down the newest restore point.
2. `npm run backup:database`: full `pg_dump` including logins. Record the checksum. It holds personal data, so keep it
   encrypted, out of synced folders and out of Git (D8).
3. `npm run backup:production`: the REST data export.
4. Storage: download `profile-photos` and `tournament-docs`.
5. Restore the dump into an isolated project (`docs/restore-drill.md`).

**Rollback:**
- **Before COMMIT:** automatic. A failed check or a dry run undoes everything.
- **After COMMIT, before sign-ups reopen (R9):** restore from the step-2 dump and the downloaded files, using the
  rehearsed path. This is lossless because sign-ups are closed and no account exists to write anything.
- **After R9:** fix forward; a restore would erase new V2 accounts.

## 7. Runbook (each step needs the previous one to pass and its own go-ahead)

| Step | Who | What |
|---|---|---|
| R0 | Owner | Run the inspection in the production SQL editor and send the CSV |
| R1 | Claude, then owner | Claude re-reviews Parts 1 and 2 against the real schema and fills in §1. The owner approves D1–D8 and the S1–S6 scope |
| R2 | Owner (separate approval: production settings) | Pick a window with no live event. Confirm admin control (§3). Switch off sign-ups. V2 code deployed |
| R3 | Owner | Backups 1–4 (§6) |
| R4 | Owner | On the restored copy: inspection → Part 1 (dry run, then real) → Part 2 (dry run, then real) → re-grant. Numbers must match R0 |
| R5 | Owner | Production: Part 1, dry run then COMMIT, saving the audit output |
| R6 | Owner | Production: Part 2, dry run then COMMIT, saving the audit output |
| R7 | Owner | Storage dashboard: empty `profile-photos` and `tournament-docs` |
| R8 | Owner | Sign up through V2, then run the re-grant (dry run, then COMMIT) |
| R9 | Owner (separate approval) | Run the inspection again (0 logins left besides the admin, no leftovers). Wait out the JWT expiry. Confirm custom SMTP. Reopen sign-ups |
| R10 | Claude | Record the run (counts only) in `project_specs.md` and the changelog |

## 8. Inspection script: side-effect review

**Result: no side effects.**
- It reads only. It starts by telling the database to refuse writes (tested: a write is refused).
- It calls no app function, and fires no trigger (triggers only run on writes).
- It takes only the lightest read lock, which never blocks the app.
- It prints no names, emails, ids or tokens.

**Fixed in this revision:**
- Added time limits: 5 s waiting for a lock, 2 minutes overall. It won't stall behind a running migration.
- Added a row showing the role it ran as and whether that role sees every row. Counts can't silently come out low.
- The account-link map now starts at profiles as well as logins. Before, it missed profile links when the tombstone
  design was installed.
- Added per-group counts (section S) and per-group link maps (E).
- It now finds unlinked id columns in Supabase's auth tables, flags database webhooks, and no longer breaks if
  Supabase retires a Storage column.

## 9. Decisions (owner, 2026-10-30): planning only, not authorization to delete

| # | Owner decision | How the drafts reflect it |
|---|---|---|
| D1 | Conditional: reset before the account-safety migrations, subject to production schema verification | Order in §13; re-verified at R1 from inspection C |
| D2 | Conditional: delete legacy trips, scorecards, rounds, code tournaments | Part 1 S1–S4, each still needs its count and its `delete` |
| D3 | Conditional: remove customer tournaments, keep The Maroon | Part 1 S5 |
| D4 | Conditional: remove MM coin, bets and payouts, subject to retention | Part 1 S6; backup kept per D8 before it runs |
| D5 | Approved: keep Highlights history; review the retained old ids | Exempt from the leftover scan; inspection F shows the count for review |
| D6 | **Hold**: keep the Supabase sign-in log | Part 2 refuses `yes` |
| D7 | Conditional: remove typed-in legacy player emails | New Part 1 group S7 (emails emptied, rows kept) |
| D8 | Provisional: 30-day encrypted backup retention | §6; includes the 2 older backups in `../MM-Website/out/backups` |

## 11. What the owner runs, where, and when

| When | File | Where | Effect |
|---|---|---|---|
| **Now (R0)** | `docs/database-inspection-account-reset.sql` | Production → SQL Editor | **Read-only.** Counts and structure; export the CSV |
| After approval, R4 | all of the files below, in order | A **restored copy** (new, separate Supabase project), never production | Rehearsal |
| After rehearsal and a written go-ahead, R5 / R6 / R8 | Part 1, Part 2, re-grant | Production | The real run, dry run first |
| Never by hand | `supabase/*.sql` migrations | n/a | Separate migration approval (§13) |

Nothing except the inspection is to be run on production until R5. The other three scripts can't do anything as written:
every one stops at step 0 until approved numbers are typed in, and each ends with `rollback`.

## 12. Dry runs and the outside world

A dry run deletes inside a transaction and then undoes it. Checked against what could escape before the undo:

| Possible outside effect | During a dry run (ROLLBACK) | Evidence |
|---|---|---|
| Database webhooks (pg_net / Supabase webhooks) | **Nothing sent.** pg_net queues requests as rows, and they are sent only after COMMIT | Test: dry run left the queue empty; a committed run queued one |
| Realtime messages to the app | **None.** Realtime only reads committed changes | Postgres logical replication |
| `NOTIFY` messages | **None.** Delivered only on COMMIT | Postgres behavior |
| Supabase Auth emails or hooks | **None.** SQL deletes don't go through the Auth server | Auth hooks run in the Auth server, not on SQL |
| Storage files | **None.** The scripts never touch Storage | Scripts |
| Immediate internet calls (`http` / `dblink` extensions) | **Would escape.** Inspection X and G flag them; if any exist, stop | Test: flagged |
| Locks | Part 2 briefly locks logins (sign-ins wait) | `lock_timeout` 5 s; run only in the reset window |
| Numbering gaps | Harmless | n/a |

For a **committed** run (rehearsal or real), webhooks and scheduled jobs **do** fire. On the restored copy, its webhooks
would call production addresses. So, before R4 and R5: switch off database webhooks and pause scheduled jobs (inspection
X / G list them), and turn them back on afterwards.

## 13. Sequence with the Vercel Preview and V2 rollout

Current state, from the `v2-tester-preview` and `deploy-gate` branches (read only):
- Production still serves the 2026-10-08 deployment. Every build since failed on the Hobby cron limit, and
  `v2-tester-preview` fixes that.
- `themaroon.site` changes only when someone presses **Promote** (`autoAssignCustomDomains: false`).
- The deploy gate (not merged) blocks production builds until `profile_initialization.sql` and `account_deletion.sql`
  are installed.

1. **Preview isolation, before testers use it:** check in Vercel → Project → Settings → Environment Variables that the
   **Preview** `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` point at a non-production project (maroon-auth-dev or
   staging), not production. If the Preview uses production, testers create production accounts, Part 2's count check
   fails, and V2 code meets a database without its tables.
2. Testers use the Preview against non-production only. Meanwhile run R0 on production.
3. Rehearsal on a restored copy (R4), including **the V2 migrations and a V2 sign-up + re-grant on that copy**.
4. **Reset window** (one session; sign-ups off from the start):
   1. backups
   2. Part 1, then Part 2
   3. Storage cleanup
   4. V2 migrations, separately approved (`profile_initialization.sql` → `account_deletion.sql` →
      `account_activation.sql`)
   5. build `main` with V2 (`MAROON_V2_ONBOARDING=on`); the deploy gate passes now
   6. Promote
   7. owner V2 sign-up and re-grant
   8. inspection again
   9. reopen sign-ups
5. **Until step 4.6 (Promote) the old site stays live with zero accounts**, which is why sign-ups stay off until V2 is
   promoted.

Every production setting change (sign-ups off and on, webhooks, Promote, environment variables) is its own approval. None
is made by this plan.

## 10. Done means

- 0 legacy logins, profiles, identities and sessions.
- No uuid column in `public` or `auth` holds a removed id (only D5's audit columns are exempt).
- Shared records removed exactly as approved per group, and nothing else.
- The Maroon archive, course library and settings have the same row counts as before.
- Storage user files are removed.
- The owner's new profile holds all four admin powers.
- A new person completes V2 sign-up.
- Backups are verified and rehearsed, and the audit outputs are saved.

## Test evidence (throwaway in-memory databases only; script in the session scratchpad)

Both database designs (with and without `account_deletion.sql`) passed every check below.

**Inspection**
- returns complete, gap-free rows
- reports which role it ran as
- shows profile links in both designs
- finds the unlinked `auth.flow_state` column
- flags a database webhook

**Part 1**
- refuses with blank decisions or counts, and with wrong counts
- a dry run changes nothing
- approving only S1 removed trips and nothing else
- never touched an account
- re-locked the override history

**Part 2**
- refuses when blank
- while shared records remained, refused and named the blocking table, changing nothing
- after Part 1, left 0 logins, profiles, identities, sessions, refresh tokens, flow states, sign-in log entries and
  memberships
- kept all legacy player records (claims released) and The Maroon's editions
- left files for R7
- a repeat run refuses

**Re-grant**
- refuses when blank, for an unknown email, for an unconfirmed email, and when 2 logins match
- a dry run changes nothing
- the real run gives exactly one admin all four powers
- a repeat adds nothing

**Error path**
- a leftover id in an unlinked column stopped Part 2 with nothing changed

**Added 2026-10-30 (second revision), passed in both designs**
- A Part 1 dry run left the simulated webhook queue empty; a committed run queued one.
- The inspection flags an immediate `http` call in a trigger.
- S7 empties typed-in emails and keeps the rows; it is untouched when set to `keep`.
- Part 2 refuses D6 `yes`; with `no`, the sign-in log is kept.

**Not tested:** production itself (needs R0), Supabase's real auth tables beyond the columns modelled, and the dashboard
steps (sign-ups, Storage).
