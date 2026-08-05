# Wagers Section — Kalshi-style Layout Redesign — Design Spec

## Vision

Purely visual/layout rework of the existing Wagers section (`app/wagers/`,
`components/wagers/`) to look and navigate like the Kalshi app screenshots
provided. No betting logic, odds math, or wallet behavior changes — every
market, the bet slip, and `lib/wagers/wallet.ts` stay exactly as they work
today. This is chrome, routing, and restyling only.

Naming note: the balance/wager toggle uses **"MM Coins"** and **"Real
Wagers"** — matching the labels already established in
`docs/superpowers/specs/2026-08-05-wagers-phase3-real-money-design.md`
(the separate, in-progress effort building real peer-to-peer wagering),
so the two pieces of work share one vocabulary instead of drifting apart.

## Navigation stack

`app/wagers/layout.tsx` (new) wraps every `/wagers/*` route. Because Next.js
layouts persist across sibling route navigation and only remount when you
navigate into the section from outside, this is also where the one-time
entry splash and the sign-in gate live — neither needs to be repeated per
page.

Rendered top to bottom:

1. **Entry splash** — shown once per entry into the section (mounts fresh
   each time you arrive at `/wagers/*` from outside it, not on internal
   navigation between hub/category/portfolio). Full-bleed image (asset TBD —
   ships with a placeholder maroon background until the real image is
   provided) with "WAGERS" pulsating center-screen. Fixed ~1.2s duration,
   not tied to any data fetch.
2. **Wagers nav bar** — three zones, content depends on the current route:
   - `/wagers` (hub): `< More` — **Wagers** — **My Portfolio**
   - `/wagers/{category}`: `< Wagers` — **{Category name}** — **My Portfolio**
   - `/wagers/portfolio`: `< Wagers` — **My Portfolio**
   - The back link always names the parent screen and is a real `<Link>`
     (not a JS overlay), so the OS edge-swipe-back gesture works.
   - `< More` opens the existing `MorePanel` drawer (same one the bottom tab
     bar's More button opens).
3. **MM Coins / Real Wagers toggle** — segmented control, persistent in the
   nav bar on every screen under `/wagers`. Selecting "Real Wagers" shows a
   locked "Coming soon" state; MM Coins stays on today's fully-functional
   flow regardless of toggle position. Toggle state does not persist across
   sessions — it's local UI state, not written anywhere.
4. **Sign-in gate** — moves here from `WagersHubContent`; unauthenticated
   visitors see `SignInGate` in place of the splash/nav/content for any
   `/wagers/*` route.

## Hub screen — `app/wagers/page.tsx` (rewritten)

Nav bar only, plus one row: the 5 category tabs — **Team Futures, Player
Futures, Matches, Fourballs, Props** — laid out horizontally, all visible
without scrolling on a phone screen, styled as a pill/underline tab row
(Kalshi's FOR YOU/SPORTS/POLITICS row) in the maroon/gold palette already in
use. No wager content renders on this screen. Tapping a tab navigates to
`/wagers/{category}`.

## Category pages — `app/wagers/{team-futures,player-futures,matches,fourballs,props}/page.tsx` (new)

Each page:

- A short "how this market works" rules blurb at the top — placeholder copy
  per category (editable later), e.g. Matches: "Pick the winning side of
  today's match. Odds update as play continues."
- A search input filtering the boxes below by name (client-side text match
  against each box's title — match/player/etc.).
- A grid of **boxes**, restyled versions of today's market cards
  (category icon badge, bold title, outcome rows with odds, rounded card,
  subtle accent border — closer to the Kalshi card look than today's plainer
  rows/borders). Tapping an outcome opens the existing `BetSlipSheet` bottom
  sheet unchanged.

Data source per category (all reuse existing components/data, restyled —
nothing rebuilt from scratch):

| Category | Source | Component reused |
|---|---|---|
| Team Futures | `teamWinnerOdds(tournament)` | `TeamFuturesCard` (restyled) |
| Player Futures | `tournamentWinnerLadder(standings)` | `FuturesLadder` (restyled) |
| Matches | today's matches, `matchWinnerOdds(match)` | `MatchWinnerCard`, one box per match |
| Props | `matchPropMarkets(match)` | `PropBetRow`, grouped into boxes per match |
| Fourballs | none yet | empty-state only: "No fourball markets posted yet." |

Matches/Props pages need live tournament data (`useLiveTournament`,
`getNextTournamentStatus`) exactly as `WagersHubContent` uses today. Team
Futures/Player Futures need `tournament` for odds inputs. Fourballs and
Portfolio need neither.

## My Portfolio — `app/wagers/portfolio/page.tsx` (new)

Today's `MyWagersList`, moved off the hub onto its own screen, reached via
the nav bar's My Portfolio button on every `/wagers/*` screen.

## File/component changes

New:
- `app/wagers/layout.tsx`
- `app/wagers/team-futures/page.tsx`, `player-futures/page.tsx`,
  `matches/page.tsx`, `fourballs/page.tsx`, `props/page.tsx`
- `app/wagers/portfolio/page.tsx`
- `components/wagers/WagersNavBar.tsx`
- `components/wagers/CategoryTabs.tsx`
- `components/wagers/MMToggle.tsx`
- `components/wagers/WagersEntrySplash.tsx`

Changed (restyled as "boxes", logic untouched):
- `components/wagers/TeamFuturesCard.tsx`
- `components/wagers/FuturesLadder.tsx`
- `components/wagers/MatchWinnerCard.tsx`
- `components/wagers/PropBetRow.tsx`

Removed:
- `components/wagers/WagersHubContent.tsx` — its content is redistributed
  across the hub (tabs only) and the 5 category pages; sign-in/loading
  checks move to `app/wagers/layout.tsx`.

Unchanged:
- `lib/wagers/*` (odds math, wallet, types) — no logic changes.
- `components/wagers/BetSlipSheet.tsx`, `OddsButton.tsx`, `SignInGate.tsx`,
  `MyWagersList.tsx` — reused as-is (`MyWagersList` just moves pages).

## Explicitly out of scope

- Odds math, wallet/storage behavior, wager placement logic, or the
  sign-in gate's underlying behavior — none of it changes.
- Real fourball market data — placeholder empty state until real data
  exists.
- Any functional "Real Wagers" mode — stays a "Coming soon" placeholder
  here; the actual system is `2026-08-05-wagers-phase3-real-money-design.md`'s
  job.
- The real entry-splash image — ships with a placeholder background; swap
  in once the user provides the asset.

## Testing plan

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
- `npm run dev` and manually click through: More → Wagers → each of the 5
  category tabs → back-button labels correct at each level → My Portfolio →
  back to Wagers → place a test wager on at least one market to confirm the
  existing bet slip flow is untouched → toggle to Real Wagers shows
  "Coming soon" → toggle back.
