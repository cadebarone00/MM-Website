# Accounts V2 — Identity & profile initialization (Step 2d, 2026-10-17)

Built and tested **locally only** (isolated Supabase in Docker). Nothing was deployed, run on production, or committed.

## 1. Architecture

```
            Supabase Auth (one immutable UUID per person)                 profiles (id = that UUID)
  signup ──► login only (no profile, never a delete) ──► email verified ──► initialize_my_profile(account)
  admin invite ──► login + player-claim invitation bound to THAT account id ─┘   │  verified only, idempotent,
  dashboard invite / direct Supabase signup / future Apple, Google, iOS ─────────┘   safe concurrently
                                                                                  ▼
                       missing ──► INCOMPLETE (no username / name; claim finished if an admin invitation is bound)
                                        │  Finish setup: complete_my_profile(username + name, once)
                                        ▼
                                    COMPLETE ──► scoring, rounds, shared rounds, tournaments, public profile
```

**States** (`getCurrentProfile()`): `signed-out` · `no-profile` (verified login, no row) · `incomplete` (row, no
username or display name; carries only `profileId`, never a `profile`) · `ok` (complete).

**One initialization pathway** (`lib/profile/profileInitialization.ts`), called from:
- the web login route;
- `/auth/callback` (email / OAuth links);
- `/api/auth/password-session` (invite and recovery links);
- Finish setup (`POST /api/account/profile`);
- accepting a Golf Trip invite;
- and **`POST /api/account/initialize`**, which takes a cookie session **or** `Authorization: Bearer <access token>`
  (the iOS app and other clients). It has no request body, so it can't be aimed at another account.

Each caller is optional; any one of them is enough. There is no trigger on `auth.users`.

**Rules the database enforces** (`supabase/profile_initialization.sql`):
- An account must be verified (`auth.users.confirmed_at`) before it gets a profile or a player claim.
- `initialize_my_profile` inserts with `on conflict do nothing`. It never changes an existing profile's name, username
  or player link, and it never deletes anything.
- **Old player claims** complete only through `player_claim_invitations`. That table binds a player slot to **one**
  auth account id, written by an admin (`is_host`), and finishes inside initialization once that account is verified.
  A player code proves nothing. An email that merely matches does not claim automatically. The admin's name for the
  player prefills the display name; no username is ever invented.
- **Scoring, saved rounds and shared rounds need a complete profile.** The `require_complete_profile` trigger sits on
  `scoring_group_players`, `player_rounds` and `shared_round_players`, and the app checks the same thing.
  Tournament invites also need a complete profile (app-level). **Golf Trip invites and viewing a trip are allowed
  while incomplete.**
- Every new function is `security definer` with a pinned `search_path`, and only `service_role` can call it. The new
  table is closed to browser roles.

**Signup** (`app/api/auth/signup/route.ts`) calls only `auth.signUp`. New emails, existing verified emails, existing
unverified emails and throttled retries all get the same `{ok:true}`. Name, username and code fields are ignored.

**Admin invite** (`app/api/portal/admin/invite/route.ts`) works like this:
1. `inviteUserByEmail`.
2. Then `create_player_claim_invitation(host, slot, that account id, real name)`.
3. No profile is created at invite time, and nothing is deleted on failure (re-sending the invite repairs it).
4. A verified existing account answers 409: linking it needs the player-claim review, which isn't built yet.

## 2. `username` / `display_name` nullability audit (requirement 12)

| Dependent | Reads | Outcome with an incomplete profile |
|---|---|---|
| `get_golf_trip` (golf_trips.sql) | `p.username` of accepted members | `null`, so no profile link (`profileHref(null)` → null) |
| `historical_import.sql` | `pr.username` of linked participants | `null` link; linking needs a complete profile anyway (later step) |
| access requests / activity feeds | `coalesce(display_name, username)` | `null` author label; only complete users can post |
| `shared_rounds.sql` player names | `pr.display_name` | can't happen: the trigger keeps incomplete profiles out |
| platform dashboard / next edition / public site / tournament identity | `tournament_players.display_name` (their own column) | not affected |
| login by username (`/api/auth/login`) | `profiles.username` | incomplete profiles have no username, so no match; email login still works |
| `profile_id_for_username`, `/profile/<username>`, compare | `username` lookups | NULLs never match, so no public page |
| `compareServer.playedWith`, `sharedRoundsServer.searchAccounts` | lists by username | **changed:** now filter out `username is null` |
| `getCurrentProfile` and its 31 callers | `profile` | **changed:** the `incomplete` state carries no `profile`, so TypeScript forced a decision at every site. Golfer-only sites (privacy, flights, trip create/delete, scoring, corrections, submit, tournaments, profile edit) treat it as "Finish setup first". Trip view, list, accept and decline use `tripProfileId()` |
| `profileIdentityFromRow` | `username` / `display_name` as strings | unchanged (`""`); only used for complete profiles |
| unique `profiles.username` + `lower(username)` index | | NULLs allowed; uniqueness among real usernames is unchanged |

All 14 production profiles have both values (diagnostic count 10 = 0), so dropping `NOT NULL` changes nothing for V1.

## 3. Files

**New**
- `supabase/profile_initialization.sql`
- `lib/profile/profileInitialization.ts`
- `app/api/account/initialize/route.ts`
- `lib/auth/signup.ts` + `lib/auth/signup.test.ts`
- `lib/profile/profileInitializationDatabase.test.ts`
- `scripts/auth-local/harness.mts`, `regression.mts`, `server-only-stub.mjs`
- this document

**Changed**
- `app/api/auth/signup/route.ts` (rewritten), `app/api/portal/admin/invite/route.ts` (rewritten)
- `app/api/auth/login/route.ts`, `app/auth/callback/route.ts`, `app/api/auth/password-session/route.ts` (initialize after a verified session; no email leak behind a username)
- `lib/profile/currentProfile.ts` (incomplete state, `notGolfer`, `tripProfileId`)
- `app/api/account/profile/route.ts`, `lib/profile/profileEditServer.ts` (Finish setup goes through initialization; `createMyProfile` removed)
- `lib/profile/myProfileServer.ts`, `app/profile/page.tsx` (setup form for missing or incomplete, name prefilled)
- `lib/platform/golfTripsServer.ts` (incomplete may view, list, accept and decline; accept initializes a missing profile)
- `lib/platform/tournamentPlayersServer.ts`, `app/golf-trips/invite/[token]/page.tsx`, `app/tournaments/invite/[token]/page.tsx`
- `lib/profile/compareServer.ts`, `lib/platform/sharedRoundsServer.ts` (skip profiles with no username)
- 12 golfer-only routes and loaders: `=== "no-profile"` became `!== "ok"`
- `scripts/auth-local/setup.mjs` (V2 chain; `setup.mjs v1` rebuilds the V1 database), `register.mjs`, `reproduce.mts` (shared harness)

**Unchanged:** the signup / login / setup UI, the profile simulator, all V1 accounts, profiles, claims and golf data.
`lib/portal/matchPlayerUsername.ts` is now unused (only its own test imports it); I left it for you to decide.

## 4. Production migration requirements (not run)
1. Back up first (`docs/production-migration-checklist.md`).
2. Run **`supabase/profile_initialization.sql`** (one file). Everything it needs is already live (2026-10-16
   inspection): `schema`, `player_slots_full_name`, `profile_identity`, `profile_v1`, `player_rounds`,
   `golf_trip_scoring`, `shared_rounds`.
3. Then deploy the code. **Order matters:** the new admin invite route needs `create_player_claim_invitation`. With the
   SQL in place, the old code keeps working (it always sets username and name, and V1 profiles are complete).
4. Effect on live data: none rewritten. The 2 profile-less accounts get an incomplete profile at their next verified
   sign-in. The 6 unverified V1 accounts keep their profiles and claims.

## 5. Tests
- `lib/profile/profileInitializationDatabase.test.ts`: **9/9**. Verified-only; idempotent and concurrent; V1 untouched;
  Finish setup rules; claims only via a bound invitation; V1 claims kept; scoring / rounds / shared-round gate;
  incomplete accepts a trip invite; server-only grants.
- `lib/auth/signup.test.ts`: **3/3**.
- `scripts/auth-local/regression.mts` on the isolated stack: **55/55**. S3, S4, S6, S7, S8, S9 (incl. no password set,
  stranger can't sign in), S10, S11 regressions, bearer-token initialization, body ids ignored, Finish setup, trip
  accept while incomplete, scoring refused (route 409 + database), legacy trigger on password reset, V1 data
  preserved. 160 requests, all 127.0.0.1.
- Full suite, `tsc`, eslint: see the Step 2d report.

## 6. Remaining before launch
- **Linking an existing verified account to an old player** (admin invite answers 409) needs the player-claim review
  flow (request + admin approval, audited). The 4 production claims with no stored invite email would also go through
  it if they ever needed re-linking.
- **Invite links can be expired by a stranger:** a signup with a pending invitee's email makes Supabase send a fresh
  confirmation and expire the invite link. Nothing is deleted or taken over; the invitee recovers with the newest
  email plus "forgot password". Possible improvement: turn off public signups until V2 launch, or an "invite again"
  that works after the owner verifies.
- **Finish setup UX:** the existing form works. Prompting unfinished users from pages other than `/profile` (e.g. the
  trip page banner) is not built.
- **Account deletion / retention** (audit H2), **email change** (M2), password-change re-authentication and minimum
  length (M3), Supabase redirect URL settings (M4).
- `approve_profile_edit` and two legacy trigger functions are callable by `anon` on production (separate item).
- The old signup page still shows "Signing up as MM…" when opened with a code; the code no longer does anything.
- Hosted Supabase Auth version / rate limits are not verified (local is v2.197.0).
- Re-run the corrected read-only inspection to replace the false "different version" verdicts.
