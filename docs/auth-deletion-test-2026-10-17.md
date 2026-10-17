# Step 3b — Supabase Auth hard delete vs soft delete (local test, 2026-10-17)

**Where:** the isolated local Supabase (`scripts/auth-local/setup.mjs`, Auth **v2.197.0**, V2 schema). All 106 network
requests went to 127.0.0.1. No production access, no app or migration change.
**Re-run:** `node scripts/auth-local/setup.mjs` then
`npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/deletion-probe.mts`.

Each test user was a verified V2 user with a complete profile, a Golf Trip they created, a file they uploaded to
Storage (owner = their id), a live access + refresh token, and a signed-in web cookie session.

## Results

| | Hard delete `deleteUser(id)` | Soft delete `deleteUser(id, true)` |
|---|---|---|
| `auth.users` row | **gone** | kept, `deleted_at` set |
| Email / phone | gone | replaced with random strings |
| Password hash, user/app metadata | gone | removed / emptied |
| Identities | gone | **1 row kept** (`identity_data` emptied) |
| Sessions, refresh tokens, one-time tokens | gone | gone |
| Profile row (current schema) | **cascade-deleted** | kept |
| Trip they created (current schema) | **cascade-deleted: whole trip gone** | kept |
| With a `NO ACTION` blocker (`scoring_groups.created_by`) | **fails atomically**: nothing changes, account fully intact, error body `{}` | succeeds (nothing cascades) |
| Their Storage files | **kept** (no link from `storage.objects.owner_id` to accounts) | kept |
| Password sign-in / magic link afterwards | refused / refused | refused / refused |
| Old refresh token | refused | refused |
| Old access token, Auth `getUser` | refused | refused |
| Old access token, the **app** (bearer `/api/account/initialize`, cookie `/api/auth/password-session`) | 401 / 401 | 401 / 401 |
| Old access token, **direct REST** (own profile, RLS `auth.uid()`) | 0 rows (row is gone) | **still returns the row** |
| Old access token, **direct Storage** (read + write own folder) | **still works** | **still works** |
| How long the old access token keeps working directly | up to its expiry (**3600 s**) | up to its expiry (**3600 s**) |
| Admin `getUserById` | not found | found (with `deleted_at`) |
| Admin `updateUserById` | refused (not found) | **accepted** |
| **Revive**: admin sets a new email + password, then signs in | impossible | **SIGNED IN with the same UUID** |
| Same email signs up again | yes, **new** UUID | yes, **new** UUID |
| Soft delete, then hard delete later | n/a | works; the hard delete then cascades the profile like a direct hard delete |
| Admin global sign-out alone (no delete) | sessions + refresh tokens revoked; `getUser` refuses the old token; **direct REST still accepts it** | |

## Findings
1. **Soft delete leaves a recoverable account.** The row survives, an admin can rewrite its email and password, and it
   signs in again with the same UUID. This fails the requirement that a retained anonymized profile must not be a
   functioning or recoverable user account. It also leaves an identity row.
2. **Hard delete removes the login completely** (row, identities, sessions, tokens). Nothing can revive it, and a
   returning person gets a new UUID. On today's schema, though, it cascades into the profile and **wipes trips the
   person created**, and it **fails** for anyone with a `NO ACTION` reference (blocked atomically, with an unhelpful
   `{}` error).
3. **Outstanding access tokens outlive both methods for up to an hour** against Supabase's REST and Storage APIs
   directly. The app's own routes are safe because they verify with `auth.getUser()`. But anyone holding the old token
   can still read and write Storage files in the person's folder until it expires.
4. **Storage is never cleaned by Auth.** Both methods leave the person's files behind, with `owner_id` still set to
   the old UUID.
5. **Failed deletion is safe but opaque:** a blocked hard delete changes nothing, and the error doesn't say why.

## Recommendation: hard delete, inside the Step 3 workflow
Use **hard delete** of the Auth user. It's the only method that leaves no recoverable account. Make it safe with these
design requirements (all still unbuilt and pending approval):
- **Detach the profile from the Auth row before deleting it:** drop `profiles.id → auth.users ON DELETE CASCADE`
  (design option A). Tombstone the profile in the same database transaction first. Then the Auth delete touches no
  app table: no cascade, no blockers. A nightly reconciliation catches any account deleted outside the workflow.
- **Defense in depth:** `golf_trips.created_by` and `shared_rounds.host` → `RESTRICT`, plus a trigger refusing `DELETE`
  on `profiles`.
- **Storage:** the workflow deletes the person's objects (by prefix and by `owner_id`), and Storage policies require
  an active, non-tombstoned profile. Then a leftover token can't read or write files even before it expires.
- **Tokens:**
  - revoke sessions first;
  - keep using `auth.getUser()` in every app route (never read the token alone);
  - put the active-profile check into every browser-reachable RLS policy (`profiles_select_own`, Storage, Realtime
    subscriptions);
  - consider shortening the access-token lifetime in production (Auth settings; currently 3600 s).
- **Failure handling:** treat any `deleteUser` error as retryable and keep the account closed. The sweeper retries,
  and alerts after repeated failure. With the FK detached, the known blocker class disappears.
- **The tombstone itself** must hold no login or recovery path: no email, no identity, no Auth row. The UUID is kept
  only as an anchor, and only where a lawful retention basis for the shared record is confirmed (D7). Otherwise those
  shared rows are de-identified further or removed.

## Not tested
- Hosted Supabase (version and settings may differ).
- Sign in with Apple token revocation (no Apple provider yet).
- Realtime channels holding an old token.
- MFA factors.
