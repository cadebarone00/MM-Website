# Add Player & Edit Name — Design Spec

## Goal

Two additions to Players & Teams
([app/portal/admin/master-settings/[year]/players-teams/page.tsx](../../../app/portal/admin/master-settings/%5Byear%5D/players-teams/page.tsx),
[PlayerSlotsAdmin.tsx](../../../components/portal/PlayerSlotsAdmin.tsx)):

1. **Add Player** — a "+ Add Player" control that creates a brand-new
   player from just a name and an email. Today every player on this site
   is a hand-written file in `lib/data/players/*.ts`; this is the first
   time a player can exist purely as a database row, created by Tiger at
   runtime with no code change or deploy.
2. **Edit name** — Tiger can correct a player's *visible* name, for any
   player, existing or new — without ever touching their `slug` (the
   permanent identifier every join, URL, and historical record uses).

Both build directly on the invite work already shipped this week
(`player_slots.email`, `POST /api/portal/tiger/invite`,
`POST /api/portal/tiger/player-email`) — a newly added player is simply a
`player_slots` row that starts unclaimed with no team, exactly like any
of the 13 existing players before they're invited.

## Background: why this isn't just "insert a row"

`lib/data/players/index.ts` exports `playerProfiles`, a hardcoded array
built from 13 imported files. Two things read that array (or its helpers
`getPlayerProfile`/`getPlayerDisplayName`/`getPlayerAvatar`/`getPlayerSlug`)
across roughly 64 files: pages that show a player who **already has
historical match/score data** (leaderboard, wagers, broadcast, past
scorecards, career stats — all for the 13 existing players and past
years only), and pages that show **whoever the current user or roster
entry is**, independent of history (the admin table, the portal home
screen, a player's own bio page).

A brand-new player has no historical data, so the first group of ~60
files is never actually called with their slug — nothing to change
there. Only the second group needs to learn "there might not be a
hand-written file for this slug" — that's the whole scope of this spec:

- Players & Teams' own row list (today built by mapping over the static
  13 — a new player wouldn't even appear as a row)
- The portal home screen (`app/portal/page.tsx`)
- The player's own "Edit My Bio" page (`app/portal/profile/page.tsx`,
  today hard-redirects if there's no hand-written file)
- The public bio page (`app/teams/[slug]/[player]/page.tsx`)
- The public "confirmed roster" block for the upcoming year
  (`getConfirmedRoster`, `ConfirmedRoster.tsx`)

Renaming one of the 13 *existing* players rides the same mechanism:
those 5 spots start preferring an override name when one is set; the
~60 historical/leaderboard/wagers/broadcast files are explicitly left
alone (see "Out of scope").

## Data model

New file `supabase/player_slots_full_name.sql`, a standalone migration
like the two before it (`player_slots_email.sql`,
`course_library_location.sql`) — `schema.sql` isn't kept in sync with
these one-off files (a pre-existing drift noted in `project_specs.md`,
not fixed here):

```sql
-- Run once in Supabase after player_slots_email.sql.
-- For a dynamically-added player (no lib/data/players/*.ts file), this
-- IS their name. For one of the 13 hand-written players, null means
-- "use the hand-written file's fullName" (the default, unchanged
-- behavior); a value here overrides it going forward (see the design
-- spec for exactly which pages honor the override).
alter table player_slots add column if not exists full_name text;

comment on column player_slots.full_name is 'Visible display name. Overrides the hand-written PlayerProfile.fullName when set; required for a player with no hand-written file.';
```

`player_slots.player_slug` stays the only identifier anything joins or
links on — this migration never touches it.

## Add Player

**UI**: a "+ Add Player" toggle above the table (same expand-panel
pattern as every other control on this page) opens two fields — Name,
Email — and a submit button. On success, the page reloads and the new
player appears as an ordinary unclaimed row: "No team," "Open," and
(because an email was given) "Send Invite" already enabled — reusing
100% of the invite flow shipped this week. No team assignment, no bio,
no photo — exactly the two fields asked for.

**Backend**: new `POST /api/portal/tiger/player-add`, host-gated
(`requireHost`), same create-then-validate shape as the rest of this
page's routes:

1. Validate `fullName` and `email` are non-empty strings.
2. Derive a slug: kebab-case the name (`"John Smith"` → `"john-smith"`).
   If that slug already exists (in `player_slots` **or** the static
   `playerProfiles` list — both pools share one namespace), append `-2`,
   `-3`, … until it doesn't.
3. Derive a username with `computePlayerUsername(fullName)` — the exact
   scheme the 13 existing players already use, and which its own doc
   comment already says applies "to any player, current or future."
   Collisions are vanishingly unlikely at this roster size, but insert
   with `on conflict do nothing` on `username` and, on a conflict,
   surface a clear error ("That name's username is already taken —
   try a slightly different spelling") rather than silently colliding
   two players onto one slot.
4. Insert one `player_slots` row: `{ player_slug, username, full_name:
   fullName, email, claimed_by: null }`.

## Edit name

**UI**: the existing "Edit email" panel (shipped this week) gains a
second field and becomes "Edit name & email" — one toggle, one panel,
Name and Email inputs, one Save. Applies to every row, static or
dynamic alike; pre-filled with whatever's currently displayed (the
override if set, otherwise the hand-written name).

**Backend**: new `POST /api/portal/tiger/player-name`, mirroring
`player-email` exactly:

- Validates `playerSlug` (string) and `fullName` (non-empty string —
  unlike email, a name can't be cleared to blank; the empty-clears-to-
  null convenience `player-email` has doesn't apply here).
- Updates `player_slots.full_name`.

The panel's Save button fires both requests (name, email) and reports
either error inline, matching how every other multi-field action on
this page already surfaces errors.

## The 5 spots that resolve a name/identity

Each of these already does server-side Supabase work today, so each
gets the same small addition rather than a shared new abstraction (the
lookups differ enough — one row already in hand vs. a fresh query — that
forcing one helper across all 5 would obscure more than it'd save):

1. **Players & Teams' row list** (`page.tsx`): today `rows` is built by
   mapping over the static `playerProfiles` array alone. It becomes the
   union of that array and every `player_slots` row not already in it
   (the dynamically-added ones), with `fullName` resolved per row as
   `slot?.full_name ?? staticProfile?.fullName ?? slot.player_slug`. No
   extra query — `slots` is already fetched.
2. **Portal home** (`app/portal/page.tsx`): `playerName` prefers
   `player_slots.full_name` over `playerProfile?.fullName` over
   `profile.display_name`. This page currently only creates the
   cookie-bound Supabase client, which can't read `player_slots` (no RLS
   policies at all — service-role only, same as everywhere else this
   table is read), so it needs one small addition: also create the
   service-role client (already the standard import in every other file
   that reads this table) and do one single-row lookup by `playerSlug`.
3. **Edit My Bio** (`app/portal/profile/page.tsx`): if
   `getPlayerProfileBySlug` finds nothing, synthesize a minimal
   `PlayerProfile` (`{ id: slug, slug, fullName: <player_slots.full_name>,
   avatarSrc: null, bio: "", history: [] }`) instead of redirecting away.
   If a static profile *does* exist but an override name is set, apply
   it to `fullName` before merging in the bio overrides.
4. **Public bio page** (`app/teams/[slug]/[player]/page.tsx`): identical
   fallback/override logic to #3.
5. **Confirmed roster** (`lib/data/activeSeasonOverlay.ts`'s
   `getConfirmedRoster`, `ConfirmedRoster.tsx`): resolve `displayName`
   and `avatarSrc` per entry inside `getConfirmedRoster` itself (already
   async/server-only) using the same override-then-static-then-slug
   order, and add them to `RosterEntry` as optional fields.
   `ConfirmedRoster.tsx` then just renders `entry.displayName` directly
   instead of calling `getPlayerDisplayName`/`getPlayerAvatar` itself —
   a simplification, not just a fix.

Avatar is unaffected by any of this beyond #5 reusing the existing
null-avatarSrc → generic-initials behavior the `Avatar` component
already has. No photo upload is part of this spec.

## Testing

Same pattern already established for every `tiger/**` route in this
codebase: `requireHost()` needs a real request lifecycle
(`next/headers`'s `cookies()`), so a plain `node:test` run can't
exercise an authenticated call. Each new route
(`player-add`, `player-name`) gets a `route.test.ts` covering the one
pure piece — an unauthenticated request is rejected before it ever
touches Supabase. `npm test`, `npx tsc --noEmit`, `npm run lint`, and
`npm run build` all stay clean throughout, matching every prior round.
Live verification (does a newly added player actually get a row, does
"Send Invite" work for them, does a rename actually show up in the 5
spots above) needs a real Supabase project, same caveat as the invite
feature before it.

## Out of scope

- **Renaming does not reach the ~60 historical/leaderboard/wagers/
  broadcast files.** Those pages read a static file's `fullName`
  directly and are, by this project's existing design, a frozen record
  of past years (`project_specs.md`: "Historical years are hand-entered
  once... there is no live sync for past years"). A rename shows up on
  the 5 forward-facing spots above immediately; it reaches a past
  tournament's leaderboard/scorecard/wagers page only if a developer
  also edits that player's hand-written file by hand later. Confirmed
  with Cade as the intended behavior — this should rarely if ever
  matter in practice.
- **No photo upload.** A new player, or a renamed existing one, keeps
  whatever avatar they already had (null → generic initials for a new
  player).
- **No way to undo/delete a player** once added, beyond what already
  exists (Unlink undoes a claim; there's no "remove this row entirely").
  Rare enough to not need its own tool yet.
- **No team pre-assignment from the Add Player form.** The existing
  Maroon/White buttons on the row handle that, unchanged, same as for
  any of the 13 players.

## What "done" looks like

- `supabase/player_slots_full_name.sql` written (run once by the user,
  same as every prior migration in this project).
- "+ Add Player" creates a real, invitable row with no code change.
- "Edit name & email" works on every row, static or dynamic.
- The 5 spots above show a resolved name (override, then hand-written,
  then slug) with no redirect/crash for a player with no hand-written
  file.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all
  clean.
