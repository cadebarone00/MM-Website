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

### Foursomes / Alternate Shot

Simulate a likely contribution for each partner using individual-ball history,
then combine those contributions into one team-hole score. Simulate the other
team the same way and compare the two combined scores.

The combination formula is calibrated against historical Foursomes team and
partnership results whenever enough team evidence exists. It must never simply
label an individual player's score as a Foursomes score.

## Live-match rules

When a match is live:

- Completed holes are fixed at their real result.
- The entered match state (leader and holes completed) is the starting state.
- Only remaining holes are simulated.
- A player, course, or format change resets the test to pre-round state to
  prevent stale live-match assumptions from carrying over.

As player scoring is entered, the Career Archive is updated. Re-running the
model therefore uses the latest archive and current match state without any
Excel upload.

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
