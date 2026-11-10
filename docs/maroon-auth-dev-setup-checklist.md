# maroon-auth-dev — development sign-in environment checklist

2026-10-29. **Read-only preparation.** Nothing in this document has been created, changed or run. Every step below is done
by the owner, by hand, and only on the new development project. Production Supabase, Vercel, the shared local test
stacks (`maroon-auth-test` / `maroon-auth-main`) and the main `MM-Website` folder's `.env` are not touched.

Status of Google / Apple sign-in: **built and tested locally only (no real Google / Apple yet).** It is not
"provider-verified" until the real tests in section 8 pass on this project.

Placeholders: `<dev-ref>` = the new project's reference id (the `abcd1234` in `https://abcd1234.supabase.co`). It is not
a secret. Nothing else in this document should ever be replaced with a real secret inside a file that's committed.

---

## 1. How the app actually loads its settings (so dev never mixes with production)

- `npm run dev` = `next dev -p 3001`. Next.js reads, highest priority first: values already set in the shell →
  `.env.development.local` → `.env.local` → `.env.development` → `.env`. A value set earlier in that list wins.
- `.env*` files are git-ignored (except `.env.example`), so they never reach GitHub.
- This folder's existing `.env` already holds `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for the
  current (production) project. **Do not edit it, and do not add dev values to this folder at all.** Another terminal's
  dev server runs here on port 3001, so a new `.env.development.local` here would silently switch that terminal to the
  dev project the next time it restarts.
- Server code reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/server.ts`,
  `middleware.ts`, `lib/auth/oauthServer.ts`). Browser code reads `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`lib/supabase/client.ts`). All five must point at the **same** dev project.
- The Google / Apple buttons appear only when the project's public `/auth/v1/settings` says that provider is on
  (`lib/auth/oauthServer.ts`), so the production site keeps showing no buttons.
- The `scripts/auth-local/*` tests delete every `SUPABASE_*` variable and refuse to run against anything but a local
  Docker stack, so they can never touch this project.

**Recommended separation:** a second checkout just for this work, with its own settings file and port.

```powershell
# from C:\Users\Owner\Documents\GitHub\MM-Website (adds a folder; changes nothing in this one)
git worktree add ..\MM-Website-authdev main
cd ..\MM-Website-authdev
npm install
# create .env.development.local here (below), then:
npx next dev -p 3002
```

`..\MM-Website-authdev\.env.development.local` (dev project values only):

| Variable | Where to find it (dev project) | Secret? |
| --- | --- | --- |
| `SUPABASE_URL` | Project Settings → API → Project URL (`https://<dev-ref>.supabase.co`) | no |
| `SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` key | no (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` key | **YES** — this file only |
| `NEXT_PUBLIC_SUPABASE_URL` | same as `SUPABASE_URL` | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as `SUPABASE_ANON_KEY` | no |

Leave out everything else from production `.env` (OpenAI, R2, Resend / `EMAIL_FROM`, Python API, VAPID, `CRON_SECRET`,
Instagram, Google Places). Leave `MAROON_V2_ONBOARDING` and `MAROON_ACCOUNT_ENFORCEMENT` **unset** for the first round of
tests (old `/login` → `/profile` path). Google / Apple secrets are **not** app variables at all; they go only in the
Supabase dashboard (section 4).

---

## 2. Create the project (owner, by hand)

1. supabase.com → New project → name **`maroon-auth-dev`**. Pick a new database password and keep it in a password
   manager (not in any file in the repo).
2. Write down `<dev-ref>`.
3. Before every later step, check the dashboard's top-left project name says `maroon-auth-dev`.

---

## 3. Google Cloud (web sign-in)

1. console.cloud.google.com → new project **"The Maroon Dev"** (separate from anything production will use).
2. APIs & Services → **OAuth consent screen** (Google Auth Platform → Branding / Audience):
   - User type **External**, publishing status **Testing**.
   - App name "The Maroon (Dev)", your support email.
   - Scopes: only `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (no sensitive scopes).
   - **Test users:** add each Gmail that will test. Only these can sign in while in Testing.
3. **Credentials → Create credentials → OAuth client ID → Web application**, name "maroon-auth-dev web":
   - Authorized JavaScript origins: none needed.
   - **Authorized redirect URIs:** `https://<dev-ref>.supabase.co/auth/v1/callback`
4. Keep the **Client ID** (public) and **Client secret** (secret) for section 4. Android / iOS client IDs come later.

---

## 4. Apple Developer (web sign-in)

Needs the paid Apple Developer Program membership. developer.apple.com → Certificates, Identifiers & Profiles.

1. **Identifiers → App IDs → +** → App, Bundle ID `site.themaroon.app` (explicit), tick **Sign in with Apple**.
   (The real app will reuse this App ID later.)
2. **Identifiers → Services IDs → +** → identifier **`site.themaroon.web.dev`**, description "The Maroon web (dev)".
   Open it → tick **Sign in with Apple** → **Configure**:
   - Primary App ID: `site.themaroon.app`
   - Domains and Subdomains: `<dev-ref>.supabase.co`
   - Return URLs: `https://<dev-ref>.supabase.co/auth/v1/callback`
   - If Apple asks you to verify a domain file, stop and tell me (you can't host files on supabase.co).
3. **Keys → +** → name "maroon-auth-dev siwa", tick **Sign in with Apple** → Configure → primary App ID
   `site.themaroon.app` → download the **`.p8`** (one download only). Note the **Key ID** and your **Team ID** (top right).
   Store the `.p8` outside every repo folder. Never paste it into chat.
4. Make the Supabase "Secret Key (for OAuth)": a JWT signed with the `.p8` (Team ID, Key ID, Services ID). Use the
   generator in Supabase's "Login with Apple" guide. **It expires after at most 6 months** — put a calendar reminder.
5. Optional, only if you want Supabase emails to reach Hide My Email addresses: Apple → Services → Sign in with Apple
   for Email Communication → register the sending domain. Not needed for sign-in itself.

---

## 5. Supabase dev project settings (`maroon-auth-dev` only)

Authentication → **Sign In / Providers**:

| Setting | Value |
| --- | --- |
| Email | On; **Confirm email ON** (matches production) |
| Minimum password length | 12 (the app's rule, `lib/auth/passwordPolicy.ts`) |
| Secure password change | On |
| Google | On; Client ID + Client secret from §3; Skip nonce check **off**; Allow users without an email **off** |
| Apple | On; Client IDs = `site.themaroon.web.dev`; Secret Key = JWT from §4.4; Allow users without an email **off** |
| **Manual linking** | **Leave OFF** (Settings linking isn't built; owner instruction 2026-10-29) |
| Anonymous sign-ins | Off |

Authentication → **URL Configuration**:

| Setting | Value |
| --- | --- |
| Site URL | `http://localhost:3002` |
| Redirect URLs | `http://localhost:3002/**` |

Exact sign-in round trip on this project:
`http://localhost:3002/api/auth/oauth` (button) → Google / Apple → `https://<dev-ref>.supabase.co/auth/v1/callback`
→ `http://localhost:3002/auth/callback?flow=oauth[&returnTo=…]` → `/profile` (or the invite page).

Email sending: the hosted project's built-in mailer allows only a few emails per hour, which limits email / password
tests. Google / Apple tests send no email. Don't connect production Resend to this project.

---

## 6. Database files, in dependency order

The same 42 files, same order, as `scripts/auth-local/setup.mjs` (which builds the local test stacks from them):

1. `supabase/schema.sql`
2. `supabase/career_live_archive.sql`
3. `supabase/course_library_location.sql`
4. `supabase/course_library_tee_setups.sql`
5. `supabase/archived_handicap_tees.sql`
6. `supabase/live_match_publication.sql`
7. `supabase/live_hole_submissions.sql`
8. `supabase/hole_shot_directions.sql`
9. `supabase/hole_shot_directions_penalty.sql`
10. `supabase/round_format_setups.sql`
11. `supabase/scoring_reliability.sql`
12. `supabase/live_round_submission.sql`
13. `supabase/player_slots_email.sql`
14. `supabase/player_slots_full_name.sql`
15. `supabase/tournament_timezone.sql`
16. `supabase/platform_foundation.sql`
17. `supabase/platform_editions.sql`
18. `supabase/platform_create_tournament.sql`
19. `supabase/platform_dashboard.sql`
20. `supabase/platform_public_site.sql`
21. `supabase/platform_access_requests.sql`
22. `supabase/platform_past_editions.sql`
23. `supabase/platform_active_editions.sql`
24. `supabase/platform_activity.sql`
25. `supabase/profile_identity.sql`
26. `supabase/tournament_player_identity.sql`
27. `supabase/player_slots_password_created.sql`
28. `supabase/golf_trips.sql`
29. `supabase/golf_trip_invitations.sql`
30. `supabase/golf_trip_flights.sql`
31. `supabase/golf_trip_scoring.sql`
32. `supabase/golf_trip_scoring_fix_groups.sql`
33. `supabase/golf_trip_scoring_realtime.sql`
34. `supabase/golf_trip_scoring_offline.sql`
35. `supabase/golf_trip_scoring_submission.sql`
36. `supabase/player_rounds.sql`
37. `supabase/golf_trip_scoring_corrections.sql`
38. `supabase/shared_rounds.sql`
39. `supabase/profile_v1.sql`
40. `supabase/profile_photos.sql`
41. `supabase/profile_initialization.sql` — the one-profile-per-account step sign-in relies on
42. `supabase/account_deletion.sql`

Optional, after 42 (makes `/profile` fuller; without them those sections just show "unavailable"):

43. `supabase/profile_friends.sql` (needs `schema.sql`)
44. `supabase/profile_read_model.sql` (needs `platform_foundation`, `golf_trips`, `player_rounds`)

**Not on this project without separate approval** (their own headers say "do not run on a hosted project without
separate approval"; only needed for the Phase 6 onboarding screens): `auth_code_attempts.sql`,
`account_activation_enforcement.sql`. `account_activation.sql` is inert but belongs with that phase too — leave it out
for now.

---

## 7. Safe database setup procedure

1. Confirm the dashboard says `maroon-auth-dev` and the URL contains `<dev-ref>`.
2. SQL Editor → New query → paste **one** file from §6 → Run. It must say "Success". Next file, in order.
   On the first error: stop, don't edit the file, send me the error text (no keys) and the file number.
3. Read-only checks afterwards:
   - `select count(*) from public.profiles;` → `0`
   - `select proname from pg_proc where proname in ('initialize_my_profile','complete_my_profile','account_deletion_state') order by 1;` → 3 rows
4. No production data is copied, ever. No seed data: test accounts are made by signing up.
5. When finished with the project: pause or delete it from its own Settings page (owner's call).

(If pasting 42 files is too slow: on your approval I can write a small runner that refuses to run unless the
connection is `<dev-ref>`. Not written yet.)

---

## 8. Real Google / Apple tests (on `http://localhost:3002`, flags unset)

After each test, the read-only checks in §8.4 confirm identities and profiles.

### 8.1 Google
| # | Steps | Expected |
| --- | --- | --- |
| G1 | New Gmail (on test-user list) → `/login` → Continue with Google | `/profile` shows profile **setup**; 1 Auth user, identity `google`, 1 profile with the same id |
| G2 | Finish setup → sign out → Continue with Google again | Normal profile, **no setup**, same id, still 1 profile |
| G3 | Continue with Google → back out of the account picker | `/login` "Sign-in was cancelled.", not signed in |
| G4 | Gmail **not** on the test-user list | Google blocks it → `/login` with cancelled / didn't-finish message, no account made |
| G5 | Start from an invite page (`/login?next=/golf-trips/invite/…`) | Returns to that invite page after Google |

### 8.2 Apple
| # | Steps | Expected |
| --- | --- | --- |
| A1 | New Apple ID → Continue with Apple → **Share My Email** | Setup; identity `apple`; 1 profile |
| A2 | Finish setup → sign out → Continue with Apple | Normal profile, no setup, same id |
| A3 | Another Apple ID (or remove the app at appleid.apple.com → Sign in with Apple → Stop using) → **Hide My Email** | New account with an `@privaterelay.appleid.com` email, its own profile, **not** joined to any other account |
| A4 | Continue with Apple → Cancel | `/login` "Sign-in was cancelled.", not signed in |

### 8.3 Same-email (automatic) linking and duplicates — D1
| # | Steps | Expected |
| --- | --- | --- |
| L1 | Email + password account with Gmail X → verify the email → finish setup. Sign out. Continue with Google as X | Same account and profile (no setup); that user now has identities `email` + `google`; still 1 profile |
| L2 | Email + password account with Gmail Y, **don't** verify. Then Continue with Google as Y | **Observe and report, don't assume.** Must not end with two profiles for one person or a session for the unverified password account |
| L3 | Apple Hide My Email user (A3) and an email account for the same person | Two separate accounts and profiles; nothing merged |
| L4 | Two different Google users with the same display name | Two accounts, two profiles (never merged by name) |

Settings linking (manual linking) and social-only account deletion are **not** tested yet: not built, and manual
linking stays off.

### 8.4 Read-only checks (dev SQL Editor)
```sql
-- identities per user
select u.id, u.email, array_agg(i.provider order by i.provider) as providers
from auth.users u join auth.identities i on i.user_id = u.id group by u.id, u.email order by u.created_at;
-- every account has exactly one profile (no extras, report any account with none)
select u.id, u.email, (select count(*) from public.profiles p where p.id = u.id) as profiles
from auth.users u order by u.created_at;
-- the same email on more than one account (expected only for L2 if Supabase splits it — report it)
select lower(email), count(*) from auth.users group by 1 having count(*) > 1;
```

Provider sign-in counts as **verified** only when G1–G5 and A1–A4 pass and L1–L4 show no unwanted merges or duplicate
profiles. Until then: "built, locally tested, not provider-verified".

---

## 9. Keeping dev and production credentials apart

- Dev has its own Google Cloud project, its own Apple Services ID (`site.themaroon.web.dev`) and its own `.p8` key.
  Production later gets **new** Google clients, its own Services ID (e.g. `site.themaroon.web`) and its own key, set up
  only with separate approval.
- Where each secret may live: Google client secret and Apple JWT → dev Supabase dashboard only. Dev service-role key →
  `..\MM-Website-authdev\.env.development.local` only. `.p8` → outside all repo folders.
- Never: in chat, in a commit, in a `NEXT_PUBLIC_` variable, in Vercel, in this folder's `.env`, in the phone app bundle.
- Production Supabase: no provider turned on, no redirect URL added, manual linking off, no SQL run — unchanged.
- If any secret is ever pasted somewhere it shouldn't be: regenerate it (new Google client secret / revoke the Apple
  key and make a new JWT / roll the dev service-role key).

## 10. What to send me afterwards

Only: "maroon-auth-dev ready", the `<dev-ref>`, which §6 files ran, and the results of §8. No keys.
