# Fantasy Draft Redesign — Design Spec

## Goal

Replace today's flat, one-screen Fantasy picker with a mobile-first
draft flow: a welcome hero, three tabs (Maroon / White / Wildcard) that
each list eligible players, a tap-through to that player's real profile
page to draft them from there, and a Submit Lineup step that locks the
team once the tournament goes live. Desktop reuses the same
single-column layout — no separate desktop design this round.

Two real bugs surface along the way and are fixed as part of this
work, not worked around:

1. **The eligible-player list is currently always empty.** Fantasy
   reads `tournament.roster`, which only gets filled in once the live
   Google Sheet feed is running during the tournament itself. The
   actual pre-tournament source of truth — who Tiger has locked into
   Maroon/White in Master Settings → Players & Teams — lives
   separately (`getConfirmedRoster()`), and nothing today connects the
   two. This is also why `LivePlayerScorecard.tsx` (the live
   bio/scorecard page Fantasy will link out to) shows the wrong team
   color badge for every player right now — same root cause, flagged
   but explicitly deferred in the prior `2026-09-18-add-player-and-rename`
   spec. Both are fixed here, at one shared point, since Fantasy's
   own draft flow depends on both being correct.
2. **Nothing stops editing picks after the tournament starts.** The
   save endpoint has no time check at all today.

## Confirmed decisions (from discussion with Cade)

- Everyone drafts independently — no shared draft pool, no
  exclusivity between users. Matches how `fantasy_teams` already works.
- Tapping a player opens the real player profile page (the one Teams/
  Leaderboard already link to), not a fantasy-only mini card.
- Picks are editable any time before the tournament goes live; once a
  round is live, the lineup is locked — no new database column needed,
  this reuses the site's existing `isLiveNow()` tournament-status
  check.
- Whoever is locked into Maroon or White in the 2027 Master Settings →
  Players & Teams page is that player's team, and that should be true
  everywhere on the site that shows a pre-tournament team, not just on
  the Fantasy page.

## Fix #1: one shared roster-overlay, fixing it everywhere at once

`getConfirmedRoster()` (`lib/data/activeSeasonOverlay.ts`) is already
the source of truth the public Teams page uses for "who's locked into
which team so far." Today nothing else reads it. New pure helper:

```ts
// lib/data/confirmedRosterOverlay.ts
export function overlayConfirmedRoster(tournament: Tournament, confirmedRoster: RosterEntry[]): Tournament
```

If `tournament.roster.maroon`/`.white` are both empty and
`confirmedRoster` has entries, returns `tournament` with `roster`
replaced by the confirmed roster's player slugs, split by team.
Otherwise returns `tournament` unchanged (once the live feed itself
starts reporting a roster during the tournament, that always wins).
Pure and unit-tested — this is the one rule, applied in two places:

- **Server-side** (`lib/data/fetchLiveTournament.ts`, today's only
  caller is `app/api/fantasy/team/route.ts`): call `getConfirmedRoster()`
  directly (already server-only, no extra network hop) and overlay
  before returning. Fixes fantasy pick validation and scoring on the
  server.
- **Client-side** (`lib/hooks/useLiveTournament.ts`, used by 18 files
  including `LivePlayerScorecard.tsx`, the Fantasy page, Wagers, and
  the home page): a new public `GET /api/confirmed-roster` route
  (thin wrapper around `getConfirmedRoster()`, same public data the
  Teams page already renders) is fetched alongside the existing live
  feed poll, and the same overlay is applied before the hook returns
  `tournament`. Every one of those 18 consumers gets the corrected
  roster automatically — including `LivePlayerScorecard`'s team badge,
  fixing the previously-deferred bug for free.

No other file needs to know this fix exists — `tournament.roster` just
starts being correct earlier than it used to be.

## Fix #2: lock enforcement is real, not just hidden in the UI

`POST /api/fantasy/team` (`app/api/fantasy/team/route.ts`) adds one
check before writing: if `getNextTournamentStatus() !== "upcoming"`,
reject with a clear error ("Fantasy picks are closed — the tournament
has started.") instead of silently accepting the write. This is the
only enforcement point that matters; the UI simply reflects this same
check so a user never sees a control that would fail anyway.

No new database column. "Submitted" means "a row exists in
`fantasy_teams` for this tournament's slug" (already true today).
"Locked" means "the tournament is no longer upcoming" (already
computable today via `getNextTournamentStatus()`).

## Page states (`app/fantasy/page.tsx`)

One page, five states, derived from: confirmed roster (empty or not),
saved picks (none / partial is impossible server-side, since the save
endpoint always validates all three — "partial" only exists in the
in-progress local draft, see below), and tournament status.

1. **Roster not set** — confirmed roster is empty. Same placeholder
   message as today ("Rosters haven't been set yet").
2. **Welcome** — confirmed roster exists, no saved picks, no draft in
   progress. Hero: "Welcome to Maroon Masters Fantasy," the existing
   scoring-rules recap, a "Make Your Selections" button that starts an
   empty draft.
3. **Draft mode** — a draft is in progress (started from Welcome, or
   from "Edit Lineup," see state 4). Three tabs: **Maroon** (jacket
   icon), **White** (thumbs-up icon), **Wildcard** (cards icon) — all
   from `lucide-react`, the icon set already used everywhere on this
   site. Maroon tab lists the confirmed Maroon roster; White tab lists
   the confirmed White roster; Wildcard tab lists both rosters minus
   whichever two players are already picked for the Maroon/White
   slots. A player already picked into any slot shows a filled/
   checked state on its tab. A "Submit Lineup" bar is pinned to the
   bottom, disabled until all three slots are filled, showing which
   slot(s) still need a pick.
4. **Your Team** — a saved pick exists on the server (freshly
   submitted, or loaded on return visit) and no draft is in progress.
   Hero shows the three drafted players. If the tournament is still
   upcoming: an "Edit Lineup" button starts a new draft pre-filled
   from the saved picks (any slot can be redrafted, then resubmitted —
   this is what makes edits actually possible, not just theoretically
   allowed). If the tournament is live or completed: no Edit button;
   instead render the existing `FantasyResults` component (unchanged —
   this already computes live per-player and team points correctly)
   in place of the edit affordance.
5. **Missed it** — tournament is live or completed and no saved pick
   exists (the person never drafted in time). Hero reads "Fantasy
   picks are closed for this tournament." No call to action.

## In-progress draft state

While drafting (state 3, before Submit Lineup succeeds), picks live in
`sessionStorage`, keyed by tournament slug — device-local, cleared on
a successful submit, same pattern as the existing handicap "round in
progress" feature (`lib/handicap/roundInProgress.ts`). New file
`lib/fantasy/draftState.ts` (pure get/set/clear helpers, unit-tested)
is what makes the pick survive navigating away to a player's profile
page and back, since that's a real route change that unmounts
`/fantasy` entirely.

"Edit Lineup" (state 4) seeds this same sessionStorage state from the
saved server picks before switching into draft mode, so redrafting one
slot doesn't lose the other two.

## Tap a player → profile → Draft

Tapping a player row in any tab navigates to that player's existing
live profile page: `/leaderboard/{tournamentSlug}/players/{slug}?draftSlot=maroon|white|wildcard`
(this is always the `LivePlayerScorecard` branch of that route, since
Fantasy only ever targets the upcoming tournament). Two small,
additive changes there:

- `PlayerScorecardPage` (`app/leaderboard/[slug]/players/[player]/page.tsx`)
  already computes `backHref` from a query param (`fromMatch` today).
  It gains one more case: if `draftSlot` is present, `backHref` is
  `/fantasy` instead of the leaderboard. This reuses the profile
  page's existing back button — no new "back" UI needed anywhere.
- `LivePlayerScorecard` renders a new `FantasyDraftActionBar` (fixed
  to the bottom of the screen) when `draftSlot` is present: a single
  "Draft {first name}" button. Tapping it writes the pick into the
  sessionStorage draft state and navigates to `/fantasy`, which reads
  that state back on mount and lands on the next unfilled tab (or the
  Submit Lineup bar, once full).

Nothing changes for a normal (non-fantasy) visit to this page —
`draftSlot` is simply absent.

## Files

- `lib/data/confirmedRosterOverlay.ts` (new, pure, tested) — the one
  overlay rule described in Fix #1.
- `lib/data/fetchLiveTournament.ts` — calls the overlay with
  `getConfirmedRoster()`.
- `app/api/confirmed-roster/route.ts` (new) — public `GET`, thin
  wrapper around `getConfirmedRoster()`.
- `lib/hooks/useLiveTournament.ts` — fetches `/api/confirmed-roster`
  alongside the existing live-feed poll, applies the overlay.
- `app/api/fantasy/team/route.ts` — `POST` gains the tournament-status
  lock check.
- `lib/fantasy/draftState.ts` (new, pure, tested) — sessionStorage
  get/set/clear for the in-progress draft.
- `app/fantasy/page.tsx` — rewritten for the five states above.
- New components under `components/fantasy/`: a welcome hero, the
  tabbed draft view (built from the existing `PlayerPickerSlot` row
  styling, restyled as tap-to-navigate rows instead of tap-to-select
  buttons), and `FantasyDraftActionBar`.
- `app/leaderboard/[slug]/players/[player]/page.tsx` and
  `components/scorecard/LivePlayerScorecard.tsx` — the two additive
  changes described above.
- Unchanged: `lib/fantasy/scoring.ts`, `lib/fantasy/validate.ts`,
  `components/fantasy/FantasyResults.tsx`,
  `components/fantasy/FantasySignInGate.tsx`, the `fantasy_teams`
  table.

## Testing

`overlayConfirmedRoster` and `draftState` are pure functions/helpers —
straightforward unit tests, same convention as every other `lib/`
helper in this repo. The lock check on `POST /api/fantasy/team` gets a
test forcing `getNextTournamentStatus()` to a non-"upcoming" value and
confirming the write is rejected. `npm test`, `npx tsc --noEmit`,
`npm run lint`, and `npm run build` all need to stay clean, matching
every prior round.

Because the 2027 roster isn't locked in yet in production, the draft
flow itself (tabs, drill-in, Draft button, Submit Lineup, Edit Lineup,
lock-on-live) needs a temporary local confirmed-roster fixture to
click through during development — real end-to-end verification
against production data happens once Cade actually locks players into
Maroon/White for 2027, same caveat as prior rounds that depended on
data that didn't exist yet.

## Out of scope

- No fantasy leagues, rankings, or percentiles — one team per person,
  no shared competitive pool (confirmed above).
- No changes to the point scoring math itself (`lib/fantasy/scoring.ts`
  is already correct and unchanged).
- No admin override to unlock a lineup after the tournament starts —
  if that's ever needed it's a small follow-up, not part of this round.
- Icon choices (jacket / thumbs-up / cards, from `lucide-react`) are a
  first pass — easy to swap once seen rendered, not a blocking design
  decision.

## What "done" looks like

- Confirmed Maroon/White roster shows up correctly in the Fantasy
  draft tabs (and, as a side effect, on `LivePlayerScorecard`'s team
  badge) without needing the live Google Sheet feed configured.
- Welcome → draft (3 tabs) → tap player → real profile page → Draft →
  back on the tabs with that slot filled → Submit Lineup → Your Team,
  all working end to end against a local confirmed-roster fixture.
- Edit Lineup works pre-tournament; once `getNextTournamentStatus()`
  is no longer `"upcoming"`, both the UI and the save endpoint refuse
  further edits, and Your Team shows live scoring instead.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all
  clean.
