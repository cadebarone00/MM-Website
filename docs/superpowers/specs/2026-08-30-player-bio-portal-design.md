# Player Bio Portal — Design Spec

## Goal

A player can edit their own public bio (everything shown in
`PlayerBioSection` on their scorecard page) from the Player Portal. Every
change needs Tiger's approval before it goes live, except their account
email (not part of this system at all — that's a Supabase Auth setting,
changed elsewhere). Tiger reviews and approves/denies from the existing
Players & Teams tab in the Tiger Center, and can also edit any player's
bio directly himself with no approval step, since he's the approver.

## Background

This isn't a new idea for this project — `app/api/portal/profile/route.ts`
already has a `GET` handler shaped exactly like this (`profile`,
`pendingEdits` in its response type), calling out to the old
`MM-Scorekeeper` Python backend. That backend was retired 2026-08-04 and
its code was never part of this repo (per `project_specs.md`'s "Known
gaps"), so the route always 502s today — `PYTHON_API_URL` is unset. This
spec replaces that dead stub with a native Supabase-backed implementation
of the same idea, rather than inventing a new concept.

**Scope decision, made explicit:** `getPlayerProfile`/`getPlayerDisplayName`/
`getPlayerAvatar` (the static, synchronous lookups in
`lib/data/players/index.ts`) are called from 32 files across the site —
leaderboard rows, home cards, headers, match rows, several of which are
client components. Converting every one of those to read live data is a
large, separate refactor. This spec makes **only the bio page itself**
(`PlayerBioSection`) reflect approved edits immediately, including name,
photo, and every other field. The other ~30 small name/avatar-only spots
keep reading the static baseline until a later pass migrates them —
named here as an explicit, deliberate gap, not an oversight.

## Data model

Two new tables, appended to `supabase/schema.sql` (this repo's existing
convention — one file, safe to re-run, new sections get added rather than
a separate migration file per feature).

```sql
-- === Player Bio Portal ===================================================
-- Lets a player edit their own public bio; every change needs Tiger's
-- approval before it's live (email isn't part of this — that's a Supabase
-- Auth setting). player_profile_edits is the pending queue a player writes
-- to and Tiger clears; player_profile_overrides is what the public bio page
-- reads on top of the static lib/data/players/*.ts baseline once approved.

create table if not exists player_profile_edits (
  player_slug text not null references player_slots(player_slug),
  field text not null,
  proposed_value jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (player_slug, field)
);

create table if not exists player_profile_overrides (
  player_slug text not null references player_slots(player_slug),
  field text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (player_slug, field)
);

-- Both readable by anyone — matches the live_* tables' existing pattern.
-- The public bio page reads overrides with no auth; a player's own pending
-- edits aren't sensitive either. Writes happen server-side with the
-- service-role key, same as everywhere else.
drop policy if exists player_profile_edits_select_all on player_profile_edits;
create policy player_profile_edits_select_all on player_profile_edits for select using (true);

drop policy if exists player_profile_overrides_select_all on player_profile_overrides;
create policy player_profile_overrides_select_all on player_profile_overrides for select using (true);

-- Approving is two writes (move the value to overrides, clear the pending
-- row) that must happen together — a SECURITY DEFINER function, same
-- reasoning as settle_mm_coin_market's atomicity above.
create or replace function approve_profile_edit(p_player_slug text, p_field text)
returns void as $$
begin
  insert into player_profile_overrides (player_slug, field, value, updated_at)
  select player_slug, field, proposed_value, now()
  from player_profile_edits
  where player_slug = p_player_slug and field = p_field
  on conflict (player_slug, field) do update set value = excluded.value, updated_at = excluded.updated_at;

  delete from player_profile_edits where player_slug = p_player_slug and field = p_field;
end;
$$ language plpgsql security definer;
```

`field` is one of `PlayerProfile`'s editable keys (`bio`, `avatarSrc`,
`history`, `classYear`, `major`, ... every field except `id`/`slug`, which
are structural identifiers, not bio content). `proposed_value`/`value` are
`jsonb` so both plain strings and `history`'s `string[]` fit the same
column without a second table.

## Read path

New function, `lib/data/players/overrides.ts`:

```ts
export async function getProfileOverrides(playerSlug: string): Promise<Partial<PlayerProfile>>
```

Queries `player_profile_overrides` (public-read RLS, no auth needed) and
reduces the rows into a partial `PlayerProfile`. `PlayerBioSection` becomes
a client component that still receives its `profile` prop exactly as
today (the static baseline — no change to any existing call site), and on
mount fetches this player's overrides from a new small public endpoint and
merges them on top before rendering. This is deliberately client-side
fetching rather than a server-side await, so it works identically whether
the page rendered statically (`page.tsx`) or client-side (the live
tournament path, `LivePlayerScorecard.tsx`) — no branching, and zero
changes needed to either page or to `PlayerScorecardView`.

New route: **`GET /api/players/[slug]/overrides`** — public, no auth.
Returns `{ ok: true, overrides: Partial<PlayerProfile> }`. Read-only, thin
wrapper over `getProfileOverrides`.

## Player-side: submitting an edit

**`POST /api/portal/profile`** (replaces the dead `GET` stub in the same
file — the Python call is deleted, not kept as a fallback).

- `GET`: returns the requesting player's own merged profile (static +
  overrides) plus their current pending edits (`{ field, proposedValue,
  submittedAt }[]`) — this is what the edit screen loads to pre-fill forms
  and show "Pending approval" state.
- `POST`: body `{ edits: { field: string; value: string | string[] }[] }`
  — lets one Save submit a whole section (e.g. all four Location fields)
  in one request. Auth via `requirePlayer()`, exactly like every other
  player-facing route. Validates every `field` against an allowlist of
  editable `PlayerProfile` keys (rejects anything else, including
  `id`/`slug`). Upserts each into `player_profile_edits` keyed to the
  *authenticated* player's own slug — never a client-supplied slug,
  matching this codebase's existing trust model throughout. Per the
  earlier decision, this **replaces** any edit already pending for that
  field (upsert, not insert-only).

## Tiger-side: approve, deny, or edit directly

Three small routes under `app/api/portal/tiger/profile-edits/`, each
guarded by `requireHost()`, mirroring the one-clear-verb-per-route pattern
`unlink`/`courses` already use:

- **`approve/route.ts`** — body `{ playerSlug, field }`. Calls the
  `approve_profile_edit` RPC.
- **`deny/route.ts`** — body `{ playerSlug, field }`. Deletes the one
  `player_profile_edits` row. Nothing to keep — a denial isn't logged
  anywhere, matching "easy workflow" over an audit trail this project
  doesn't otherwise have for equivalent admin actions.
- **`set/route.ts`** — body `{ playerSlug, field, value }`. Tiger's own
  direct edit: upserts straight into `player_profile_overrides` (same
  shape the approve RPC writes), and also deletes any pending edit for
  that same field if one exists (Tiger's direct edit supersedes whatever
  the player had proposed).

## Screens

**Player Portal — `/portal/profile`** (new page, linked from the existing
`/portal` welcome screen). A grid of tappable cards — the "box clicker" —
one per section, mirroring `PlayerBioSection`'s own two grids exactly (its
main facts grid, then its notes grid) so the edit screen and the public
page read the same way:

- **Bio Text** — `bio`
- **Bio Facts** — `classYear`, `major`, `occupation`, `hometown`, `college`,
  `residence`, `playsFrom`, `status`, `handicap`, `rankingNotes`,
  `clubGolfYears`, `debut`, `debutLocation`, `height`, `weight`, `age`,
  `birthday`, `nickname` — `PlayerBioSection`'s entire main grid, one form
- **Notes** — `strengths`, `careerHighlights`, `personal`, `hobbies`,
  `goals`, `misc` — `PlayerBioSection`'s notes grid
- **History** — `history` (the milestone list; edited as one line per
  entry in a textarea, split/joined on newlines — simplest UI that fits a
  short string array, no add/remove-row widget needed)
- **Photo** — `avatarSrc`
- **Social Links** — `instagram`, `linkedin`

Splitting "Bio Facts" into smaller cards is a reasonable implementation
call if the single form feels long — not a decision this spec needs to
lock down, since it doesn't change the data model or the approval flow
either way.

Tapping a card opens that section's fields as a form, each field
pre-filled with the pending value if one exists (so a player resumes
editing their own draft) or the live value otherwise. A field with a
pending edit shows **both** "Current: ..." and "Pending approval: ..."
labeled side by side, per the earlier decision — so submitting again is
visibly "replacing my own draft," not "did that even work?" Save posts
the section's changed fields in one request to `POST /api/portal/profile`.

**Tiger Center — Players & Teams tab** (`/portal/admin/players-teams`,
extending the existing `PlayerSlotsAdmin` component): clicking a player's
name expands a dropdown beneath their row listing every pending edit for
them — field name, current value, proposed value, and Approve/Deny
buttons per field. Approve calls the `approve` route and removes that row
from the list; Deny calls `deny` and does the same. A player with no
pending edits shows no dropdown affordance (nothing to expand). This same
expanded view also gets a "Edit directly" action per field (or a small
"add an override" form) that calls `set` — this is Tiger's own
always-available direct-edit path, independent of anything a player
proposed.

## What "done" looks like

A player opens `/portal/profile`, taps a box, changes a field, saves. It
shows up on their own bio page immediately as "pending" and on their
public bio page unchanged until approved. Tiger opens Players & Teams,
clicks their name, sees the proposed change next to the current value,
clicks Approve. The public bio page now shows the new value — same as if
Tiger had typed it into the static file himself, except it came from the
player and went through review. Tiger can also just set any field on any
player directly, any time, no approval loop for himself.

## Out of scope for this spec

- Migrating `getPlayerDisplayName`/`getPlayerAvatar`/`getPlayerProfile`'s
  other ~30 call sites to read live overrides (named above as a deliberate
  gap, not a silent omission).
- Any audit trail of denied or historical edits — denial just deletes the
  pending row.
- Image upload for the Photo section — a player pastes/enters an image
  URL (same as the static data already does for `avatarSrc`), not a file
  upload widget. Real upload handling (storage bucket, resizing) is a
  separate piece of scope if wanted later.
- Any connection to the live-scoring → public-stats pipeline (that's the
  separate, already-tracked 3-phase live scoring rollout — see
  `docs/superpowers/specs/2026-08-30-tiger-center-player-live-scoring-design.md`).
  This spec is bio fields only.
