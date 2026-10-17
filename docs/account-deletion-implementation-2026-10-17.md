# Step 3c — Account deletion: database implementation & tests (2026-10-17, local only)

Built and tested on the isolated local Supabase only. No UI, no route, no deploy, no production SQL, no commit.
Design: `docs/account-deletion-design-2026-10-17.md`. Hard delete chosen: `docs/auth-deletion-test-2026-10-17.md`.

## Files
| New | Purpose |
|---|---|
| `supabase/account_deletion.sql` | The whole Step 3 database layer (one file; no existing SQL file edited) |
| `lib/account/accountDeletion.ts` | Server workflow: request (own account, recent sign-in), resumable steps, retry sweeper |
| `lib/account/reauth.ts` + `reauth.test.ts` | "Signed in within 10 minutes?" from the token's `amr` claim |
| `lib/account/accountDeletionDatabase.test.ts` | 9 database tests (PGlite) |
| `scripts/auth-local/deletion-regression.mts` | 39 end-to-end checks on the isolated stack (real Auth, REST, Storage) |
| `scripts/auth-local/deletion-probe.mts` | Step 3b hard vs soft delete probe (kept for re-runs) |

| Changed | Why |
|---|---|
| `lib/profile/currentProfile.ts` | A closed account reads as signed out (its own profile is hidden by the new policy) |
| `scripts/auth-local/setup.mjs` | Loads `profile_photos.sql` + `account_deletion.sql` (V2 chain) |

## Database changes (`supabase/account_deletion.sql`)
**New tables** (RLS on, closed to browser roles):
- `account_deletions`: the ledger. Account UUID, state, timestamps, attempt count, error code. **No personal data.**
- `account_deletion_events`: step, outcome, row **counts**, error codes. 90-day purge.
- `golf_trip_organizer_handoffs`: an organizer's offer, and the member's explicit acceptance.

**New columns** (additive, default values; no existing row rewritten):
- `profiles.deleted_at`
- `golf_trips.ownership_state` (`owned` / `archived` / `restricted`) + `ownership_changed_at`

**Constraints modified:**
- `profiles.id → auth.users ON DELETE CASCADE`: **dropped**. It's replaced by an insert check: a profile still needs
  an existing login and can't be made for a deleted id. Auth's hard delete no longer touches any app table.
- `golf_trips.created_by`, `shared_rounds.host`: `CASCADE` → **`RESTRICT`** (same constraint names).
- **Trigger `guard_profile_rows`:** refuses `DELETE` on profiles, refuses `INSERT` without a login or for a deleted id,
  and refuses `UPDATE` of a closed account outside the deletion function.

**Policies added:** `active_account_only`, a **RESTRICTIVE** policy for role `authenticated` on **every RLS table in
`public` plus `storage.objects`**. It's ANDed with the existing policies, so it never grants anything; it only removes
access for an account in the ledger. `apply_active_account_policies()` re-applies it after new tables are added.

**Role setting:** `authenticator.pgrst.db_pre_request = public.reject_deleted_accounts`. Every REST and RPC request
with a closed account's token is refused before it runs.

**Functions** (all `security definer`, pinned `search_path`; service role only, except the two request-time checks):
- deletion steps: `request_account_deletion`, `execute_account_deletion`, `record_account_deletion_step`,
  `list_account_storage_objects`;
- status and recovery: `account_deletion_state`, `pending_account_deletions`, `reapply_account_deletions`,
  `purge_account_deletion_events`;
- trip hand-off: `offer_golf_trip_organizer`, `accept_golf_trip_organizer`;
- policy upkeep: `apply_active_account_policies`;
- request-time checks: `account_is_active`, `reject_deleted_accounts` (callable by `anon` / `authenticated`;
  no arguments, they only answer for the current token).

## Exact order of operations
1. **Request** (`requestAccountDeletion`):
   - the account comes from the verified session (cookie or bearer); nothing in the body is read;
   - the token's last sign-in must be within 10 minutes, otherwise `reauth-required`;
   - `request_account_deletion(account)` inserts the ledger row (idempotent) and marks `profiles.deleted_at`. **From
     this moment the account is blocked everywhere** (below);
   - every session is signed out (refresh tokens die).
2. **Database** (`execute_account_deletion`, one transaction, row-locked, a no-op if already done):
   1. Trips they organize:
      - an **accepted** hand-off → that member becomes organizer;
      - otherwise an ended trip → `archived`;
      - otherwise → `restricted` (no organizer).

      Their member row is demoted. Nobody becomes organizer without accepting.
   2. Shared rounds they host → `ended` (scores stay); their tournament roles removed (tournaments stay).
   3. Personal rows deleted: flights, personal plans, push subscriptions, access requests, creator access, pending
      player-claim invitations, pending link requests, **personal** rounds, **open** coin bets, coin balance.
   4. Shared rows de-identified: their trip-member and tournament-player rows become "Former member" / "Former
      player" (email and phone removed); legacy `player_slots` claim released; historical links removed.
   5. Profile → **tombstone**: email `''`; username, display name, bio, avatar, player link and platform role NULL;
      `is_host` false; private; `deleted_at` set.
   6. Ledger → `database_done`; event with row counts.
3. **Storage:** every object owned by the account, or under `profile-photos/<id>/`, is removed through the Storage
   API, the list is re-checked to be empty, then → `storage_done`.
4. **Auth:** **hard** `deleteUser` (identities, sessions and tokens go with it). "User not found" counts as done, so
   an interruption right after the delete is safe. → `auth_done`.
5. **Completed:** → `completed`.

The ledger row stays (UUID + time only) so a restored backup can be re-deleted (`reapply_account_deletions`).

Any failure leaves the account **closed** at its current step. `processAccountDeletion` / `resumeAccountDeletions`
continue from there.

## How existing JWTs are blocked (from the request, not when they expire)
| Surface | Mechanism | Tested |
|---|---|---|
| REST tables | Restrictive `active_account_only` policy + pre-request hook | old token → "This account has been deleted." |
| REST RPC (incl. `security definer` functions granted to browsers) | `pgrst.db_pre_request` | refused |
| Storage read / write | Restrictive policy on `storage.objects` | both refused |
| Refresh token | Global sign-out at request; then Auth hard delete | refused |
| App routes (cookie or bearer) | `auth.getUser()` + `getCurrentProfile` closed-account check + database guards | 401 / refused |
| Signing in again before the login is gone | New tokens are blocked by the same ledger checks | can't reach anything |
| Realtime `postgres_changes` | Uses table RLS, so the restrictive policy applies | not directly tested |

## Tests
| Suite | Result |
|---|---|
| `lib/account/accountDeletionDatabase.test.ts` (PGlite) | **9 / 9** |
| `lib/account/reauth.test.ts` | **2 / 2** |
| `scripts/auth-local/deletion-regression.mts` (isolated Supabase, 185 requests, all 127.0.0.1) | **39 / 39** |
| `scripts/auth-local/regression.mts` (Step 2, re-run with Step 3 installed) | **55 / 55** |
| Full `npm test` | **1,392 / 1,392** |
| `tsc`, eslint | clean |

**Failure injection covered:**
- an error mid-database-step (full rollback, then retry);
- the storage step failing (attempt recorded, files kept, resumed);
- the auth step failing (finished by the sweeper);
- interruption **after** Auth deleted the login but before recording it (retry completes);
- two runs at the same time;
- a restored backup bringing data back (re-queued and re-scrubbed).

One test-setup mistake during development (a "no session" test that still carried another user's cookie) correctly
deleted only that signed-in user. It was fixed and is now a dedicated cookie-session test.

## Remaining legal / privacy decisions (D7, before App Store launch)
- The **lawful basis** for keeping de-identified shared records (scores, scorecards, trip memberships, settled coin
  bets) linked to the tombstone UUID. Trip-mates can still infer who "Former member" was.
- **Settled MM Coins bets** are kept de-identified; open bets and the balance are removed. Confirm the retention basis.
- **Restricted trips** stay with no organizer. Who may later assign one, and how long they're kept?
- **Archived trips** retention period.
- **Ledger** retention (restoration prevention, tied to the backup retention window) and the 90-day event log.
- V1 public archive names (`player_slug` history, static player files) aren't touched by account deletion; that needs
  a separate removal-request process.
- Deletion disclosure wording, in-app confirmation copy, and Apple review of the in-app path.

## Production migration and rollback risks
- **Order:** backup → `profile_initialization.sql` (Step 2) → `account_deletion.sql` → deploy code. The code expects
  both.
- **`pgrst.db_pre_request` is a role-level setting:** if `reject_deleted_accounts` ever errors, **every** REST request
  fails. It's written defensively and tested locally. After running it in production, smoke-test REST immediately;
  the rollback is `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`.
- **Restrictive policies** land on every RLS table, including the live Maroon tables. They change nothing for active
  accounts. Hosted performance needs a check (`account_is_active()` is per statement, via `(select …)`).
- **Dropping `profiles_id_fkey`:** profiles no longer disappear when an Auth user is deleted **in the dashboard**. That
  user's profile stays as a non-tombstoned orphan until a reconciliation runs (designed, not built). Don't delete users
  from the dashboard; use the workflow.
- **`RESTRICT` on trip creators / round hosts:** any existing process that relied on the cascade now fails. None was
  found in the code.
- **Rollback after a real deletion** can't re-add the auth foreign key (tombstones have no login) — by design.
- **Shared tables touched** (coordinate with Cam):
  - `golf_trips` (new columns, `created_by` rule);
  - `shared_rounds` (`host` rule; `status` set to `ended` on host deletion);
  - `golf_trip_members` (role change on hand-off, name scrub);
  - `profiles`, `player_slots`, `tournament_players`, `tournament_members`.

  No `cam/*` branch changes `supabase/`. Nothing is edited in place: everything is additive or done by constraint
  swaps in the new file.
- **Not built yet:**
  - the deletion route and settings UI;
  - the hand-off UI;
  - the sweeper cron route;
  - the dashboard-deletion reconciliation;
  - Sign in with Apple token revocation;
  - "Former member" labels in read models (names are already scrubbed at the source rows).
