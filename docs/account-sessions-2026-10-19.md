# Account Settings Phase A4 — Sessions and devices (built and tested locally, 2026-10-19)

Local only: isolated Supabase in Docker. Not committed (waiting for review), not pushed, not deployed, no production
change.

## What changed
| | Before | Now |
|---|---|---|
| **Sign Out** (account menu, Settings) | Supabase default `global`: signed out **every** device | **This device only** (`scope: "local"`), ended on the server too, so its access token stops working at once |
| **Settings → Account → Devices** | none | **Sign out of other devices** (this device stays signed in) and **Sign out everywhere** (security option). Both need the account **password** |
| Native app (bearer token) | sign-out read cookies only | `/api/auth/signout` and `/api/account/sessions` accept `Authorization: Bearer`. "Other devices" returns the app's new tokens |
| Old access tokens after any sign-out | (fixed in A2) refused once the session is gone | also refused once a session passes its **end time** (Supabase time-boxed sessions) |
| Password reset / account deletion | sign out everywhere | **unchanged**: still everywhere |

## Files (A4, uncommitted)
**New:**
- `lib/account/sessions.ts`, `app/api/account/sessions/route.ts`;
- `components/settings/DevicesSetting.tsx`;
- `scripts/auth-local/session-regression.mts`;
- this document.

**Changed:**
- `app/api/auth/signout/route.ts` (this device only; bearer support);
- `app/settings/page.tsx` (Devices);
- `components/settings/SignOutButton.tsx` (comment only; the button and dialog are unchanged);
- `supabase/account_deletion.sql` (`session_is_revoked()` also treats sessions past `not_after` as ended);
- `scripts/auth-local/harness.mts`, `next-headers-stub.mjs` (each simulated request keeps its own cookies, so
  same-moment requests can be tested).

## Tests (all on the isolated local Supabase)
| Suite | Result |
|---|---|
| `session-regression.mts` (new; run twice, stable) | **32 / 32** |
| `password-regression.mts` (A2) | **34 / 34** |
| `regression.mts` (Step 2) / `deletion-regression.mts` / `deletion-routes.mts` (Step 3) | **55 / 55, 40 / 40, 33 / 33** |
| Unit + database tests | **22 / 22** |
| Full `npm test` | **1,445 / 1,446**: the one failure is the compliance registry count (29 vs 28) from the other terminal's commit, not A4 |
| `tsc`, eslint | clean |

**Covered** (every revocation checked against the old **access token**, on both REST and Storage, plus the refresh
token):
- several web browsers and app sessions on one account;
- this-device sign-out (web and bearer) leaves the others working;
- "other devices" needs the password (a stolen session can't), keeps this browser on a fresh session, and cuts off
  every other device; the bearer variant returns new tokens;
- "everywhere" leaves no sessions, and the account can sign in again;
- concurrent sign-outs, and concurrent "other devices";
- a time-boxed session past its end;
- password change (this device stays) and reset (everyone out), as in A2;
- deleted accounts (sign-out stays harmless; device management refuses);
- unknown scope; signing out twice.

## Session-security findings
1. **Sign out was global.** Fixed to this device only, as you decided.
2. **A signed-out or expired session's access token used to work against the database until it expired** (up to 1 h).
   Since A2/A4, REST, RPC and Storage refuse it immediately. **Realtime** channels opened before the sign-out aren't
   verified (not tested).
3. **"Other devices" re-checks the password** and swaps this device onto a fresh session. If two "other devices"
   requests from two devices race, the later one can find its fresh session already revoked by the earlier one. It
   then answers "couldn't sign out your devices, try again", and that device is signed out too. That's safe (nothing
   stays signed in that shouldn't). It didn't happen in testing.
4. No device list yet (which phone, last used). Supabase keeps `user_agent` / `ip` per session; a list would need
   your decision on showing IP addresses.

## Remaining launch blockers
1. **Passwordless accounts** (email-link only, later Apple-only): they can't confirm account deletion or "sign out
   other devices / everywhere" until secure re-authentication exists for them (Sign in with Apple re-confirm, or an
   emailed one-time code). Today they must set a password through "forgot password" first. **Explicit launch blocker.**
2. **Production rollout order:**
   - backup;
   - `profile_initialization.sql`;
   - `account_deletion.sql` (now carries the session checks: performance-check it, since it runs on every request);
   - deploy;
   - Supabase dashboard settings (A2 list);
   - `CRON_SECRET`.
3. **Legal / privacy review (D7):** deletion wording, retention, Apple review.
4. **Not built:** A1 (verification landing), A3 (email change), A5 (onboarding prompt), A6 (iOS: bearer support on
   the remaining routes, Universal Links, Sign in with Apple), a dashboard-deletion reconciliation, reassignment of
   locked historical records, organizer appointment for restricted trips.
5. **Realtime** behavior after sign-out: needs a test before launch.
