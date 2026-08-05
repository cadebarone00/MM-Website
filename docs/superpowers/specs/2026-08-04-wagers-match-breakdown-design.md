# Wagers — Match Breakdown + Wagers Hub (Phase 1+2) — Design Spec

## Vision

Add a "Wagers" feature: fake-money betting on Maroon Masters matches,
player props, and tournament futures. Winners are paid a real prize at
the end of the tournament; buying extra fake credits is framed as a
donation to the Maroon Masters, not a purchase of chances to win (legal
framing still being finalized by the user — noted under Open Questions,
not blocking this phase).

**This is a large feature split into five phases.** This spec covers only
the first two, combined at the user's request:

1. **This spec** — Match Breakdown page + Wagers hub, with realistic
   mock odds and a fake local balance. No real money, no real odds
   model, no auto-settlement.
2. *(same spec)*
3. Virtual currency/wallet — real balance persistence, "purchase =
   donation" flow, transaction ledger, end-of-tournament payout
   accounting. Needs its own spec; carries real financial/legal weight.
4. Odds engine + auto-settlement — moneyline/spread/prop odds computed
   from historical + recent player stats; wagers resolve automatically
   off live match/score data.
5. Historical stats data pipeline — admin-side upload of player
   performance data that feeds Phase 4's odds engine.

Target: fully live (all five phases) before the 2027 Maroon Masters.

## Dependency: accounts-foundation

Wagers must be open to **any signed-in account** — fans, players, and
Tiger alike, not just Scorekeeper player/host logins. That general
"anyone can sign up" system is the previously-spec'd
[`accounts-foundation`](2026-08-04-accounts-foundation-design.md)
project, which has an approved design + implementation plan but has
**not been built yet** as of this spec.

This spec's sign-in gate is written against "any signed-in account" in
the abstract. Until accounts-foundation ships, there is no such thing —
`lib/useAccountSession.ts` only recognizes player/host Scorekeeper
sessions. Practically: this feature can be built and reviewed against
mock/no-session state now, but **cannot go live for real fans until
accounts-foundation ships**, and its gate check should be revisited to
call whatever session hook accounts-foundation lands with.

## Routes

- **`/leaderboard/[slug]/matches/[matchId]`** — Match Breakdown page.
  Mirrors the existing `/leaderboard/[slug]/players/[player]` pattern
  used by player tournament profiles. `matchId` is `RealMatch.id`.
- **`/wagers`** — Wagers hub. Added to `MORE_LINKS` in
  `components/nav/MorePanel.tsx`, so it appears in both the mobile
  full-screen panel and the desktop 25%-width drawer for free — no
  separate nav wiring needed.

## Entry point: match rows become tappable

`CompactMatchRow` (used by `TeamMatchesBoard` on the leaderboard's Team
Match Play view) currently renders a static row. It becomes a `<Link>`
wrapping the whole row (not just player names, which keep their own
nested links to player profiles — nested links aren't valid HTML, so the
row wrapper will need to be a `<div>` with an `onClick`/router-push
instead of a literal anchor, or the player-name links get `stopPropagation`
on their own click handler; implementation detail for the plan) pointing
to `/leaderboard/[slug]/matches/[match.id]`.

## Match Breakdown page

**Header:**
- Maroon players vs. White players (`match.maroonPlayers` /
  `match.whitePlayers`), reusing `TeamSide`'s player-link styling from
  `CompactMatchRow`.
- Live status label/chevron — reuse `liveLabel()` / `matchLeader()` /
  `ResultChevron` exactly as `CompactMatchRow` does today, so this page
  and the leaderboard row never disagree about match state.
- Session, format, and day (e.g. "Day 2 · Morning · Foursomes").

**Wagers section** (top, directly under the header):
- **Match Winner** — two-way mock odds, Maroon vs. White, styled like
  the moneyline column in the reference screenshots.
- **Player Props** — mock markets scoped to the players in *this* match
  only:
  - "`{Player}` wins their match" (moneyline)
  - "`{Player}` over/under `{line}` strokes" (this match)
  - "`{Player}` over/under `{line}` birdies" (this match)
- Every odds button opens the Bet Slip (below).

**Statistics section** (below Wagers):
- Format/session/day (repeated here for a page that might be linked to
  directly, e.g. from Wagers hub).
- Live margin and thru-holes (`match.margin`, `match.holesRemaining`,
  `match.thru`) when the match is live or final.
- **No hole-by-hole strip** — `RealMatch` has no per-hole match-play
  result today (confirmed by reading `lib/data/types.ts` and
  `app/api/live-feed/route.ts`); adding that is future work, not this
  phase.

## Wagers hub (`/wagers`)

**Signed out:** gate screen only — "Sign in to see Wagers" message plus
buttons to `/login` and `/signup`. No odds, balance, or match data
renders for a signed-out visitor.

**Signed in:**
- Fake balance shown at the top of the page (starts at 1,000 credits
  the first time a given signed-in account opens `/wagers`).
- **Today's Matches** — same match list as Team Match Play, each row
  linking to its Match Breakdown page (reuses `TeamMatchesBoard`'s
  day-grouping/session-header logic where practical).
- **Player Props** — flat, browsable list of prop markets for today's
  players, independent of any one match (this is the part of "prop bets
  on players" the user asked for that's *not* deferred — only the
  "surface props on the player's own tournament-profile page" part was
  deferred to a later phase).
- **Futures** — two lists:
  - *Tournament Winner* — every player in `individualLeaderboard`,
    ranked by mock odds, styled as the multi-outcome ladder in the
    reference screenshots (name + Yes/No-style odds).
  - *Team Winner* — Maroon vs. White, two-way mock odds.
- **My Wagers** — every bet the signed-in account has placed this
  tournament. Every row shows status **Pending** — there is no
  settlement engine yet (Phase 4), so nothing here ever resolves to a
  win/loss in this phase.

## Placing a bet (Bet Slip)

Tapping any odds button (on the Match Breakdown page, a Wagers-hub match
row, a prop row, or a futures row) opens a bet-slip sheet for **that one
selection only**:
- Shows the market description, the odds, a stake input, and the
  resulting potential payout.
- Confirming deducts the stake from the fake balance and adds a
  **Pending** row to My Wagers.
- **No parlays/combos** — the reference screenshots have a "COMBO"
  button; deliberately excluded here to keep this phase's scope
  reasonable. Straightforward to add later if wanted.

## Data & storage (this phase only)

- **Mock odds:** new lightweight data module (e.g. `lib/wagers/mockOdds.ts`)
  generating deterministic placeholder odds per match/player/market —
  seeded off IDs, **not** reactive to live match state (per the user's
  choice of "simple hardcoded/randomized placeholders" over odds that
  react to real data). Fully replaced by Phase 4's real odds engine
  later; nothing here is meant to survive that phase.
- **Balance + My Wagers:** stored client-side, keyed to the signed-in
  account, using the same lightweight localStorage approach already used
  for Scorekeeper sessions elsewhere in this codebase. Real server-side
  persistence arrives with Phase 3's wallet system — this phase's
  storage is explicitly throwaway/local.

## New components (proposed locations)

Following the existing `components/<feature>/` convention
(`components/leaderboard/`, `components/match/`, `components/nav/`):
- `components/wagers/` — `MatchWinnerCard`, `PropBetRow`,
  `FuturesLadder`, `BetSlipSheet`, `BalancePill`, `SignInGate`.
- `app/leaderboard/[slug]/matches/[matchId]/page.tsx` — Match Breakdown
  page.
- `app/wagers/page.tsx` — Wagers hub page.
- `lib/wagers/` — mock odds generation, balance/ledger localStorage
  helpers, shared types.

## Explicitly out of scope (this phase)

- Real money or real persistence of any kind (Phase 3).
- Purchasing fake credits ("donation" flow) (Phase 3).
- Auto-settlement / win-loss resolution of any wager (Phase 4).
- The real, stats-driven odds engine (Phase 4).
- Hole-by-hole match-play data, and any UI built on it (future,
  unscoped).
- Prop bets surfaced on the Player Tournament Profile page (deferred,
  later phase reusing this phase's prop-bet components).
- Parlays/combo bets.
- Anything about how accounts-foundation itself works — this spec only
  depends on it, doesn't design or redesign it.

## Open questions (not blocking, flagged for the user)

- The "buy fake credits as a donation, win a real prize" structure may
  have sweepstakes-law implications (e.g., a no-purchase-necessary
  entry path is often legally required for this pattern in the US). The
  user has said this is still being worked out — worth resolving before
  Phase 3 (real purchases) ships, not before this phase.
