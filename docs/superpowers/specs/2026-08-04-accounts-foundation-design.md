# Accounts Foundation — Design Spec

## Vision

Wire up the currently-inert Sign Up / Login buttons (added as placeholders
in the mobile nav redesign, `docs/superpowers/specs/2026-08-04-mobile-home-nav-redesign-design.md`)
to a real accounts system. Anyone — fans, family, players — can create a
website account. Players and Tiger (the host/organizer) additionally get a
"Portal" they can access after logging in, via a fork screen. This spec
covers accounts, sessions, and the fork/portal *shell* only — no scoring,
pairings, or round-control logic. It replaces the old separate
"scorekeeper" app (a different Vercel project, code not in this repo),
which is no longer used; everything now lives in this site.

This is the first of four planned sub-projects for the full portal
rebuild:

1. **Accounts foundation** (this spec)
2. Player Portal — scoring (My Score / Partner's Score entry)
3. Host Tools ("Tiger") — pairings, round start/reset, live score editing
4. Decision: does portal scoring keep writing to the Google Sheet (so
   `appscript/live-feed.gs` keeps powering the public leaderboard
   unchanged), or does it move fully to the new database? Deferred until
   #2/#3 are designed.

## Backend

**Supabase** (managed Postgres + built-in Auth) is added as the site's
first real backend — the site currently has none (`project_specs.md`
lists "no database"). Supabase handles password hashing, session tokens,
and email-verification/reset emails, so this repo doesn't need to build
that plumbing by hand.

New env vars (added to `.env`, documented in a new `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used exclusively by Tiger's
  admin actions (assigning player usernames). Never sent to the browser.

Session handling uses `@supabase/ssr` with httpOnly cookies (server-set),
not localStorage — this replaces `lib/useAccountSession.ts`'s current
localStorage/token approach entirely.

## Data model (new Supabase tables)

**`profiles`** — one row per account, keyed to Supabase's `auth.users.id`:
- `id` (uuid, PK, = auth user id)
- `email`
- `display_name`
- `username` (text, unique, case-insensitive)
- `is_host` (bool, default false)
- `player_slug` (text, nullable — matches a slug in `lib/data/players`,
  e.g. `"kyle-schnabel"`)
- `created_at`

**`player_slots`** — one row per existing player, seeded once from
`lib/data/players` (13 rows today):
- `player_slug` (text, PK)
- `username` (text, nullable, unique — set by Tiger)
- `claimed_by` (uuid, nullable, FK → `profiles.id`)
- `claimed_at` (timestamptz, nullable)

Tiger's own account is a normal `profiles` row with `is_host = true`, set
manually (one-time, via the Supabase dashboard or a seed script) for
`cadebarone00@gmail.com`'s account after they sign up — not through the
public sign-up form.

## The "recognizable key" mechanism

One universal sign-up form for everyone (name, email, username, password).
No separate "I am a player" toggle. On submit:

1. Create the Supabase auth user + a `profiles` row.
2. Check `player_slots` for a row where `username` (case-insensitive)
   matches what was just typed **and** `claimed_by` is still null.
   - **Match:** set `player_slots.claimed_by`/`claimed_at`, and set the
     new `profiles.player_slug` to that slot's `player_slug`. Their
     display name/team/avatar going forward are read from the existing
     `lib/data/players` record for that slug (no duplicate data entry).
   - **No match:** it's an ordinary fan account — `player_slug` stays
     null.

Tiger assigns each player's username ahead of time on the admin page
(below) and tells that player what it is (text/email, outside this
system). Because only Tiger controls what value counts as a "player
username," it functions as the recognizable key the player proves
ownership of by signing up with it and choosing their own password.

## Pages

- **`/signup`** — name, email, username, password (+ confirm). Sends a
  Supabase verification email; account exists immediately but login is
  blocked until the email is confirmed (see Error handling).
- **`/login`** — username-or-email + password. Identical for fans,
  players, and Tiger.
- **`/forgot-password`** — Supabase's built-in reset-by-email flow, one
  request page + one set-new-password page.
- **`/account/choose`** — the fork screen. Shown immediately after a
  successful login **only if** `profiles.is_host` is true or
  `profiles.player_slug` is set. Two large choices:
  - **Website** → continue to wherever they were headed (or `/` by
    default), exactly like any other signed-in user.
  - **Portal** → `/portal`.

  Fan accounts (`is_host = false`, `player_slug = null`) never see this
  screen — they go straight to their destination after login.
- **`/portal`** — real, minimal landing page:
  - Player account: their own name, team, avatar, username (pulled from
    `lib/data/players` + `profiles`).
  - Tiger: a bare host landing (name + "Host" label). No pairings/round
    tools yet — those are sub-project #3.
  - No scoring UI yet — sub-project #2.
- **`/portal/admin`** — Tiger-only (redirects away if `!is_host`). A table
  of all 13 `lib/data/players` entries, each with an editable username
  field and its current claim status (unclaimed / claimed by whom). This
  is where Tiger sets player usernames. Uses the service-role key
  server-side to write `player_slots`.

`next.config.ts`'s rewrite of `/portal` → the old scorekeeper Vercel app
is deleted; `/portal` becomes a normal route in this Next.js app.

## UI wiring

- **`components/nav/AccountMenu.tsx`** (mobile account menu): the two
  `disabled` Sign Up / Login buttons become real `Link`s to `/signup` and
  `/login`.
- **`components/Header.tsx` / `components/AccountBadge.tsx`** (desktop):
  today `AccountBadge` renders `null` when signed out on desktop — there
  is currently no way to sign up or log in from a desktop browser at all.
  This spec adds visible Sign Up / Login controls to the desktop header
  when signed out, matching the mobile menu's behavior.
- **`lib/useAccountSession.ts`**: rewritten to read the Supabase session
  instead of localStorage. `AccountSession`'s `"host"`/`"player"` kinds
  are kept (now backed by `profiles.is_host`/`profiles.player_slug`
  instead of the old scorekeeper tokens), plus a new `"fan"` kind for
  everyone else. `AccountBadge`, `AccountMenu`, and `MorePanel` are
  updated for the new `"fan"` case (no Portal link/fork, otherwise
  identical to today's signed-in treatment).
- **`components/nav/MorePanel.tsx`**: its existing conditional `Portal`
  link (today gated on `session.kind === "player"`) is extended to also
  show for `"host"`.

## Error handling

- Duplicate username or email at sign-up → inline field error, no page
  reload.
- Wrong password or unknown username/email at login → single generic
  message ("Incorrect username/email or password") — never reveals which
  part was wrong, to avoid account enumeration.
- Login attempt on an unverified email → "Check your email to verify your
  account" with a resend-verification action.
- Two people submitting the same still-open player username at once → the
  `player_slots.username` unique constraint (or a transaction with a
  `claimed_by IS NULL` guard) lets exactly one succeed; the other sees
  "That username was just claimed — check with Tiger."
- Once a `player_slots` row is claimed, its username is locked in the
  admin UI (read-only) — Tiger can't silently change it out from under a
  live account. An explicit "Unlink" action (clears `claimed_by`/
  `claimed_at`, does **not** delete the linked `profiles` row or log that
  account out) exists for correcting mistakes, separate from editing the
  username itself.
- Supabase/network failure during sign-up or login → inline "Something
  went wrong, try again" — no partial account states surfaced to the
  user (Supabase's auth call either fully succeeds or the `profiles`
  row is never created).

## Testing

- Sign-up creates both the auth user and the matching `profiles` row.
- Signing up with a Tiger-assigned, unclaimed player username correctly
  sets `player_slug`/`claimed_by`/`claimed_at` and pulls the right name/
  team/avatar from `lib/data/players`.
- Signing up with any other available username creates a plain fan
  account (`player_slug` stays null).
- Login persists across a page reload (cookie-based session, not
  localStorage).
- `/account/choose` appears only for host/player accounts, never for fan
  accounts.
- `/portal/admin` redirects non-host accounts away.
- Manual walkthrough on `npm run dev`: fan sign-up end to end; Tiger
  setting a player username on `/portal/admin`; that player signing up
  with it and landing on the fork screen; choosing Portal and seeing
  correct identity info; choosing Website and landing normally; desktop
  header now shows working Sign Up/Login when signed out.

## Explicitly out of scope

- Scoring, pairings, round start/reset, live score editing — sub-projects
  #2 and #3.
- Whether portal scoring keeps writing to the Google Sheet or moves fully
  to the new database — sub-project #4, deferred.
- Real content for `/my-team`, `/fantasy`, `/vault`, `/merchandise`,
  `/settings` — these stay "Coming soon" stubs exactly as the mobile nav
  redesign left them.
- Any change to `/leaderboard`, `/teams`, `/schedule`, `/history`, or the
  public live-feed pipeline.
- Social login (Google/Apple sign-in) — email/username + password only,
  for now.
