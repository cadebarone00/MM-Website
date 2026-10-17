# Step 3d — Account deletion UI, hand-off, routes and retry job (2026-10-17, local only)

Built and tested against the isolated local Supabase only. No deploy, no production SQL, no push, no real or V1 user
touched. Builds on Step 3c (`docs/account-deletion-implementation-2026-10-17.md`).

## UI flows
**Settings → Account → "Delete account"** (`/settings/delete-account`). Any signed-in person can start it themselves,
finished profile or not, without contacting support.
1. **What happens:**
   - *Deleted*: login, email and password; profile name, username, bio and photo; uploaded files; personal rounds;
     flights and travel; open MM Coins bets (cancelled) and balance; tournament admin roles.
   - *Kept, without your name*: trip and tournament scores and scorecards, trips joined ("Former member"), hosted
     rounds end with scores kept, the old Maroon player record unlinked **and locked**.
2. **Trips you organize:** each shows its exact outcome:
   - an accepted hand-off → "X accepted and will become the organizer";
   - ended → archived;
   - otherwise → "becomes read-only with no organizer" (and "waiting for X" or "X declined").

   For active trips you can **ask** a joined member with a finished profile to take over, or withdraw the request.
   Nobody is made organizer without accepting.
3. **Confirm:** password + type `DELETE`; the button is disabled until both are filled in.
4. **Processing:** "Deleting your account… keep this page open".
5. **Result:**
   - **"Account closed · deletion finishing"** while any step is unconfirmed;
   - **"Deletion completed / Your account has been deleted"** only when the server reports `completed` (database,
     Storage and the login all confirmed gone).

   A wrong password keeps you on the form with an error.

**Settings → "Organizer requests"** (only when someone asked you): Accept or Decline. Accepting means you become
organizer if they delete their account.

Dev preview: `/dev/profile/delete-account?outcome=completed|closed|wrong-password`, on sample data with simulated
answers (development only).

## API routes
| Route | Who | What |
|---|---|---|
| `GET /api/account/delete` | signed-in (cookie or bearer) | deletion state + preview for **your own** account |
| `POST /api/account/delete` | signed-in | `{ confirm: "DELETE", password? }`. The account comes from the session (any id in the body is ignored). Requires the password, checked against **your** email, or a sign-in within 10 minutes. Answers the state actually reached |
| `POST /api/golf-trips/[tripId]/organizer-handoff` | the trip's organizer | ask a member (their member row on that trip) to take over |
| `PATCH …/organizer-handoff` | the asked member only | `{ accept: true \| false }` |
| `DELETE …/organizer-handoff` | the organizer | withdraw the request |
| `GET /api/internal/account-deletions` | Vercel Cron only (`CRON_SECRET`, timing-safe) | retry job; answers counts only |

## Retry mechanism
- `vercel.json` runs `/api/internal/account-deletions` every 10 minutes. Only the cron secret works, so no browser
  session (even an admin's) can trigger it.
- The job:
  1. resumes every unfinished deletion from its recorded step (database → Storage → Auth hard delete → completed;
     each step idempotent and row-locked);
  2. removes files that still belong to a finished deletion (e.g. an upload racing the close).
- Before `account_deletion.sql` is installed it answers 503 and does nothing.

## Database additions (in `supabase/account_deletion.sql`, still not run anywhere but locally)
- **Hand-offs:** `declined_at`; `decline_golf_trip_organizer`, `cancel_golf_trip_organizer`,
  `list_my_organizer_offers`; accept requires a finished, open account.
- **`account_deletion_preview`:** the same transfer / archive / restrict rules the deletion uses, eligible successors,
  and counts.
- **Historical claim lock:**
  - `player_slots.claim_locked_at` / `claim_locked_reason`, set when a deletion releases a claim;
  - trigger `guard_locked_player_slot` refuses claiming, inviting or unlocking a locked slot unless a future,
    separately authorized reassignment sets `maroon.claim_unlock` (not built);
  - the admin invite route also refuses locked records **before** sending any email.
- **`orphaned_deleted_account_objects`:** used by the retry job.

## Files
**New:**
- `app/api/account/delete/route.ts`, `app/api/golf-trips/[tripId]/organizer-handoff/route.ts`,
  `app/api/internal/account-deletions/route.ts`;
- `app/settings/delete-account/page.tsx`, `components/settings/DeleteAccountFlow.tsx`, `OrganizerOffers.tsx`,
  `DeleteAccount.module.css`;
- `lib/account/deletionCopy.ts` + test;
- `components/dev/DevDeleteAccountPreview.tsx`, `app/dev/profile/delete-account/page.tsx`;
- `scripts/auth-local/deletion-routes.mts`.

**Changed:**
- `supabase/account_deletion.sql` (additions above);
- `lib/account/accountDeletion.ts` (preview, password re-check, hand-off, orphan sweep);
- `lib/account/accountDeletionDatabase.test.ts` (+3 tests);
- `app/settings/page.tsx` (Delete account link + Organizer requests card);
- `components/settings/SettingsScreen.tsx` (optional `offers` card);
- `app/api/portal/admin/invite/route.ts` (lock check before inviting);
- `vercel.json` (cron).

**Not touched:** Cam's stats and games work, the existing Settings stylesheet (the new screens have their own), the
simulator registry.

## Tests
| Suite | Result |
|---|---|
| Deletion database tests (PGlite) | **12 / 12** |
| Deletion wording tests | **3 / 3** |
| Re-auth helper tests | **2 / 2** |
| `deletion-routes.mts` (real routes; isolated Supabase) | **33 / 33** |
| `deletion-regression.mts` (Step 3c end to end) | **39 / 39** |
| `regression.mts` (Step 2 accounts) | **55 / 55** |
| Full `npm test` | **1,412 / 1,412** |
| `tsc`, eslint | clean |
| Existing screens on a local dev server (pointed at the isolated stack): `/dev`, `/dev/profile`, `/dev/profile/settings`, `/dev/profile/edit`, `/settings` | all load, no server errors |
| Delete-account preview in the browser: Ask → "Waiting for …", Withdraw, the button gated on password + DELETE, processing, "closed" vs "completed", wrong password | as specified |

**Covered:**
- complete deletion; an unfinished profile; active and completed trips; an accepted hand-off; a **declined**
  hand-off; no available successor;
- shared scorecards: the other player keeps scoring in the restricted trip, and the tombstoned card stays in the group;
- historical claims unlinked and locked: admin invite and direct claim both refused;
- active JWTs; Storage; a concurrent double-submit; an interrupted deletion finished by the job; job authorization;
- orphaned file sweep; the job's answer holds no ids or emails.

## Remaining launch blockers
1. **Production rollout:** backup → `profile_initialization.sql` → `account_deletion.sql` → deploy, in that order.
   Smoke-test REST right after (the pre-request hook is role-wide). Set `CRON_SECRET` in Vercel if it isn't already.
2. **Legal / privacy review (D7):**
   - the basis for keeping de-identified shared scores and settled MM Coins bets;
   - retention of restricted and archived trips, the 90-day log and the restore ledger;
   - wording of the deletion screen;
   - Apple review of the in-app path;
   - whether a completion email is required.

   The screen wording is factual and provisional until then.
3. **A person whose account is already closed can't see progress after signing out.** The screen shows the accurate
   state at that moment, and the job finishes in the background. A status page or email would need a decision.
4. **Sign in with Apple** token revocation, needed once Apple sign-in exists.
5. **Dashboard deletions:** reconciliation for users deleted outside the workflow is designed, not built. Don't delete
   users from the Supabase dashboard.
6. **Reassigning a locked historical record** needs an ownership-verification and authorization process (not built).
7. **Restricted trips:** no screen yet for a platform admin to appoint an organizer who accepts.
8. "Former member" labels in every read model (names are already scrubbed at the source rows).
9. The 30-day cleanup of abandoned unverified V2 accounts (D4) is planned, not built.
