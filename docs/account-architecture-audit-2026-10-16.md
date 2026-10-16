# The Maroon — Account & Profile Architecture Audit

**Date:** 2026-10-16 · **Type:** read-only (no code, data, SQL, emails or accounts were changed or created)
**Method:** read the repository's code, SQL files and tests. **No database was queried**, so nothing here proves what is
installed in the live Supabase project. Database status comes only from the owner's past confirmations (noted per file).

---

## 1. Current architecture

```
                         ┌──────────────────────────── Browser / future Capacitor iOS shell ───────────────────────────┐
                         │  Pages (App Router)            fetch("/api/...")          Supabase JS (browser): Realtime    │
                         │                                                           read-only on public live tables    │
                         └──────────────┬───────────────────────────┬────────────────────────────┬──────────────────────┘
                                        │ sb-* auth cookies          │                            │ anon key
                         ┌──────────────▼───────────────────────────▼──────────┐                 │
                         │ middleware.ts  (refreshes session: auth.getUser())   │                 │
                         ├──────────────────────────────────────────────────────┤                 │
                         │ Server Components + Route Handlers (Vercel)          │                 │
                         │  • createSupabaseServerClient()  → acts AS the user  │                 │
                         │  • getCurrentProfile()  → { account, profileId }     │                 │
                         │  • createSupabaseServiceRoleClient() → BYPASSES RLS  │  (151 files)    │
                         │    then calls SECURITY DEFINER RPCs with p_profile    │                 │
                         │    taken from the session                             │                 │
                         └──────────────┬───────────────────────────────────────┘                 │
                                        │                                                          │
┌───────────────────────────────────────▼──────────────────────────────────────────────────────────▼──────────────┐
│ Supabase                                                                                                         │
│  auth.users (UUID) ──1:1── profiles.id (PK = FK → auth.users, ON DELETE CASCADE)                                 │
│                              │  username (unique, case-insensitive), display_name, email (copy), bio,            │
│                              │  avatar_path, rounds_visibility, is_host (global), player_slug (legacy)          │
│        ┌─────────────────────┼──────────────────────┬────────────────────────┬───────────────────────────┐       │
│        ▼                     ▼                      ▼                        ▼                           ▼       │
│  golf_trip_members     tournament_players     player_rounds          shared_round_players     historical_participants│
│  (profile_id NULL      (profile_id NULL       (one per round,        (+ shared_rounds.host)    (profile_id NULL     │
│   until invite         until claimed)          source of truth)                                 until linked)      │
│   accepted)             └─ edition_roster                                                                       │
│   └─ scoring_group_players ─ hole_score_entries ─ scorecard_submissions ──publish──► player_rounds              │
│                                                                                                                  │
│  LEGACY (still live for The Maroon): player_slots ⇄ profiles.player_slug, live_roster, handicap_rounds (by slug) │
│  Storage: profile-photos bucket (public read)                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Authorization model in one sentence:** every table has Row Level Security switched on and is closed to browsers by
default; almost all reads and writes go through the Next.js server using the service-role key, which calls
`SECURITY DEFINER` functions that are granted to `service_role` only and receive the acting profile id from the server
session. So per-user rules are enforced **in the database functions**, but **which user is acting** is decided by
Next.js code, not by the database.

---

## 2. Inventory

### Application code

| Area | Files |
|---|---|
| Session plumbing | `middleware.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts` |
| Auth API | `app/api/auth/{signup,login,signout,forgot-password,reset-password,password-session,resend-verification}/route.ts`, `app/auth/callback/route.ts`, `lib/auth/passwordSession.ts`, `lib/auth/returnTo.ts` |
| Auth pages | `app/{signup,login,login/email,forgot-password,reset-password,new-user,account/choose}/`, `components/auth/*` |
| Admin account creation | `app/api/portal/admin/invite/route.ts` (`inviteUserByEmail` + profile insert) |
| Profile identity | `lib/profile/currentProfile.ts` (`getCurrentProfile`), `profileIdentity.ts` |
| Profile edit / setup | `app/api/account/profile/route.ts`, `lib/profile/profileEdit*.ts`, `app/profile/edit`, `components/profile/ProfileForm.tsx` |
| Profile read model | `lib/profile/profileReadModel*.ts`, `app/profile/page.tsx`, `app/profile/[username]` |
| Photo, privacy | `app/api/account/photo`, `lib/profile/profilePhoto.ts`, `app/api/account/privacy`, `app/settings` |
| Rounds | `lib/platform/playerRounds*.ts`, `app/rounds/new`, `app/api/rounds/**`, `lib/platform/sharedRounds*` |
| Trips & invites | `lib/platform/golfTripsServer.ts`, `golfTripInvitations.ts`, `golfTripMembers.ts`, `app/api/golf-trips/**`, `app/golf-trips/invite/[token]` |
| Tournaments & invites | `lib/platform/tournamentPlayers*.ts`, `requireTournamentRole`, `app/api/platform/**`, `app/tournaments/invite/[token]` |
| Friends / compare | `lib/profile/friendsServer.ts`, `compareServer.ts`, `app/api/profile/compare` |

### Database objects (by file)

| File | Account-related objects |
|---|---|
| `schema.sql` | `profiles`, `player_slots`, RLS `profiles_select_own`, wagers tables, `handicap_rounds` (by slug) |
| `profile_identity.sql` | unique indexes: one profile per slot, one slot per profile, one player per tournament per profile |
| `profile_v1.sql` | `profiles.bio`; `create_my_profile`, `update_my_profile`, `profile_username_problem`, `profile_id_for_username`, `list_edition_player_profiles` |
| `profile_photos.sql` | `profiles.avatar_path`, storage bucket `profile-photos` |
| `profile_read_model.sql` | `get_profile_history(viewer, subject)` |
| `player_rounds.sql` | `player_rounds`, `profiles.rounds_visibility`, `save_player_round`, `list_my_player_rounds`, visibility RPCs, `publish_player_round` |
| `golf_trips.sql` | `golf_trips`, `golf_trip_members`, `golf_trip_rounds`, `is_golf_trip_member`, `get_golf_trip` |
| `golf_trip_invitations.sql` | invite token hash, `invite/accept/decline/remove/leave` RPCs |
| `golf_trip_scoring*.sql` | `scoring_groups`, `scoring_group_players`, `hole_score_entries`, `scorecard_submissions`, corrections |
| `tournament_player_identity.sql` | invite-link claiming, no-transfer trigger, slot → profile sync |
| `platform_foundation.sql` | `tournaments`, `tournament_members`, `tournament_players`, `tournament_creator_access` |
| `shared_rounds.sql` | `shared_rounds`, `shared_round_players`, `shared_round_holes` |
| `historical_import.sql` | `historical_*` (participants with nullable `profile_id`, link requests + audit events) |
| `player_slots_password_created.sql` | trigger on `auth.users` (legacy slot sync) |

Counts: **164** `SECURITY DEFINER` functions across `supabase/*.sql`; **151** app files use the service-role client.

---

## 3. Implementation status

| # | Requirement | Status | Evidence / note |
|---|---|---|---|
| 1 | One immutable auth UUID per account | **Built** | `profiles.id` = `auth.users.id` (PK + FK) |
| 2 | Exactly one canonical profile | **Partial** | At most one is guaranteed. Zero is possible: signup inserts the profile in a second, non-atomic step. Recovery exists (`create_my_profile` is idempotent; `/profile` shows Finish setup) |
| 3 | Profile is the central identity | **Partial** | True for trips, rounds, tournaments, shared rounds. The legacy Maroon live scoring still keys on `player_slug` (≈106 files) |
| 4 | Many trips/tournaments, one account | **Built** | Relationship tables per feature (`golf_trip_members`, `tournament_players`, …) |
| 5 | Teams & roles are contextual | **Partial** | Teams: yes (never on profiles). Roles: trip/tournament roles are contextual, but `profiles.is_host` is a **global** admin flag |
| 6 | Stats survive username/setting changes | **Built** | Everything references `profile_id`. Old `/profile/<username>` links break after a rename (no redirect) |
| 7 | Historical records linkable without merging | **Partial** | DB built (`historical_participants.profile_id` NULL until an audited link request is approved); **no link UI or API** |
| 8 | Private data protected by the database | **Partial** | RLS deny-by-default on every table ✔; per-user checks live in definer functions ✔; but the acting user is chosen by Next.js code holding the service key |
| 9 | Invites for existing and new users | **Built (needs real-email test)** | Invite page → sign up with `returnTo` → verify → sign in → back to invite → accept |
| 10 | Same identity on web and iOS | **Unknown** | No Capacitor project yet. Cookie sessions and email/invite links need a plan for the iOS shell (§4-G) |

### Lifecycle (section E)

| Case | Status | Note |
|---|---|---|
| Signup + email verification | **Built** | Verification lands on Supabase's configured Site URL (no `emailRedirectTo` in code); the user signs in manually |
| Existing email / username conflict | **Partial** | Generic "already taken" message. See finding H3 for a risky cleanup path |
| Concurrent signups | **Partial** | DB unique index on `lower(username)` protects the data; the losing request deletes its own auth user |
| Failed profile creation | **Built** | Finish-setup recovery via idempotent `create_my_profile` |
| Sign-out / expiry | **Built** | `signOut()` + removes this device's push subscription; middleware refreshes tokens |
| Password reset | **Built** | Code exchange at `/auth/callback` → `/reset-password` |
| Email change | **Missing** | No flow; `profiles.email` is a copy that would go stale |
| Username change | **Built** | `update_my_profile` with validation and unique check |
| Account recovery | **Built (password only)** | No other recovery path |
| Account deletion & retention | **Missing** | No flow, and the current foreign keys would block it or delete other people's data (H2) |
| Historical identity claiming | **Partial** | DB only (see #7) |
| Join a trip before/after account | **Built** | Invite rows hold `profile_id` NULL until accepted |

---

## 4. Findings (most important first)

**H1 — The live database state cannot be verified.** Migrations are pasted by hand into the SQL editor. There is no
`supabase/migrations` folder and no table recording what ran. `docs/production-migration-checklist.md` lists only the
`platform_*` files, so the profile, rounds, trip and scoring files have no production run order. *Fix first:* a
read-only "what's installed" query for the owner to run, plus one ordered manifest for every file.

**H2 — Account deletion is missing, and the schema would break it.** This is required for an iOS app: Apple requires
in-app account deletion when you can create an account in the app. Deleting an `auth.users` row cascades to `profiles`, and then:
- it is **blocked** by FKs with no `ON DELETE` rule: `scorecard_submissions.submitted_by`,
  `scorecard_submission_revisions.submitted_by`, `scorecard_correction_requests.requested_by/decided_by`,
  `scoring_groups.created_by`, `wagers_market_settlements.settled_by`;
- or it **destroys other people's data**: `golf_trips.created_by` CASCADE deletes the whole trip for every member;
  `shared_rounds.host` CASCADE deletes everyone's shared round; `scoring_group_players` CASCADE removes the attester's
  entries on other golfers' cards.

  The design decision needed is a retention policy (anonymize vs. delete, organizer hand-off) before any code.

**H3 — The signup cleanup path can delete an account (needs verification in a test project).**
`app/api/auth/signup/route.ts` calls `auth.signUp`, then inserts the profile with the service key. If the insert fails, it
calls `auth.admin.deleteUser(user.id)`. If Supabase ever returns an **existing** user's real id, that deletes a real
account. That is believed to happen when the same email signs up again before verifying. The profile insert then fails
on the primary key, and the delete removes the earlier, still-pending account. *Fix direction:* only delete a
user this request created (`identities.length > 0` / `created_at` check), or create profiles with an `auth.users`
insert trigger / idempotent `create_my_profile`.

**M1 — The service key is the real security boundary.** RLS is closed by default, which is correct, but 151 files hold
the key. One route that trusts a body field, or skips `getCurrentProfile()`, bypasses everything. The sampled routes
do take identity from the session (golf trips, profile, shared rounds, compare). The comment in
`lib/supabase/server.ts` ("only ever used for player_slots…") is stale. *Mitigation:* a route-authorization test that calls
every mutating route signed out and as a second user.

**M2 — `profiles.email` is a copy of the auth email.** Nothing keeps it in sync. Username login resolves through it, so any
email change made in Supabase breaks username login for that person.

**M3 — Password changes need no re-authentication.** `/api/auth/reset-password` updates the password for **any** signed-in
session, not just a recovery session. The minimum length is 6. Supabase's "Secure password change" setting and a longer
minimum are worth turning on.

**M4 — Email links depend on dashboard configuration.** Signup sets no `emailRedirectTo`; `/auth/callback` always
redirects to `/reset-password`. If the Supabase Site URL or redirect allow-list is set to `/auth/callback`, verification
emails land on the password page. Verify the dashboard settings: Site URL, Redirect URLs, Confirm email, SMTP sender.

**M5 — Invite links are bearer tokens.** Trip invites store only a hash (good), but the link has no expiry and no email
match. Whoever opens a forwarded link takes the spot. The organizer can regenerate it. This is a product decision; document it.

**M6 — There are two identity systems.** The legacy `player_slots` / `profiles.player_slug` path is still live. That
includes an `MM…` username prefix in signup that auto-claims a slot. It is guarded by unique indexes
(`profile_identity.sql`), but it is a second way to "become" a player. The planned historical-link flow is meant to
replace it.

**L1** — `middleware.ts`: Next.js 16 renamed Middleware to **Proxy** (`proxy.ts`). The old name is deprecated but still
works; rename it when convenient and confirm with a build. Also check whether `@supabase/ssr` 0.12's `setAll` cache
headers should be passed through.
**L2** — Membership helper functions (`is_golf_trip_member`, `can_see_scoring_group`, …) are callable by any signed-in
user with any profile id. That is a yes/no oracle, and it needs the target's UUID. Low risk.
**L3** — Login returns the account email in the "unverified" response when a username was entered.
**L4** — There is no app-level rate limiting on login, signup or forgot-password; the app relies on Supabase Auth limits.
**L5** — The global `profiles.is_host` flag conflicts with "roles are contextual" (requirement 5).

### G. iOS (Capacitor) readiness notes
- Same accounts: yes, if the app loads the hosted site. Sessions are HTTP-only cookies set by Vercel routes, so a
  bundled offline app would need a token-based client instead.
- Email verification, password reset and invite links need Universal Links (or a custom scheme) to open in the app.
- Apple: account deletion is required (H2). "Sign in with Apple" is only required if another social login is added
  (today it is email only).

---

## 5. Migration files (account-related) and confirmation status

"Confirmed" means the owner reported running it; nothing was queried for this audit.

| File | Live (production) | Test (dev) DB |
|---|---|---|
| `schema.sql` | Assumed (the live site depends on it) | Yes |
| `player_slots_full_name.sql` | **Confirmed** (owner, earlier) | — |
| `platform_foundation.sql` (C1) | **Confirmed 2026-10-01** | Yes |
| `platform_editions.sql` (C2), CREATE, DASHBOARD, PUBLIC SITE, ACCESS REQUESTS, PAST, ACTIVE, ACTIVITY | **Not run** as of 2026-10-01 | Unknown |
| `profile_identity.sql` | Unknown (not run as of 2026-10-08) | **Confirmed 2026-10-10** |
| `tournament_player_identity.sql` | Unknown | **Confirmed 2026-10-10** |
| `platform_next_edition.sql` | Unknown | **Confirmed 2026-10-10** |
| `player_rounds.sql` | Unknown | **Confirmed 2026-10-10** |
| `profile_read_model.sql` | Unknown | **Confirmed 2026-10-10** |
| `golf_trip_scoring_corrections.sql` (+ scoring stack it needs) | Unknown | **Confirmed 2026-10-10** (verify_7b READY) |
| `golf_trips.sql`, `golf_trip_flights.sql`, `golf_trip_invitations.sql` | Unknown | Ran once; re-run in order was requested 2026-10-08, completion not recorded |
| `profile_v1.sql` | Unknown | Unknown |
| `profile_photos.sql` | Unknown | Unknown |
| `shared_rounds.sql` | Unknown | Unknown |
| `historical_import.sql` | Unknown | Not run (2026-10-10) |
| `golf_trip_setup.sql`, `golf_trip_momentum.sql` | Unknown | Momentum: **not installed** (2026-10-10) |

---

## 6. Testing readiness

**Exists:** 248 unit test files; 14 database tests on PGlite (an in-memory Postgres). 9 of those switch to the
`authenticated` role to check permissions (player rounds, profile V1, read model, trip scoring, invitations, historical
import, momentum, settings, legacy import). There are also browser scripts in `scripts/test-*-browser.*` (profile,
trip invite, tournament invite, …).

**Missing / recommended (all runnable against a separate test Supabase project or `supabase start` locally, with
throw-away test accounts):**
1. **Auth end-to-end:** signup → verification email (local Mailpit inbox) → login → logout → reset → session restore
   after token expiry. Include the H3 case: sign up twice with the same unverified email.
2. **RLS isolation:** two test users with real JWTs, calling PostgREST directly. Every table should return nothing,
   and every non-granted RPC should be refused.
3. **Route authorization sweep:** every mutating `/api/**` route, called signed out, as a non-member and as a member;
   expect 401/403/404.
4. **Concurrency:** parallel signups with the same username; two accounts accepting the same invite at once; a double
   submit of a scorecard.
5. **Migrations:** apply every file in manifest order on an empty database, run the whole set twice (idempotency), then
   a "what's installed" check that matches the manifest.
6. **Lifecycle:** once deletion is designed, delete each kind of member (organizer, attester, host) and assert the other
   members' data stays intact.
