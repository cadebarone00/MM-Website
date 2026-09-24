# Add Player & Edit Name — Design Spec

## Goal

Three things, all landing together because the third reshapes where the
first two live:

1. **Add Player** — a "+ Add Player" control that creates a brand-new
   player from just a name and an email. Today every player on this site
   is a hand-written file in `lib/data/players/*.ts`; this is the first
   time a player can exist purely as a database row, created by Tiger at
   runtime with no code change or deploy.
2. **Edit name** — Tiger can correct a player's *visible* name, for any
   player, existing or new — without ever touching their `slug` (the
   permanent identifier every join, URL, and historical record uses).
3. **Split player identity out of the per-year page.** Today
   [Players & Teams](../../../app/portal/admin/master-settings/%5Byear%5D/players-teams/page.tsx)
   (nested under one year's Master Settings) does two unrelated jobs:
   managing *who a player is* (name, email, invite, bio) and managing
   *what team they're on this year*. Only the second is actually
   per-year. This spec moves the first job to a new Global Tools page —
   Add Player and Edit Name land there, not on the per-year page.

Add Player and Edit Name build directly on the invite work already
shipped this week (`player_slots.email`, `POST /api/portal/tiger/invite`,
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
- The public "confirmed roster" block for the upcoming year
  (`getConfirmedRoster`, `ConfirmedRoster.tsx`)

Renaming one of the 13 *existing* players rides the same mechanism:
those 4 spots start preferring an override name when one is set; the
~60 historical/leaderboard/wagers/broadcast files (and the live
in-progress `LivePlayerScorecard.tsx`) are explicitly left alone (see
"Out of scope").

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

**UI**: a "+ Add Player" toggle above the table on the new Global
Players page (see below) — same expand-panel pattern as every other
control already on the old Players & Teams page — opens two fields:
Name, Email, and a submit button. On success, the page reloads and the
new player appears as an ordinary unclaimed row: "Open," and (because
an email was given) "Send Invite" already enabled — reusing 100% of the
invite flow shipped this week. No team assignment (that's the per-year
page's job now), no bio, no photo — exactly the two fields asked for.

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
Name and Email inputs, one Save. Lives on the new Global Players page,
alongside Add Player; applies to every row, static or dynamic alike;
pre-filled with whatever's currently displayed (the override if set,
otherwise the hand-written name).

**Backend**: new `POST /api/portal/tiger/player-name`, mirroring
`player-email` exactly:

- Validates `playerSlug` (string) and `fullName` (non-empty string —
  unlike email, a name can't be cleared to blank; the empty-clears-to-
  null convenience `player-email` has doesn't apply here).
- Updates `player_slots.full_name`.

The panel's Save button fires both requests (name, email) and reports
either error inline, matching how every other multi-field action on
this page already surfaces errors.

## Global Players page vs. per-year Players & Teams

**New Global Tools page**: `/portal/admin/players`, a new box on Tiger
Center's Global Tools grid
([app/portal/admin/page.tsx](../../../app/portal/admin/page.tsx)),
alongside Career Stats, Course Library, Wager Types, etc. — the existing
grid of standalone, non-year-scoped admin pages. This page gets
everything on today's Players & Teams that isn't about a specific
year's team assignment: the Player column (name + email, both editable
via "Edit name & email"), Username, Status (Open/Claimed), pending
bio-edit approvals, "Edit directly" (bio fields), Unlink, Send Invite —
plus the two new controls above. It's built from today's
[PlayerSlotsAdmin.tsx](../../../components/portal/PlayerSlotsAdmin.tsx),
relocated here with its Team column and `year` prop removed (team
assignment isn't this page's job anymore) and "+ Add Player" added.

**Per-year Players & Teams stays**, same URL
(`/portal/admin/master-settings/[year]/players-teams`), but shrinks to
exactly two things per row: the player's name (read-only — corrections
happen on the Global Players page now) and the Maroon/White/Unassigned
buttons + lock, unchanged from today. A new, much smaller component
(e.g. `PlayerTeamAssignment.tsx`) replaces `PlayerSlotsAdmin.tsx` here.

**Shared player list**: both pages need "every player, with a resolved
display name" — today that union-and-resolve logic lives inline in
`players-teams/page.tsx`'s loader. It moves into one small shared
server-only helper (e.g. `lib/portal/allPlayers.ts`), used by both
pages' loaders, so the union logic (static `playerProfiles` + every
`player_slots` row not already in it, name resolved as
`slot?.full_name ?? staticProfile?.fullName ?? slot.player_slug`) is
written once. The Global Players page additionally needs each row's
`username`/`claimedBy`/`email`/pending-edits (already fetched
server-side, same as today); the per-year page only needs `playerSlug`
and the resolved name.

## The 4 spots that resolve a name/identity

Each of these already does server-side Supabase work today, so each
gets the same small addition rather than a shared new abstraction (the
lookups differ enough — one row already in hand vs. a fresh query — that
forcing one helper across all 4 would obscure more than it'd save).

One spot originally planned here doesn't hold up: `app/teams/[slug]/[player]/page.tsx`
turns out to be a dead redirect shim (forwards to
`/leaderboard/[tournamentSlug]/players/[player]`, and only when the
player already appears in a *past* tournament's roster) — not a real
public bio page, and not fixable by this spec's fallback logic since a
brand-new player has no past-tournament appearance to redirect to. The
actual live bio+scorecard view for the *current* season
(`components/scorecard/LivePlayerScorecard.tsx`) is a `"use client"`
component fed by a polling hook over live tournament JSON, not a Server
Component doing a database read — fixing its display name properly means
threading a resolved name through that live-feed pipeline, real work on
its own. Moved to "Out of scope" below rather than silently dropped.

1. **Both the Global Players page and the per-year Players & Teams
   page's row lists**: both call the shared `lib/portal/allPlayers.ts`
   helper described above instead of mapping over the static
   `playerProfiles` array alone (today's behavior, which would leave a
   dynamically-added player off both tables entirely). No extra query on
   either page — the underlying `player_slots` fetch each already does
   is what the helper wraps.
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
4. **Confirmed roster** (`lib/data/activeSeasonOverlay.ts`'s
   `getConfirmedRoster`, `ConfirmedRoster.tsx`): resolve `displayName`
   and `avatarSrc` per entry inside `getConfirmedRoster` itself (already
   async/server-only) using the same override-then-static-then-slug
   order, and add them to `RosterEntry` as optional fields.
   `ConfirmedRoster.tsx` then just renders `entry.displayName` directly
   instead of calling `getPlayerDisplayName`/`getPlayerAvatar` itself —
   a simplification, not just a fix.

Avatar is unaffected by any of this beyond #4 reusing the existing
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
  the 4 forward-facing spots above immediately; it reaches a past
  tournament's leaderboard/scorecard/wagers page only if a developer
  also edits that player's hand-written file by hand later. Confirmed
  with Cade as the intended behavior — this should rarely if ever
  matter in practice.
- **Renaming does not reach `LivePlayerScorecard.tsx`** (the current
  season's live scorecard+bio view) either, for a different reason than
  the historical pages: it's a `"use client"` component fed by a
  polling hook over live tournament JSON, not a Server Component that
  can do a database read. A dynamically-added player still shows up
  there without crashing — `getPlayerDisplayName` falls back to their
  raw slug rather than a real name, same cosmetic gap as the historical
  pages, just for a different structural reason. Fixing it means
  threading a resolved name through the live-feed pipeline itself —
  real work on its own, not part of this spec.
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
- `/portal/admin/players` exists as a new Global Tools box, hosting
  everything player-identity-related (Add Player, Edit name & email,
  Status, Send Invite, Unlink, bio editing/approval).
- The per-year Players & Teams page shows only name + team assignment,
  for every player from the shared list (static or dynamic).
- "+ Add Player" creates a real, invitable row with no code change.
- "Edit name & email" works on every row, static or dynamic.
- The 4 spots above show a resolved name (override, then hand-written,
  then slug) with no redirect/crash for a player with no hand-written
  file.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all
  clean.
