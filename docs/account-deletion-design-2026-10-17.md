# Step 3 — Account deletion & data ownership (design audit, 2026-10-17)

**Read-only design.** No code, SQL, configuration or production data was changed. Evidence used:
- the repository SQL, loaded into a throwaway in-memory database to compute the real foreign-key graph (159 links);
- the 2026-10-16 production inspection (42 live links to accounts / profiles);
- read-only Vercel project and deployment metadata;
- `LEGAL_COMPLIANCE_SPEC.md`, `DATA_INVENTORY.md` and `BACKUP_RECOVERY_SPEC.md`.

Legal applicability (CCPA/CPRA, GDPR, other regimes), retention durations and response deadlines are **counsel decisions**
(`LEGAL_COMPLIANCE_SPEC.md` §Account deletion). This design makes them configurable; it does not decide them.

---

## 1. What happens today if an account is deleted

Deleting an `auth.users` row (e.g. from the Supabase dashboard) cascades to `profiles`, then:

**Cascade-deleted (28 tables).** These include **other people's data:**
- `golf_trips.created_by` CASCADE **(live)**: deleting a trip's creator deletes the **whole trip**. That takes every member,
  round, scoring group, hole score, submission, correction, flight and plan with it (14 tables).
- `shared_rounds.host` CASCADE **(live)**: deleting the host deletes **every player's** shared round and scores.
- `scoring_group_players.profile_id` CASCADE **(live)**: removes the golfer from their group and, through
  `hole_score_entries.entered_by`, **the attest scores they entered on other golfers' cards**.
- `player_rounds.profile_id` CASCADE **(live)**: trip and tournament rounds here are the **official results** others
  compete against (`golf_trip_scoring_corrections.sql`); they disappear.
- `mm_coin_bets`, `wagers_accounts` CASCADE **(live)**: settled markets lose a participant's bets.

**Blocked: deletion fails** while any of these point at the profile (all **live**, `NO ACTION`):
`scorecard_submissions.submitted_by`, `scorecard_submission_revisions.submitted_by`,
`scorecard_correction_requests.requested_by / decided_by`, `scoring_groups.created_by`, `wagers_market_settlements.settled_by`.

Anyone who has submitted a card can't be deleted. Anyone who hasn't takes shared data with them.

**Set to NULL (28 links).** History survives without a link: `player_slots.claimed_by` (the V1 claim is released),
`historical_participants.profile_id`, `tournament_players.profile_id`, audit actors, importers, `tournaments.created_by`, etc.

**Supabase-managed (live):** `sessions`, `identities`, `one_time_tokens`, `mfa_*`, `oauth_*`, `webauthn_*` cascade from
`auth.users`. Supabase handles login data.

**Not linked by a foreign key at all:**
- V1 Maroon live scoring and archives, keyed by `player_slug` (`live_*`, `career_archive_*`, `handicap_rounds`).
- Static player files (`lib/data/players/*.ts`) and Git history.
- Storage objects (`profile-photos/<profile id>/…`; R2 shot videos by player slug).
- Browser `localStorage`; Supabase email/Auth logs; backups.

## 2. Data categories and recommended behavior

| Category | Tables / places | Owner | On account deletion |
|---|---|---|---|
| **A. Login & identity** | `auth.users`, identities, sessions, MFA, tokens | the person | **Delete** (Supabase). Revoke all sessions first. Sign in with Apple: revoke the token through Apple's REST API (future) |
| **B. Profile personal fields** | `profiles.email`, `username`, `display_name`, `bio`, `avatar_path`, `rounds_visibility`, `player_slug` | the person | **Scrub** to a tombstone (§3). The UUID row stays only as an anonymous anchor for shared records |
| **C. Personal data only they use** | personal / history `player_rounds`, `golf_trip_flights`, `golf_trip_personal_plans`, `trip_push_subscriptions` (+deliveries), `tournament_access_requests`, `tournament_creator_access`, `player_claim_invitations`, `mm_coin_bets` / `wagers_accounts` (see decision D5), profile photo objects | the person | **Delete** |
| **D. Shared competition data** | trip / tournament `player_rounds`, `scoring_group_players`, `hole_score_entries` (their card and attest entries on others' cards), `scorecard_submissions` / revisions / corrections, shared-round holes, `golf_trip_members`, `tournament_players`, `edition_roster`, results and leaderboards | the group / competition | **Keep, de-identified.** Linked to the tombstone and shown as "Former member". Organizer-typed names / emails on member rows are scrubbed |
| **E. Containers they run** | `golf_trips` (organizer), `shared_rounds` (host), `tournaments` / `organizations` / `tournament_members` (owner roles) | shared | **Transfer first** (§4). Delete only if nobody else is in it |
| **F. Platform-managed history** | V1 `player_slots`, `live_*`, `career_*`, `historical_*`, static player files | The Maroon (platform) | **Not deleted by account deletion.** The link is removed (`claimed_by`, `historical_participants.profile_id` → NULL). Removing or redacting a real name from the public archive is a separate admin request with counsel's sign-off, covering DB rows, generated/static files, rebuilds and caches; Git history stays |
| **G. Audit / operational** | `live_score_audit_events`, import actors, deletion audit (new) | platform | Keep; actor link already SET NULL or points at the tombstone. Deletion audit holds **no** personal data (§7) |

## 3. Core decision: tombstone the profile, never hard-delete it

Keeping the profile row (UUID only, all personal fields scrubbed) means:
- **no foreign key ever fires**, so nothing cascades into shared data and nothing blocks;
- two deleted golfers in the same trip stay two distinct "Former member" rows (unique keys such as
  `scoring_group_players (group_id, profile_id)` keep working).

The login itself still has to go. Two options; Step 3's first local test decides between them:

| | Option A (recommended if B fails) | Option B (verify first) |
|---|---|---|
| Auth account | Hard-delete with `auth.admin.deleteUser(id)` | Supabase soft delete (`deleteUser(id, true)`): the row stays, identities are removed, the email is obfuscated, login is impossible |
| `profiles.id → auth.users` FK | **Drop it** (otherwise deleting the user cascades the profile). Add a nightly reconciliation that tombstones any profile whose account vanished outside the workflow (e.g. dashboard deletes) | Keep it (the row never disappears) |
| Must verify | n/a | Exactly which fields Supabase scrubs on soft delete, that sessions and identities are gone, and that the email can sign up again |

**Tombstone =** `deleted_at` set; `email = ''`; `username`, `display_name`, `bio`, `avatar_path`, `player_slug` NULL;
`is_host` false; `platform_role` NULL. Readers show **"Former member"**. A tombstoned profile can't be initialized,
completed, invited or linked again (new checks in `initialize_my_profile`, `complete_my_profile` and the invite functions).

**Defense in depth.** Change the dangerous cascades (`golf_trips.created_by`, `shared_rounds.host`) to `RESTRICT`, and add a
trigger that refuses `DELETE` on `profiles`. An accidental hard delete then fails loudly instead of wiping a trip.

## 4. Ownership transfer and fallback

Transfer happens **inside the same transaction** as the deletion, before anything is scrubbed.

| Container | Rule | Fallback when nobody qualifies |
|---|---|---|
| Golf Trip (organizer) | If the person chose a successor (an accepted member with a complete profile), use them. Otherwise the earliest-accepted member with a complete profile. They become `organizer`, and the trip records who transferred it and when | No other accepted member: the trip has only the deleter's data, so **delete it** (category C). Members with only pending invites: delete, and the invite links die |
| Shared round (host) | Earliest **joined** other player becomes host | No other joined player: delete the round |
| Tournament / organization (owner role) | An existing co-owner or admin. Otherwise the deleter must pick one in the UI before deleting | **Platform custodian:** a platform admin becomes interim owner; the tournament is frozen read-only and published history stays. The custodian can hand it to a member who asks, or archive it after a retention period (decision D3) |
| Admin player-claim invitations they sent | `invited_by` → NULL (already) | n/a |
| A trip they were *invited* to (not yet accepted) | Invitation rows aren't linked to the account (`profile_id` NULL until accepted), so nothing to do; the organizer-typed email stays with the organizer's trip | Organizer removes it (existing) |

**The UI must show what will transfer** ("Spring Trip → Alex Morgan; Texas Cup → you must choose an admin") and block
until every tournament has an owner or the person accepts custodian handling.

## 5. The deletion workflow

```
 Settings → Delete account
   │ 1. verified session (cookie or iOS bearer) + recent sign-in (re-enter password / re-auth within N min)
   │    + type DELETE.  The account id ONLY comes from the session; no id is accepted in the body.
   ▼
 request_account_deletion(profile)         → account_deletion_requests row (one per account; repeat = same row)
   │ state: pending (optional grace period, decision D1; the person can cancel; all sessions are signed out now)
   ▼
 execute_account_deletion(profile, request) — ONE database transaction, service role only:
   │  a. lock the request row (FOR UPDATE); exit if already done (idempotent)
   │  b. assert the request's profile = p_profile and the request is due
   │  c. transfer / close containers (§4)
   │  d. delete category C rows; detach category F links; scrub organizer-typed names / emails on their member rows
   │  e. tombstone the profile (§3); write row counts to account_deletion_events
   │  f. state = db_done
   ▼
 outside the database, each step retried until it succeeds (a cron sweeper resumes stuck requests):
   │  g. remove storage objects under profile-photos/<profile id>/ (and future user-owned media)
   │  h. auth: sign out everywhere, then delete (Option A) or soft-delete (Option B) the login
   │  i. Sign in with Apple token revocation (when that provider exists)
   │  j. state = completed; confirmation shown in the app (and by email only if counsel requires it)
```

**Cannot touch another person's account:**
- every function takes the profile from the verified session;
- the database function re-checks that the request row belongs to that profile;
- the functions are callable by the service role only;
- there's a unique request per account;
- there's no admin "delete any user" button in V2 (admin requests go through a separate, audited path if ever needed).

**Cannot touch shared data:** the only rows deleted are category C rows owned by that profile, all selected by
`profile_id = p_profile`. Shared rows are only re-pointed or scrubbed in place.

**Idempotency:** every step checks its own completion (state machine plus "already gone" = success). Running it twice
or concurrently changes nothing more (row lock).

**Session revocation:** the app validates with `auth.getUser()` (a server round-trip), not by just reading the token. So
a deleted login stops working immediately, not when its token expires (≤1 h). Keep that rule, including for the iOS
bearer pathway.

**Special cases**

| Case | Handling |
|---|---|
| Incomplete profile | Same flow; fewer rows |
| Verified login with no profile (orphans; 2 in production) | Request from the session; skip a–f (nothing to scrub); steps g–j |
| Never-verified accounts | Can't sign in, so they can't use the in-app flow. Optional auto-purge after N days (decision D4), **excluding the 6 V1 unverified accounts that hold player claims** (V1 preservation) |
| Pending admin player invitation to them | `player_claim_invitations` cascades with the auth row; the player slot stays unclaimed |
| Devices / browser | Delete push subscriptions (C). On sign-out, the client clears scoring drafts and other `localStorage` keys tied to the account |
| Email address reuse | After deletion, the same email can create a **new** account with a **new** UUID. It never inherits the tombstone or old claims |

## 6. Backups, rollback and failure recovery

- **Before execution:** fully reversible (cancel during the grace period).
- **After execution:** not reversible by design. The only "undo" is the person signing up again. Engineering rollback
  covers **schema** only (each migration ships an undo file); never "restore a deleted user".
- **Backups:** deleted data lives in backups until they expire. The privacy notice must say so (counsel).
  `account_deletions` keeps only the profile UUID and completion time. After any restore, a **re-apply job** tombstones
  every UUID in that ledger again before the app reopens, so deleted people don't reappear. Add this to the restore
  drill (`BACKUP_RECOVERY_SPEC.md`).
- **Partial failure:** database steps are atomic (all or nothing). Storage and auth steps retry with backoff. A request
  stuck for over 24 h alerts an operator. Any failure leaves the account **closed** (signed out, profile tombstoned)
  rather than half-open.

## 7. Privacy-safe audit log

`account_deletion_events(request_id, profile_uuid, step, outcome, row_counts jsonb, actor ('self' | 'system'), at)`.
- **No** email, name, IP or free text.
- The profile UUID is random and no longer maps to a person once the login is gone.
- Row counts prove what was removed without saying what it was.
- Retention: decision D6.

## 8. Migrations required (not written or run)

| # | Migration | Notes |
|---|---|---|
| M1 | `profiles`: add `deleted_at`; deletion guard trigger (refuse `DELETE`); tombstone-aware checks in `initialize_my_profile`, `complete_my_profile`, invite and accept functions | Additive. No V1 row changes |
| M2 | `golf_trips.created_by`, `shared_rounds.host`: CASCADE → RESTRICT | Constraint change only |
| M3 | Option A only: drop `profiles_id_fkey` (→ `auth.users`); add a reconciliation function | Decided by the Option B test |
| M4 | `account_deletion_requests`, `account_deletion_events`, `account_deletions` (ledger) | New tables, RLS on, server-only |
| M5 | `request_account_deletion`, `cancel_account_deletion`, `execute_account_deletion`, `transfer_golf_trip_organizer`, `transfer_shared_round_host`, `transfer_tournament_owner`, `reapply_account_deletions` | Security definer, service role only |
| M6 | Read models: "Former member" labels (`get_golf_trip`, shared rounds, tournament rosters, historical links) | Function replacements |
| M7 | Grant cleanup found on the way: revoke `anon` / `authenticated` on `approve_profile_edit` and the 2 legacy trigger functions | Separate item, listed for completeness |

Production order (later, separately approved): backup → profile_initialization.sql (Step 2) → M1–M6 → deploy code.

## 9. Code changes (proposed)

| File | Change |
|---|---|
| `lib/account/deletion.ts` (new) | Server orchestration: request, cancel, execute (calls the database function), storage and auth steps, retries |
| `app/api/account/delete/route.ts` (new) | `POST` = request (session + recent re-auth + confirmation), `DELETE` = cancel, `GET` = status. Cookie or bearer, like `/api/account/initialize` |
| `app/api/internal/account-deletions/route.ts` (new) | Cron sweeper (auth like `/api/internal/trip-push`); resumes pending and stuck requests |
| `components/settings/…` + `app/settings` | "Delete account" screen: transfers preview, successor picker, typed confirmation, status |
| `lib/profile/currentProfile.ts` | Tombstoned profile → `signed-out` (and the login is gone anyway) |
| Read models (`profileReadModelServer`, trips, compare, search) | Exclude tombstones; show "Former member" in shared lists |
| Sign-out client | Clear account-scoped `localStorage` |
| `scripts/auth-local/regression.mts` + new DB tests | §11 |

## 10. Deploys: can V2 code reach production before its migrations? (requirement 10)

- **Today:** Vercel project `maroon-masters-website` (`themaroon.site`) has 3 deployments, the newest on **2026-10-08**
  (`8f6d17c3`, Git-triggered from `main`). `main` has had many pushes since with **no new deployment**, so
  Git-triggered deploys are not running now. The API doesn't show why (disconnected Git, a paused integration or an
  ignored build step); check it in Vercel → Project → Settings → Git.
- **Risk:** `main` on GitHub already contains the Step 2d V2 account code (commits 871dd7d4 / bb00ca5d), whose SQL is
  not in production. Any of these would ship it without its migration:
  - reconnecting Git or re-enabling auto-deploy;
  - "Redeploy" on a newer commit;
  - `vercel --prod` from the working tree.

  The V2 code mostly degrades rather than breaks. Login and signup keep working. Finish setup answers "not switched
  on". **The admin invite sends the email and then fails to save the claim.**
- **No CI or GitHub Actions** are present (`.github/` has only `copilot-instructions.md`), and there is no migration
  gate anywhere.
- **Recommendations** (owner chooses, nothing changed):
  1. Before any deploy, run the corrected read-only inspection and confirm `profile_initialization.sql` shows
     "FUNCTIONS MATCH".
  2. Add a fail-closed readiness check: a server-side check (cached) that the required functions exist. Features whose
     SQL is missing answer "not available" **before** doing anything outside the database (e.g. before sending an
     invite email).
  3. In Vercel, turn off automatic production promotion (production deploys build, then are promoted by hand after the
     migration). Or keep V2 work on a branch until the migration window.
  4. Add `docs/production-deploy-checklist.md`: backup → SQL → verify → deploy → smoke test.

## 11. Testing plan

- **Database tests (PGlite):**
  - tombstone scrubs every personal field and nothing else;
  - no other user's row changes (snapshot every table before and after, then diff);
  - transfers: a successor, the earliest-accepted member, sole-member deletion, tournament custodian;
  - blockers and cascades are never triggered;
  - the `profiles` delete guard;
  - idempotent re-run and concurrent run;
  - wrong-profile request refused;
  - incomplete and orphan cases;
  - reapply after a simulated restore;
  - V1 claims and archives untouched except the link.
- **Local Supabase (isolated stack):**
  - the Option B soft-delete verification;
  - a real `deleteUser` / soft delete followed by an immediate API call with the old token → refused;
  - storage objects removed (local storage service);
  - the email can sign up again with a new UUID;
  - the bearer (iOS) path;
  - the sweeper resumes after an injected failure at each step;
  - two browsers deleting the same account at once.
- **Authorization sweep:** every deletion route called signed out, as another account, with a body id, and with a stale
  session (no recent re-auth) → refused.
- **Restore drill:** restore a backup into an isolated database, run the reapply job, confirm the tombstones.
- **Manual (before App Store submission):** the deletion path is reachable in-app in 2–3 taps; the confirmation copy
  has been through counsel's review.

## 12. Risks

- A dashboard delete or other admin action outside the workflow (mitigated by RESTRICT, the profile delete guard and
  reconciliation).
- Organizer-typed personal data in shared rows: member display names and emails, announcements, free-text notes. Each
  needs explicit scrub rules; announcements are text written by others about the person (a counsel / moderation
  question).
- V1 public archive and static files contain real names; account deletion doesn't remove them (category F process).
- Backups and vendor logs (Supabase Auth, email, Vercel) retain data until they expire.
- Supabase soft-delete semantics (Option B) are unverified.
- The tournament custodian fallback creates platform responsibility for others' events (policy decision).

## 13. Owner decisions needed

| # | Decision |
|---|---|
| D1 | Grace period before execution (0 = immediate, or e.g. 7 days with cancel) |
| D2 | Tombstone Option A vs B (after the local verification test) |
| D3 | Tournament custodian rules and how long an ownerless tournament is kept |
| D4 | Auto-purge never-verified accounts after N days (V1's 6 excluded) |
| D5 | MM Coins: delete bets and balance, or keep settled bets de-identified for market consistency |
| D6 | Retention for the deletion audit, the ledger and backups (with counsel) |
| D7 | Counsel review of the notice text, retained-data exceptions and historical-name removal requests |
