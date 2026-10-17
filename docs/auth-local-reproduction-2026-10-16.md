# Accounts Step 2c — Local reproduction of signup behavior (2026-10-16)

**Where:** an isolated local Supabase in Docker (project `maroon-auth-test`, ports 55xxx, fresh empty database,
Supabase Auth **v2.197.0**, email confirmation ON like production). It ran the app's **real** route handlers (signup,
login, forgot/reset password, auth callback, admin invite) plus direct Supabase calls.
**Safety:** every network request was checked to go to `127.0.0.1` (96 requests, 0 elsewhere). Emails went only to the
local Mailpit inbox, and test addresses use the reserved `.test` domain. No `.env` file was read. Production was never
contacted. The 13 player slots are the local seed copy; no Maroon account was involved.
**No application code, SQL file or production setting was changed.**

## How to reproduce

```
node scripts/auth-local/setup.mjs                      # build + start the isolated stack (wipes any earlier run)
npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/reproduce.mts
node scripts/auth-local/setup.mjs stop                 # stop it and delete its data
```

| File | Purpose |
|---|---|
| `scripts/auth-local/config.toml` | Isolated stack settings: own project id and ports, confirmation ON, no studio/realtime/edge/analytics |
| `scripts/auth-local/setup.mjs` | Copies 30 repo SQL files (the database-test chain plus the signup/profile files) into `out/auth-local` (git-ignored) as migrations, then starts it |
| `scripts/auth-local/register.mjs`, `next-headers-stub.mjs` | Let the real route handlers run in Node. One cookie jar = one browser |
| `scripts/auth-local/reproduce.mts` | Scenarios S1–S11. Refuses to run unless the API is `127.0.0.1:55321`, and blocks any non-local request |

## Results

| # | Scenario | Result |
|---|---|---|
| S1 | New signup | Account created (unverified) **and a profile `golfer_<random>` / "Golfer" is created before verification** |
| S2 | What Supabase returns (direct `signUp`) | New email: real id. **Existing UNVERIFIED email: no error, returns the REAL existing account id.** Within the repeat-email window: a throttle error. Existing VERIFIED email: error `User already registered` (no fake id on this version) |
| S3 | Same unverified email signs up again (after the throttle window) | **REPRODUCED: the original account and its profile are deleted**, the first verification link stops working, and the person is told "already taken" |
| S4 | Verified email signs up again | Account safe. But the reply (`User already registered`) differs from a new email's (`{ok:true}`), so it **reveals the email has an account** |
| S5 | Double-submit (two identical signups at once) | Not reproduced: one succeeds, the other gets `{"error":"{}"}`. No deletion |
| S6 | Player code at signup, then verify, then password reset | **The predictable code (`MM` + 3 + 3 letters of the name) claims the old player's slot at signup, before the email is verified.** Verification, login, forgot → callback → reset all work. The legacy trigger fires on reset (`password_created` = true) without errors |
| S7 | Login before verifying, by username | Correct password: "verify first" **and the reply includes the account's email address** |
| S8 | Signed-in account with no profile | **REPRODUCED two ways:** (a) an invite sent with Supabase's invite function (what the dashboard "Invite user" button does): accept, verified, signed in, no profile. This matches production accounts #01/#02 exactly (invited Aug 29, verified a minute later; the app's invite code didn't exist until Sep 14). (b) A signup sent straight to Supabase with the public browser key, skipping the app: verified, signed in, no profile |
| S9 | Pending admin invite (holds a player slot), then anyone signs up with the invited email | **REPRODUCED: the invited account, its profile and its player claim are deleted.** A different new email can then claim that player with the code alone |
| S10 | Admin invites an email that already has an unverified self-signup | **REPRODUCED: the admin-invite cleanup deletes the existing account** (Supabase re-invites it and returns its real id, the profile insert fails, then cleanup deletes it) |
| S11 | Admin invites an email with a verified account | Refused by Supabase; nothing deleted |

**Exact cause (S3, S9):** `app/api/auth/signup/route.ts`. Line 39 `signUp` returns the existing unverified account's
real id. Line 44's profile insert fails because that id already has a profile. Line 54 then calls `deleteUser` on it.
The profile cascade-deletes, and `player_slots.claimed_by` goes back to NULL.
**Exact cause (S10):** `app/api/portal/admin/invite/route.ts` follows the same pattern: invite, then a profile insert that
fails, then `deleteUser` on the id it got back.

## What applies to production (inferred, not tested there)
- Production has **6 never-verified accounts that already hold player claims**: 5 pending admin invites and 1 code
  signup. By S9, anyone who knows one of those email addresses could delete that account and then claim the player
  with its code. This depends on hosted Supabase Auth behaving like v2.197 for unverified accounts, which is not
  checked on the hosted project (that would need a separate hosted *test* project).
- Hosted projects throttle repeat emails for 60s by default, so the retry has to come after that, as in S3.
- The 2 accounts with no profile are explained by S8a (dashboard invites). Nothing indicates data loss for them.

## Not reproduced / not tested
- A profile-less account caused by a *failed* signup cleanup (it needs `deleteUser` itself to fail; not forced).
- Hosted-project differences (Auth version, rate limits, email templates).

## Also found
- The 2026-10-16 live inspection's "multiple live function versions differ from the repository" was **a false alarm
  from the inspection script**. The live functions are the repo's text with Windows (CRLF) line endings. The script now
  fingerprints both line-ending styles (`docs/database-inspection-readonly.sql`, regenerated, re-tested). Re-running it
  on production (read-only) would give a corrected verdict table.
