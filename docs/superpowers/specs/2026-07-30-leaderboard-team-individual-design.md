# Leaderboard Team/Individual redesign — design

## What this is

Redesign the `/leaderboard` page (mobile-first, applies at all breakpoints) around a
compact score ticker plus a Team/Individual toggle, replacing the current
always-both-visible grid-of-match-cards + individual table layout. Modeled on Ryder
Cup app screenshots the user provided. Uses 2026 Palm Springs data (fully populated:
33 matches across 4 days, all 12 players have scorecards) as the reference example
while building, since the live 2027 feed has no data yet.

## Current state (for reference)

- `app/leaderboard/[slug]/page.tsx` renders `YearLeaderboardContent` (historical) or
  `LiveLeaderboardContent` (live 2027, at `nextTournament.slug`).
- Both currently render, in order: `PointsRibbon` (sticky fill-bar ticker with shimmer
  + diagonal win-badge, exported from `MatchPlayShowcase.tsx`) → `YearTabs` (year
  switcher, historical only) → `MatchPlayShowcase` (grid of match cards, one session at
  a time via a dropdown, selectable by year 2026/2025/2024 or "live") → `LeaderboardTable`
  (individual standings, always visible, POS + PLAYER + TOTAL only).
- `Tournament.matches[].day` is the round number (1-4 for the 4-day trips).
  `IndividualStanding` only carries a final `toPar` — no per-round breakdown. Per-round
  data instead lives in `Tournament.scorecards[].rounds[]` (`toPar`, `total`, `holes`),
  populated for all historical years and passed through the live feed payload too
  (`LiveFeedPayload.scorecards`), so it's usable for both historical and live without
  further backend work.
- `LeaderboardTable` is also used by `HistoryPageContent.tsx` (past-champion recap) and
  must keep working there unchanged. `LeaderboardStrip` (horizontal avatar strip) is
  used by the home page (`LiveLeaderboardStripSection`) and is unrelated to this work.
- `/leaderboard/[slug]/players/[player]/page.tsx` (existing) already renders a
  per-player scorecard with a round-select dropdown (`PlayerScorecardView`); it
  currently defaults to Round 1.

## Component architecture

New files:

- `components/leaderboard/PointsRibbon.tsx` — the ticker, moved out of
  `MatchPlayShowcase.tsx` into its own file, restyled (see below). Same export name
  and same `{ tournament, live }` props as today to minimize call-site churn.
- `components/leaderboard/matchUtils.ts` — shared match/session helpers extracted from
  `MatchPlayShowcase.tsx`: `groupSessions`, `matchStatus`, `matchLeader`, `matchLabel`,
  `currentSessionStatus`, `centralDateLabel`. Used by both the ticker's win-state logic
  (`currentSessionStatus` is unrelated to the ribbon, so only used by the Team view) and
  `TeamMatchesBoard`.
- `components/leaderboard/LeaderboardBoard.tsx` — new top-level client component taking
  `{ tournament: Tournament; live: boolean }`. Renders `PointsRibbon`, a Team/Individual
  pill toggle (local `useState`), then `TeamMatchesBoard` or `IndividualLeaderboardTable`
  depending on the selected tab.
- `components/leaderboard/TeamMatchesBoard.tsx` — screenshot-1 style view.
- `components/leaderboard/IndividualLeaderboardTable.tsx` — screenshot-2 style view.

Deleted: `components/leaderboard/MatchPlayShowcase.tsx` (grid-card UI fully superseded
by `TeamMatchesBoard`; its reusable pieces — `PointsRibbon`, session/match helpers,
`TeamStack`-style player rendering — are relocated first).

Unchanged: `LeaderboardTable.tsx` (History page dependency), `LeaderboardStrip.tsx`
(home page dependency), `ResultChevron.tsx` (reused as-is, just at two sizes).

Call sites updated:

- `YearLeaderboardContent.tsx`: replace `<PointsRibbon/>` + `<MatchPlayShowcase/>` +
  `<LeaderboardTable/>` with `<LeaderboardBoard tournament={tournament} live={false} />`.
  `YearTabs` (year switcher) stays above it, unchanged.
- `LiveLeaderboardContent.tsx`: replace the same trio with
  `<LeaderboardBoard tournament={tournament} live={true} />`. The existing "Live" badge
  / "Updated Xs ago" / error line and loading state stay as they are, above the board.

## Ticker (`PointsRibbon` restyle)

Keeps existing behavior: sticky under the header, proportional fill width showing each
team's share of `pointsAvailable` (this is meaningful information worth keeping, not
just decoration), win/retain detection via `computeBadgeState`.

Visual changes only: drop the shimmer keyframe animation and the diagonal
polygon-shaped win badge; flatten to two solid blocks (`maroon-700` / white-cream) each
showing a team label and the big point total (`fmtPt`), matching the flat two-tone
look of the reference screenshot (flag-swapped-for-team-color). The win/retain state
becomes a small plain text pill instead of the diagonal ribbon banner.

## Team view (`TeamMatchesBoard`)

Props: `{ tournament: Tournament; live: boolean }`.

- **Round pills** across the top: one per distinct `match.day` value present in
  `tournament.matches`, sorted ascending, labeled "R1", "R2", etc. Default selection:
  the round `currentSessionStatus`-equivalent-at-day-level currently in progress
  (live), or the highest day number with any match (historical/completed).
- Selecting a round shows **all sessions in that round** (both Morning and Afternoon),
  replacing today's session dropdown. Matches are grouped by `session` field, in the
  order they appear.
- Each session group has a plain divider header: `"{session} · {format}"` (e.g.
  "Afternoon · Alt Shot"). Live-only rule: if the earlier session in the same day has
  any match with `status !== "scheduled"` (i.e., started) and the later session has no
  matches yet, its header reads **"Upcoming"** instead of the session name.
- Each match renders as a vertical head-to-head row: left player stack, center
  `ResultChevron` (sized up — bigger circle/pill than today's 62×34 compact chevron —
  showing the match label: `1UP`, `AS`, `2&1`, etc.), right player stack. Player stacks
  reuse the existing avatar + name pattern (`TeamStack` from the old
  `MatchPlayShowcase`, relocated), fourball/alt-shot showing two stacked names per side,
  singles showing one. No fantasy-points number next to names (we have no player-pool
  system) — just avatar + name.
- After each session's match rows, a **recap strip**: one mini `ResultChevron` per
  match in that session (same color/label logic, smaller size), giving the at-a-glance
  summary row seen between groups in the reference screenshot.
- Live-waiting state (no matches yet for the live tournament) keeps today's
  `PlaceholderCard`-style behavior, adapted to the new layout.

## Individual view (`IndividualLeaderboardTable`)

Props: `{ tournament: Tournament }`.

- Team filter pills (All / Maroon / White) — same behavior as today's `LeaderboardTable`.
- Two frozen/sticky left columns: **POS**, **PLAYER** (avatar + name, team-colored).
- Horizontally scrollable columns to the right, in order: **TOT** (running total to-par
  — the sort key, shown up front since it's the number people look for first), **TODAY**
  (most recent round's to-par), **THRU** (holes completed in that round, or "F" if
  finished — computed the same way the existing player page already computes it), then
  one column per earlier *completed* round — **R1**, **R2**, … — read from
  `tournament.scorecards[player].rounds[]`. Rounds beyond what's been played simply
  don't render a column yet (table gets wider as the tournament progresses).
- No FAV/TRK columns (no favoriting or trend concept in our data model for this view).
- Tapping/clicking anywhere on a row navigates to
  `/leaderboard/{slug}/players/{player}` (existing route, unchanged).
- If `tournament.scorecards` is empty (early in the live tournament, before the Apps
  Script sends scorecard data), only POS/PLAYER/TOT render meaningfully — TODAY/THRU/R1…
  are simply absent, not broken. This is existing/expected live-feed behavior, not a
  regression introduced here.

## Supporting fix: default round on the player scorecard page

`components/scorecard/PlayerScorecardView.tsx` currently defaults its round selector to
`scorecard.rounds[0]` (Round 1). Change the default to the **last** round
(`scorecard.rounds[scorecard.rounds.length - 1]`) so that tapping a player from the new
Individual table's TODAY/THRU columns lands on their current/most recent round by
default. The existing round dropdown still lets the viewer go back to earlier rounds.
This only touches the default selection — no layout change on that page.

## Out of scope

- Any change to `HistoryPageContent.tsx`, `LeaderboardStrip.tsx`, the home page, or the
  live-feed backend / Apps Script response shape.
- Favoriting/trend columns on the Individual table.
- Any change to `/schedule`, `/teams`, or nav components (`MobileTabBar`, `MorePanel`) —
  they're exercised as-is when clicking through, not modified.

## Done when

- `/leaderboard/2026-palm-springs` renders the new ticker, Team/Individual toggle,
  Team view (round pills → session groups → head-to-head rows → recap strips) and
  Individual view (frozen POS/PLAYER, scrollable TOT/TODAY/THRU/R1-R4) fully populated
  end to end on mobile widths, matching the reference screenshots' structure.
- The same components render correctly for the other historical years (2024, 2025) and
  for the live 2027 route (sparse but not broken, with the "no scorecards yet" fallback
  behaved as described).
- History page and home page continue to work unchanged (`LeaderboardTable` and
  `LeaderboardStrip` untouched).
- Tapping an individual row navigates to the player's scorecard page, defaulted to
  their most recent round.
- No hydration errors, `next build` succeeds, no TypeScript errors.
