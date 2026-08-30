# Player Area Nav + Scoring Status Screen — Design Spec

## Goal

Make switching between The Website, The Player Portal, and (new) Scoring
seamless for a signed-in player — a persistent nav they can use from
anywhere, instead of only choosing once at the post-login fork screen. Also
build the first real screen of "Scoring": a status screen showing whether a
round is scheduled for them yet, and if so, its tee time/matchup/live state.

## Background

Builds on three things already in this repo:

- `docs/superpowers/specs/2026-08-28-site-plan-design.md` — names "The
  Website" / "The Player Portal" / "The Tiger Center" as the three tiers, and
  lists "My Scorecard / Live Scoring" as a Player Portal area.
- `docs/superpowers/specs/2026-08-29-tiger-center-operations-design.md` —
  the round lifecycle this screen reads: a round needs both
  `courseLocked` and `matchupsLocked` before Tiger can Start it; once
  started, `effectiveMatchState()` (already shipped, `lib/live/
  orchestration.ts`) computes each match box's live state from its
  `started` flag and `teeTime`.
- The uncommitted `worktree-tiger-center-matchups` branch, which migrates
  `live_match_boxes` from the old `(tournamentYear, day, session,
  boxNumber)` shape onto a flat `round` column. **This spec's data-reading
  code targets that new shape** — it does not run against current `main`
  until that branch merges. See "Sequencing" below.

Two loading screens already exist (`components/LoadingScreen.tsx`,
`components/home/HomeEntrySplash.tsx`, the `/account/choose` fork screen) —
this spec reuses and slightly generalizes that component rather than adding
a third copy of the same background+overlay markup.

## Out of scope for this spec

- The actual hole-by-hole scoring entry screen ("Go to Scoring" leading
  into 18 holes) — that's the site plan's own later "My Scorecard / Live
  Scoring" phase. Tapping the Scorecard box while a round is Live does
  nothing yet (no route exists to send them to).
- Tiger Center's own screens (Pairings & Rounds / Matchups) — being built
  in `worktree-tiger-center-matchups`, untouched by this spec.
- The old `/portal` Google-Sheet-based `PlayerScoringPanel` — left exactly
  as-is; unrelated system, not being merged or removed here.
- Push notifications for round-start (already deferred in the Tiger Center
  Operations spec).
- Any visual design pass beyond matching existing site patterns (segmented
  nav look, `LoadingScreen` styling) — this is a functional spec.

## Component 1 — `PlayerAreaNav`

New `components/nav/PlayerAreaNav.tsx`, client component. Three equal-width
segments, edge-to-edge, no gaps — modeled on `MobileTabBar`'s full-bleed
structure rather than the pill-shaped `MMToggle`, since this needs to read
as a nav bar, not an inline toggle:

- Container: `maroon-900` background, fixed height shorter than the header
  (44px vs. the header's 64px desktop row), `font-condensed uppercase
  tracking-wide` white text — same voice as `MobileTabBar`.
- Each segment is a `<Link>` (not a button — these are real navigations):
  **Website** → `/`, **Portal** → `/portal`, **Scoring** → `/portal/scoring`.
- Active-segment rule, evaluated against `usePathname()`:
  - Scoring: `pathname.startsWith("/portal/scoring")`
  - Portal: `pathname.startsWith("/portal")` and not matched by Scoring's rule
  - Website: neither of the above
- Active segment inverts fill/text: `cream-50` background, `maroon-700`
  text (mirrors the existing invert-on-select idiom in `MMToggle`).
- Rendered in `app/layout.tsx`, directly under `<Header />` and above
  `{children}` — **only when `useAccountSession()` returns `{ kind:
  "player" }`.** Fans, hosts, and signed-out visitors see nothing extra;
  layout is otherwise unchanged for them. Same breakpoint behavior as the
  rest of the layout: this renders at both mobile and desktop widths (no
  `lg:hidden`).

No changes to the fork screen (`/account/choose`) — it still offers the
one-time Website/Portal choice right after login; this nav is what lets a
player move between all three areas afterward without returning to it.

## Component 2 — generalizing `LoadingScreen`

Today `LoadingScreen` hardcodes an `<h1>The Maroon Masters</h1>` above
`children`. The Scoring screen needs two *independent* things this doesn't
support yet: a small greeting pinned near the top of the screen ("Welcome,
{name}"), separate from its own custom title/status block centered (or
raised) below — not one replacing the other. Change:

- Replace the hardcoded `<h1>` with a required `heading: ReactNode` prop,
  rendered in the same spot (first item inside the centered/raised block,
  above `children`) — so it's still "the title of this block," just no
  longer fixed text.
- Add a new optional `topSlot?: ReactNode`, rendered pinned near the top of
  the screen (below the safe-area inset), independent of and above the
  centered/raised block. Unused (omitted) by the universal and fork
  screens.
- `HomeEntrySplash` and `/account/choose` both pass `heading={<h1
  className="...">The Maroon Masters</h1>}` and no `topSlot` — a one-line
  change at each call site, no visual difference from today.
- The Scoring screen passes `topSlot={<>Welcome, {playerName}</>}` (small,
  lighter text — a greeting, not a title) and its own `heading` (see
  "Screen states" below) plus `children` for everything under the heading.
- Everything else about `LoadingScreen` (background images, gradient,
  `raised` prop) is unchanged.

## Route — `/portal/scoring`

New `app/portal/scoring/page.tsx`, server component. Same auth guard as
`app/portal/page.tsx` today: redirect to `/login` if signed out, to `/` if
the account is fan-only, to `/portal/admin` if it's Tiger.

### Finding "the" round for this player

New `lib/live/currentRoundForPlayer.ts`:

```
findCurrentRoundForPlayer(playerSlug: string): {
  round: LiveRoundState;
  matchBox: LiveMatchBox;
  state: MatchState; // from effectiveMatchState()
} | null
```

Logic: read all `live_round_state` rows where `courseLocked &&
matchupsLocked`, sorted by `round` ascending. For each, read that round's
`live_match_boxes` and find the one box (if any) containing `playerSlug` in
`maroonPlayers` or `whitePlayers`. Compute `effectiveMatchState()` against
an otherwise-empty `LiveTournamentSnapshot` (no scores exist yet anywhere —
this is accurate today and will automatically start reflecting real
progress once live scoring ships, with no change needed here). Return the
first round/box pair whose state isn't `"Final"`. `null` if none found.

Both `live_round_state` and `live_match_boxes` are public-read (existing
RLS policy: `select using (true)`), so this reads with the normal server
Supabase client — no service-role key needed.

### Screen states

All three pass `topSlot={<>Welcome, {playerName}</>}` (`playerName` via the
same `playerProfile?.fullName ?? profile.display_name` fallback `/portal`
already uses). `heading` and `children` differ per state:

**1. No round found** (`findCurrentRoundForPlayer` returns `null`) — not
`raised`, so the block sits centered vertically (same treatment as the
universal homepage splash, including its iPhone-centering nudge):
- `heading`: "Maroon Masters {nextTournament.year}"
- `children`: "Waiting For Matchup"

**2. Round found, state `Scheduled` or `Armed`** — `raised` (title block
starts higher, like the fork screen):
- `heading`: "Upcoming Round"
- `children`, in order: tee time (e.g. "2:10 PM", from `matchBox.teeTime`,
  browser-local) · the matchup — this player's teammate vs. the opposing
  pair, e.g. "You & Cam vs. Drew & Hugo" (Singles: "You vs. Drew"), names
  via the existing `getPlayerDisplayName` · a maroon-outlined, hollow,
  rounded box at reduced opacity ("faint") containing "Scorecard" in
  maroon text, not clickable · directly under the box, "Waiting For Round
  To Begin"

**3. Round found, state `Live`** — same `raised` layout and matchup
`children` as state 2, except:
- `heading`: "Round Live" instead of "Upcoming Round"
- The box is full-opacity ("lit up")
- No caption under the box
- Tapping the box currently does nothing (see Out of scope)

## Sequencing

`currentRoundForPlayer.ts` and the screen import `LiveMatchBox.round` and
`LiveRoundState.courseLocked`/`matchupsLocked` — the latter two already
exist on `main`, but `LiveMatchBox.round` only exists in
`worktree-tiger-center-matchups`. This work is built as its own branch
**based on top of `worktree-tiger-center-matchups`**, not `main`, so it
type-checks and runs against real data today. Merge order:
`worktree-tiger-center-matchups` → `main` first, then this branch → `main`
(or rebase onto `main` after that merge, if this branch finishes first).

## Testing

- `npx tsc --noEmit`, `npm run lint`, `npm run build` — same bar as every
  other round of work in this project.
- `currentRoundForPlayer.ts` gets unit tests (matches existing convention —
  see `lib/live/orchestration.test.ts`) covering: no locked rounds, a
  locked round with no box for this player, Scheduled, Armed (tee time not
  yet reached), Live (tee time reached), and a Final round correctly
  skipped in favor of the next one.
- Manual check in the dev server: `PlayerAreaNav` only appears for a player
  session, active-segment highlighting is correct on `/`, `/portal`, and
  `/portal/scoring`, and each of the three Scoring screen states renders
  correctly (achievable by hand-editing test data / temporarily seeding
  `live_round_state`/`live_match_boxes` rows).

## What "done" looks like

A signed-in player can jump between Website, Portal, and Scoring from any
page via the new nav, with the current area always visually indicated.
`/portal/scoring` shows the correct one of three states based on real
Tiger Center round/matchup data (once `worktree-tiger-center-matchups` is
merged), reusing the existing loading-screen visual language and the
already-shipped match-state logic — no duplicated status-computation code.
