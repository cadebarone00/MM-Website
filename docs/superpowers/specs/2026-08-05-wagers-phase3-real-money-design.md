# Wagers Phase 3 — MM Coins & Real Wagers — Design Spec

## Vision

Replace the throwaway, `localStorage`-only wallet from Phase 1+2 with a real,
Supabase-backed system that supports **two parallel ways to use Wagers**,
switched by a toggle, sharing the same markets (Match Winner, Player Props,
Futures) built in Phase 1+2:

- **🪙 MM Coins** — fake money, free to play, no cap on winnings. Bets settle
  against "the house" using the same mock odds already built. Whoever has the
  most MM Coins when the tournament's last market closes wins a prize (a
  free-to-enter skill contest with a prize — not gambling in the legal sense
  Real Wagers is).
- **💵 Real Wagers** — real money, peer-to-peer. You post a challenge at a
  market's odds and a stake; someone else takes it (or negotiates the stake);
  once matched, that's a real wager between those two specific people. The
  app **never holds or moves money** — it computes who owes whom and the two
  people settle directly via Venmo, off-platform.

This is a substantially different, and substantially larger, project than
Phase 1+2. It supersedes the original "Phase 3: virtual currency/wallet"
framing from the original Wagers design spec — everything below is the
actual, current plan.

## Why Real Wagers works this way (a load-bearing decision, not a detail)

Two models were considered and rejected before landing on the challenge/counter
model described below:

1. **The app holds funds and pays out automatically** (e.g. via Stripe
   Connect) — rejected. Collecting money from a group and algorithmically
   redistributing it based on a contest outcome is exactly the activity
   money-transmitter and gambling law is built to regulate, and "Maroon
   Masters" is not a registered business that can legally accept and hold
   third-party funds this way, regardless of which payment rail moves the
   money.
2. **A pari-mutuel pool** (everyone's money on a side pools together, payout
   ratio determined when betting closes) — considered, then rejected in favor
   of direct 1-to-1 challenges once the user described the actual desired
   flow in detail (a specific person's posted stake, taken or countered by
   another specific person). A pool can't give a locked-in payout at bet
   time; a matched pair can, trivially, because it's already just two
   people's agreed terms.

The system that was actually designed — a direct challenge/counter-offer
between two named people — sidesteps the money-transmitter question entirely
(the app never touches money) and gives a genuinely locked-in payout the
moment two people are matched (no pool dilution, no "final odds" ambiguity).

**This still carries real legal exposure** — real money changes hands between
people based on the outcome of a contest, even though it's peer-to-peer and
off-platform. The user has explicitly accepted this risk for a closed
friend-group event. This spec is not a legal opinion and doesn't attempt to
be one.

## MM Coins

Reuses almost everything from Phase 1+2 unchanged:

- `OddsButton` → `BetSlipSheet` → confirm → immediately resolved against
  house odds (the existing flow). No negotiation, no counterparty.
- Everyone gets a set starting balance (matches today's `STARTING_BALANCE`).
  Run out → done betting for the rest of that tournament — no top-ups, no
  replenishment.
- No cap on how high a balance can climb.

**What actually changes:**

- Balance and wager history move from per-device `localStorage`
  (`lib/wagers/wallet.ts`) to a shared Supabase table, so everyone's
  standing is comparable across devices/accounts — required for the
  end-of-tournament leaderboard to mean anything.
- Bets actually **settle** now. Phase 1+2 had no settlement — everything
  stayed "Pending" forever. Phase 3 adds a Tiger-only admin flow (extending
  the existing `/portal/admin` pattern from accounts-foundation) to enter
  real outcomes (a match's final result, a player's actual stroke count for
  a round, etc.). Entering an outcome resolves every pending MM Coins bet
  tied to that market/line: win → credit the pre-computed payout, lose →
  no change (the stake was already deducted at bet time, same as today).
- A **MM Coins leaderboard** ranks every participant by balance. Once the
  tournament's last market has closed (no more bets possible for that
  year), the top balance is the **MM Coins Champion** — the prize itself
  (amount, funding) is arranged by Tiger outside the app; the app's job is
  just to determine and display the winner unambiguously.

## Real Wagers

**Onboarding (once, before first use of Real Wagers specifically):** enter a
Venmo handle and accept a short fair-play policy
(pay any settled wager within 24 hours; provide a real, correct Venmo
handle). This gates Real Wagers only — MM Coins never needs a Venmo handle,
since no real money ever moves there.

**Posting a challenge:** tapping an odds button on any market (Match Winner,
a Player Prop line, a Futures entry) while in Real Wagers mode does not
resolve a bet — it **posts an open challenge**: a specific person, a specific
selection/line (the odds/line are fixed at posting — they never change for
this challenge), and a specific dollar stake they're offering. Framed
plainly, e.g.: *"Cade thinks Kyle plays better than 76.5 strokes in Round 2 —
$20 says so. Disagree? Take the other side."*

**Taking or countering:**
- Anyone else can **accept** the challenge exactly as posted → the two of
  them are now matched, locked to that pair, for that stake, at that line.
- Anyone else can **counter** with a different dollar amount instead (the
  odds/line never change in a counter — only the stake). This creates a
  pending counter-offer visible to the original poster.
- The original poster can **accept** the counter (matches at the countered
  amount), **deny** it (the challenge reopens at its original terms — the
  countering person, or anyone else, can still take it as originally
  posted), or **counter back** (the negotiation continues).
- Once two people are matched on a given challenge, it's no longer available
  to anyone else.

**Portfolio:** every participant has a view of their own challenges — open
(posted, unmatched), pending (a counter awaiting their response), matched
(locked to a specific other person, with that person's Venmo handle visible
right there), and settled (resolved, showing who owes whom and whether it's
been marked paid).

**Settlement:** the same Tiger-entered real outcomes that settle MM Coins
bets also settle matched Real Wagers challenges tied to that market/line.
Resolving one computes the winner and the exact amount owed (using the
odds fixed at posting time and the final matched stake — ordinary
American-odds payout math, just between two specific people instead of
against a house). No pool, no netting across multiple wagers — every
challenge was always exactly two people, so settlement is just: this
person owes that person this amount.

**Payment:** happens directly between the two people via Venmo, entirely
outside the app. The app shows the obligation clearly ("You owe
@handle $23" / "@handle owes you $41") and lets either side mark it paid.
The 24-hour clock starts at settlement.

**Enforcement:** Tiger's admin view (same extension as the MM Coins
settlement tool) surfaces overdue payments and lets Tiger ban a participant
from Real Wagers (an incorrect/fake Venmo handle, or missing the 24-hour
window, are the two stated grounds). A ban blocks posting/taking new
challenges; it does not need to unwind anything already matched.

## Explicitly out of scope for this phase

- Real payment processing, escrow, or any form of the app holding money —
  rejected by design, not deferred.
- A real, stats-driven odds engine — both MM Coins and Real Wagers keep
  using the deterministic mock odds already built in Phase 1+2
  (`lib/wagers/mockOdds.ts`). Real Wagers challenges are posted at whatever
  line/odds the mock odds module currently shows for that market; that's
  the whole point of "the odds are fixed at posting" — this phase doesn't
  change how those numbers are generated.
- Automated dispute resolution beyond "mark as paid" plus Tiger's manual
  oversight — no in-app arbitration, evidence upload, etc.
- MM Coins balance top-ups/replenishment — none, by design ("if you're out,
  you're out").
- Parlays/combos — still out of scope, unchanged from Phase 1+2.
- Play-money mode being optional/toggleable off — both modes always exist
  side by side; there's no "real money only" or "coins only" account
  setting in this phase.

## Build order

MM Coins and Real Wagers are described together here because they're one
coherent vision (same markets, one toggle), but each is its own
implementation plan — together they're comparable in size to all of
Phase 1+2. MM Coins goes first: it's smaller, mostly extends code that
already exists, and gives Tiger a working settlement tool sooner. Real
Wagers — the challenge/counter/portfolio/Venmo system — is entirely new
and follows as its own plan.

## Dependencies

- Requires accounts-foundation's `profiles` table and session system
  (shipped, per `project_specs.md`) — Real Wagers onboarding and MM Coins
  balances key off `profiles.id`.
- Requires a host/admin role to enter real outcomes — `profiles.is_host`
  already exists and `/portal/admin` already establishes the pattern for
  Tiger-only tooling.
- Builds directly on Phase 1+2's markets, mock odds, and UI components
  (`components/wagers/`, `lib/wagers/mockOdds.ts`) — those are extended,
  not replaced, for MM Coins; Real Wagers is new UI reusing the same
  underlying market/odds data.

## Resolved detail: unmatched challenges

An open Real Wagers challenge that never gets taken or countered simply
**expires when its market closes** (e.g. the round it's about starts) — it
disappears from the open list, creates no obligation for anyone, and the
stake was never at risk (nothing was ever collected). No cancellation flow
needed beyond that.

## Open questions (not blocking, flagged for later)

- Exact prize funding/amount for the MM Coins Champion — a real-world
  arrangement Tiger makes, not something the app needs to model.
