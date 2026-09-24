# MM Match Odds Model Specification

## Status and authority

This document is the source of truth for the MM match-odds model. Any change
to the simulator, its data pipeline, or displayed odds must preserve these
rules or update this specification in the same change.

The model produces analytical, fair probabilities and fair American odds. It
does not add a sportsbook margin.

## Match Simulator as the odds source of truth

The Tiger Center Match Simulator is the single authoritative calculation
surface for match odds. It must support a matchup at any valid course, format,
number of completed holes, and current match status. Its result is the source
of truth for:

- Pre-round winning probabilities and fair American odds.
- Live winning probabilities and fair American odds.
- Wager market prices and displayed win/tie/loss selections.
- Leaderboard win-probability displays.
- Any other public or Tiger Center odds presentation.

Those consumers must read a common model result or a stored snapshot created
by the same model. They must not independently rebuild probabilities from
their own partial calculations.

The artifact is also the visual control surface for the model. It accepts the
format, course, sides/players, holes completed, and Team A match status; Team
B status is the derived inverse. Changing a matchup, course, or format resets
the visual state to pre-round/all square. The currently validated engine is
pre-round Singles; live Singles, Fourball, and Alternate Shot become active
only after their own rules are implemented and tested against this contract.

## Canonical data source

At runtime the model reads the Career Archive only.

- Historical seasons (2024–2026) are imported once into the checked-in Career
  Archive data from the validated workbook.
- Starting in 2027, the app's scoring system creates and updates the live
  Career Archive as players enter scores and statistics.
- Excel is an historical import source, never a runtime dependency.
- `Course_Hole_Setup` is the source of truth for a target course's hole
  number, par, yardage, yardage bucket, and front/back-nine placement.

### Canonical course identity

A course and a course setup are different concepts. The model aggregates
player course history by canonical course identity: for example, `Palmer`,
`Palmer #1`, `Palmer #2`, and `Palmer #3` all belong to the canonical course
`Palmer`. The same rule applies to every course.

The setup suffix may still identify a particular round's 18-hole scorecard
configuration when its pars or yardages differ. It must not cause repeat plays
of the same course to be treated as experience at different courses.

## Eligibility of scoring data

Individual-ball data answers: “What is this player's likelihood of making a
given score on this hole?”

- Include complete 18-hole Singles rounds.
- Include complete 18-hole Fourball rounds, because every player plays their
  own ball and records an individual score.
- Exclude nine-hole rounds from model samples.
- Do not treat Foursomes/Alternate Shot team scores as individual player
  scores. They belong in the team/partnership archive.

Team-format records answer different questions and remain useful for
calibration:

- Fourball uses individual-ball samples to model each player, then applies the
  best-ball match rule.
- Foursomes uses individual-ball samples to estimate each partner's likely
  contribution, and historical Foursomes team/pair records to calibrate the
  combined team score.

## Target-hole and bucket logic

For every future or remaining hole, the simulator starts with the target
course's actual hole setup. The target setup supplies the hole's par, yardage,
yardage bucket, and front/back-nine position. Measures define which parts of
that target information are used at each stage.

An exact small sample must not dominate the result. The implementation uses a
minimum-sample threshold and weighted smoothing: more specific buckets receive
more weight, while broader buckets supply stability when specific history is
sparse or absent. Each displayed result must be able to report the samples and
fallback buckets it used.

Course-level performance can be incorporated as a separately weighted course
adjustment. It must not double-count the same score rows already selected by a
course-specific bucket.

## Measures

Measures are named, versioned views of the same valid Career Archive data.
They can be independently tested before being blended into a production
simulation.

### Measure 1 — Par-Based Individual Scoring

For a target par 3, 4, or 5, use every complete 18-hole individual-ball
(Singles and Fourball) score that player has recorded on that same par. This
is the widest player-specific model measure and supplies the stable baseline.

### Measure 2 — 10-Yard Individual Scoring Buckets

Use the same complete individual-ball archive, grouped without regard to par
into fixed 10-yard ranges: 101–110, 111–120, continuing through 641–650.
Empty buckets remain visible and are treated as no direct evidence rather than
as a zero score. The Career Stats Buckets tab displays this exact measure so
the model and the user inspect the same data.

For a target hole, Measure 2 pools the target bucket and its immediately
adjacent buckets. For example, a 435-yard hole uses 421–430, 431–440, and
441–450. Every score in those three buckets is eligible regardless of par.

### Measure 3 — Individual Round-Shape Stabilizer

Measure 3 lightly reweights, but does not reject, simulated full-round score
shapes using each player's historical 18-hole individual-ball average and
variation for eagles+, birdies, pars, bogeys, and doubles+. A very unusual
round remains possible; it receives a small soft penalty so a rare extreme
round does not disproportionately drive match odds. The size of this penalty
must be back-tested and must remain a stabilizer, not a primary predictor.

### Measure 4 — Singles and Fourball Format Adjustment

Measure 4 applies only to Singles and Fourball. It makes a small,
shrinkage-based adjustment from two format-specific signals:

- The player's win/loss/halve record in that format.
- The player's average score to par in that format relative to their overall
  individual-ball baseline.

The adjustment must be modest and smoothed toward neutral for small samples.
It must not double-count the hole-score evidence already used by Measures 1
and 2.

## Monte Carlo engine

### Pre-round Singles method

Pre-round Singles odds use two simulation layers.

For each of the 18 target holes:

1. Run 10,000 player-versus-player score-pair simulations using Measure 1's
   par-based pools.
2. Run 10,000 player-versus-player score-pair simulations using Measure 2's
   three-bucket yardage pools.
3. Retain the score pairs, not just their win/tie/loss labels, and combine the
   two sets into a 20,000-outcome hole distribution. Until back-testing proves
   a better blend, Measure 1 and Measure 2 each contribute 50%.

Then run 10,000 complete simulated matches. Each match draws one score pair
from every target hole's combined distribution, awards the hole to the lower
score or halves it, and records the final match result. Measure 3 reweights
the resulting player round shapes and Measure 4 applies its small
format-specific adjustment before the final win/tie/loss probabilities are
calculated.

### Other formats and live matches

Each model calculation runs 10,000 complete simulated matches after forming
the relevant hole distributions.

For each simulation and each unplayed target hole:

1. Draw a plausible individual score distribution for every player from their
   weighted Career Archive samples.
2. Apply the rules of the selected format to form each side's hole score.
3. Award the hole to the lower side score, or halve it when the scores match.
4. At the end of the match, record a win for side A, a tie, or a win for side
   B.

The aggregate counts from the 10,000 runs become the three outcome
probabilities. Fair American odds are calculated from those probabilities
without vig.

## Format rules

### Singles

Simulate one individual score for each player. The lower score wins the hole.

### Fourball

Simulate one individual score for each of the two players on each side. The
lowest score on a side is that side's hole score; compare those best-ball
scores.

For each target hole, every player contributes 10,000 Measure 1 par-based
draws and 10,000 Measure 2 three-yardage-bucket draws. The four individual
scores are retained in the combined 20,000-outcome hole distribution so
Measure 3 can evaluate plausible player round shapes. The lower score for
each pair becomes the team score for that simulated hole.

An `X` entered on a live Fourball scorecard means that player did not complete
the hole. It is never a Monte Carlo outcome. In live scoring, the side's hole
score is its lowest numeric player score; an `X` simply leaves the partner's
numeric score as the only eligible score. A live hole is complete only once
both teams have an eligible best-ball score.

### Foursomes / Alternate Shot

Simulate a likely contribution for each partner using individual-ball history,
then combine those contributions into one team-hole score. Simulate the other
team the same way and compare the two combined scores.

For each measure, both partners provide individual simulated scores. Their
target-hole projection is then calibrated with the all-hole historical
Alternate Shot team archive. Exact-pair history is an all-hole partnership
adjustment, shrunk toward the format average when the pair has little or no
history; a new partnership therefore still has an accurate individual-plus-
format projection. It must never simply label an individual player's score as
a Foursomes score. Pre-round Alternate Shot runs 10,000 Measure 1 outcomes and
10,000 Measure 2 outcomes per target hole, then 10,000 complete matches.

## Live-match rules

When a match is live:

- Completed holes are fixed at their real result.
- The entered match state (leader and holes completed) is the starting state.
- Only remaining holes are simulated.
- The reusable Singles engine accepts any valid through/margin state, from AS
  through one hole to a mathematically final match. The margin cannot exceed
  holes completed, and a final match returns a 100% outcome without simulating.
- For every remaining target hole, Measures 1 and 2 still create the combined
  20,000 score-pair distribution; the 10,000 finish simulations begin from
  the fixed real match lead instead of all square.
- When official completed-hole scores are available, Measure 3 includes those
  real scores plus simulated remaining scores. A manual status-only preview
  leaves Measure 3 neutral for the unknown completed-hole score shape rather
  than inventing it.
- A player, course, or format change resets the test to pre-round state to
  prevent stale live-match assumptions from carrying over.

As player scoring is entered, the Career Archive is updated. Re-running the
model therefore uses the latest archive and current match state without any
Excel upload.

## Team Winner future (Maroon vs White)

The Team Winner market prices which team finishes the whole event with more
points. Every match is worth 1 point and a halved match is 0.5 to each side,
so the event can end tied; Maroon, Tie and White are separate selections.
Implementation: `lib/wagers/teamWinnerFuture.ts` (pure simulation) and
`lib/wagers/teamWinnerPricing.ts` (data loading and publishing).

It never computes its own match probabilities. Each match's win/tie/loss
probabilities come from this match model:

- A match with a mathematically complete official result counts that result.
- A paired, unfinished match uses its latest live match odds snapshot.
- A paired match with no snapshot, and every matchup that could be posted in
  a round whose pairings aren't locked, uses the pre-round model for that
  round's format and course. These pre-round results are stored per season in
  `team_winner_pair_odds` when Tiger runs Price Team Winner.

The market then plays the rest of the event 10,000 times. Rounds without
locked pairings draw a fresh, legal random pairing of each team's roster in
every simulation (every player plays; Fourball and Foursome use two-player
sides), so every possible matchup contributes. Match outcomes are treated as
independent. The share of simulations each team wins, or ties, becomes the
probability, priced as fair American odds without vig.

Guardrails:

- The market does not publish odds while any round lacks a format or course,
  the rosters are empty, or any needed matchup couldn't be priced (for
  example, a player without Career Archive history on that course).
- Odds refresh after every official match publication and closeout. A bet is
  refused while newer match odds or official state exist than the published
  Team Winner odds used.
- Betting closes once a team can no longer be caught, or a tie is locked in.
- Settlement is automatic when the last scheduled match is closed out
  (`supabase/team_winner_future.sql`).

## Low Individual future

The Low Individual market prices which player finishes with the fewest total
strokes across every Singles and Fourball round. Foursome/Alternate Shot
rounds are excluded because they produce no individual score. Every
rostered player is assumed to play, and finish, every hole of every
individual-ball round. Implementation: `lib/wagers/lowIndividualFuture.ts`
and `lib/wagers/lowIndividualPricing.ts`.

For every unplayed hole, the simulation uses the round's target course
setup and the same eligible individual-ball Career Archive rows as the match
model. It draws one of the player's historical scores from Measure 1 (same
par) or Measure 2 (the three-bucket yardage pool), 50/50, or from whichever
pool has history if only one does. Confirmed live scores are fixed. The whole
remaining event is played 10,000 times.

Ties for first settle dead heat: each tied player's winning bets are paid
their potential payout divided by the number tied. Each simulation therefore
credits every tied player a share of 1/k. These dead-heat win shares sum to 1
and are priced as fair American odds without vig.

Guardrails:

- No odds publish while any round lacks a format, an individual-ball round
  lacks a course, the rosters are empty, or a player has no usable history
  for some target hole.
- Measures 3 and 4 are not applied yet. This is a stroke-total market, not a
  match, so the format adjustment does not apply as specified.
- Odds refresh after every official match publication and closeout, and the
  public read recomputes them when they are over 10 minutes old.
- Bets are refused while newer match data exists than the odds used. Betting
  closes once every hole is in.
- Settlement is automatic once every match is closed out and every rostered
  player has a confirmed score on all 18 holes of every individual-ball
  round (`supabase/low_individual_future.sql`). A missing hole holds
  settlement until it is entered.

## Required outputs

Every odds calculation should show:

- Side A win probability and fair American odds.
- Tie probability and fair American odds.
- Side B win probability and fair American odds.
- Starting (pre-round) odds and, when applicable, current live odds.
- Current match state and holes remaining.
- A transparent explanation of the target-hole source, sample counts,
  weighting/fallback buckets, and any sparse-data warning.

## Guardrails

- This is a predictive model, not a promise of an outcome.
- Sparse samples widen uncertainty; they must not be presented as precise
  certainty.
- The model uses only valid 18-hole archive records for its relevant layer.
- Changes to buckets, thresholds, weighting, calibration, formats, or output
  odds require updating this document and adding a repeatable test.
