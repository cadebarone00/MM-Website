# Account Settings Phase A2 — Password security (built and tested locally, 2026-10-19)

Local only: isolated Supabase in Docker. No production change, no live SQL, no commit, no push, no deploy.
Audit this builds on: `docs/account-settings-audit-2026-10-17.md`.

## What was built
- **Settings → Account → Change password:** current password, new password (twice), the rules shown as you type, and
  a "Forgot it? Get a reset email" link. After success, every other device is signed out; this one stays signed in.
- **`POST /api/account/password`:**
  - the account comes from the session (cookie or bearer); the current password is required;
  - Supabase checks the current password for **that account's own email**, then updates the password through its own
    endpoint (its limits and leaked-password protection apply);
  - other sessions are revoked;
  - web cookies switch to the fresh session; a native caller gets the fresh tokens back.
- **Reset / invite "set your password" page (`/api/auth/reset-password`):**
  - only accepts a session that came from a reset or invite **email link**, used within 1 hour; an ordinary session
    (e.g. stolen) gets 403;
  - the shared rules apply;
  - success signs out **every** session, the link's included, so a reset also kicks out anyone else.
- **One set of password rules** (`lib/auth/passwordPolicy.ts`): **at least 12 characters**, **at most 72 bytes**,
  passphrases and any language allowed, no forced character classes, not just one repeated character. Used by signup,
  change password, reset and invites, and only when setting a password: existing V1 passwords still sign in.
- **Re-authentication now counts only real sign-ins** (password; later Sign in with Apple). A reset, invite or
  magic-link session can't be used to confirm sensitive actions.
- **Revoked sessions stop working at once:** the database check that already blocks deleted accounts
  (`account_is_active()` + the request gate, in `supabase/account_deletion.sql`) now also refuses a token whose sign-in
  session no longer exists. A signed-out device's token is refused by REST, RPC and Storage immediately instead of
  working until it expires (up to 1 hour).

## Security findings
1. **Fixed: account deletion could be confirmed with a stolen session.** The delete route accepted "signed in within 10
   minutes" instead of the password, so a freshly stolen session could delete the account. Found by this phase's
   attacker test. **The password is now always required.**
2. **Fixed: any signed-in session could set a new password** on `/reset-password` without the current password.
3. **Fixed: revoked or old devices kept working against the database** until their token expired.
4. **Confirmed safe:**
   - Supabase's own "secure password change" refuses an old session without re-authentication;
   - reset links are single-use (a second click says expired);
   - Supabase also ends other sessions on a password change (we do it explicitly too).

## ⚠️ Conflict with the 128-character requirement
Supabase Auth refuses passwords **longer than 72 bytes** (its bcrypt limit; tested: 73 refused, 128 refused, 40
accented letters = 80 bytes refused). Supporting 128 would need custom password hashing, which you've ruled out. The
limit is therefore **72 bytes** (72 plain letters; accents and emoji take 2–4 bytes each). The form explains it.

## Tests
| Suite | Result |
|---|---|
| `scripts/auth-local/password-regression.mts` (isolated Supabase, real routes) | **34 / 34** |
| `lib/auth/passwordPolicy.test.ts`, `signup.test.ts`, `lib/account/reauth.test.ts` | **4 / 4, 3 / 3, 3 / 3** |
| Account deletion DB tests (with the new session check) | **12 / 12** |
| Step 2 `regression.mts` / Step 3 `deletion-regression.mts` / `deletion-routes.mts` | **55 / 55, 40 / 40, 33 / 33** |
| Full `npm test` | **1,439 / 1,440**: the one failure is the compliance registry count (29 vs 28), from the other terminal's committed change, not A2 |
| `tsc`, eslint | clean |

**Covered:**
- rules at signup, in the app and in Supabase itself;
- 72-byte edge cases;
- passphrases;
- V1 short passwords still sign in;
- a **stolen session without the password** can't change the password, use the reset page, or delete the account;
- Supabase's secure password change refusing an old session;
- wrong current / weak / same password errors;
- other devices' refresh tokens, Auth checks and **REST access cut off immediately**, while this device stays signed in;
- a retried request after an interrupted change;
- the native (bearer) flow returning new tokens;
- forgot-password works, rejects weak passwords, signs everything out, and its link is one-time;
- an invite-link first password;
- a reset-link session can't confirm deletion.

The Change password screen wasn't clicked through in a browser: your other terminal's dev server holds the project
folder and runs against production settings, so I didn't use it. Its rules logic is covered by the unit tests, and
the route by the end-to-end tests.

## Supabase dashboard settings (for you to set after review; affects V1 users too)
**Supabase → Authentication →**

| Setting | Value | Why |
|---|---|---|
| Providers → Email → **Minimum password length** | **12** | Supabase enforces it server-side too (tested) |
| Providers → Email → **Password requirements** | none (passphrases allowed) | matches the app |
| Providers → Email → **Secure password change** | **ON** | Supabase itself requires a recent sign-in to change a password |
| Providers → Email → **Prevent use of leaked passwords** | **ON** | needs a paid Supabase plan; the app shows a plain message when it triggers |
| Email OTP / link **expiry** | 3600 s or less (15–60 min suggested) | reset links expire sooner |
| Sessions → time-box / inactivity (optional) | your choice | limits forgotten sessions |
| **CRON_SECRET** (Vercel env) | set | (from Step 3d) |

## Remaining risks / not done
- **Link-only accounts** (invited, never set a password; e.g. production's 2 orphan accounts) must use "forgot
  password" before they can change their password or delete the account.
- **The 72-byte limit** conflicts with the 128-character requirement (above).
- **Leaked-password protection** only works once enabled on a paid plan; locally it's untestable.
- **The revoked-session check runs on every request**, including live Maroon traffic. It's light (one index lookup) but
  needs a performance check on production before rollout. It ships inside `account_deletion.sql`.
- No app-level rate limit: wrong-password guessing relies on Supabase's sign-in limits.
- **Not started (as instructed):** A1 (verification landing), A3 (email change), A4 ("Sign out" = this device), A5,
  A6. Standard "Sign out" still signs out everywhere until A4.

## Files
**New:**
- `lib/auth/passwordPolicy.ts` + test, `lib/auth/passwordErrors.ts`;
- `lib/account/passwordChange.ts`, `app/api/account/password/route.ts`;
- `components/settings/ChangePasswordSetting.tsx`;
- `scripts/auth-local/password-regression.mts`.

**Changed:**
- `app/api/auth/reset-password/route.ts` (link sessions only, shared rules, sign out everywhere);
- `app/api/account/delete/route.ts` (password always required);
- `lib/account/reauth.ts` + test (real sign-ins only; link methods separate);
- `lib/auth/signup.ts` + test (shared rules);
- `supabase/account_deletion.sql` (`session_is_revoked()`, used by `account_is_active()` and the request gate);
- `app/settings/page.tsx` (Change password);
- `components/auth/SignUpForm.tsx`, `ResetPasswordForm.tsx` (12-character hint and minimum);
- `scripts/auth-local/config.toml` (local: minimum 12, secure password change);
- `scripts/auth-local/deletion-regression.mts` (orphan path now sets a password first).
