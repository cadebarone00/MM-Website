# MM Match Odds Model Specification

## Status and authority

This document is the source of truth for the MM match-odds model. Any change
to the simulator, its data pipeline, or displayed odds must preserve these
rules or update this specification in the same change.

The model produces analytical, fair probabilities and fair American odds. It
does not add a sportsbook margin.

## Canonical data source

At runtime the model reads the Career Archive only.

- Historical seasons (2024–2026) are imported once into the checked-in Career
  Archive data from the validated workbook.
- Starting in 2027, the app's scoring system creates and updates the live
  Career Archive as players enter scores and statistics.
- Excel is an historical import source, never a runtime dependency.
- `Course_Hole_Setup` is the source of truth for a target course's hole
  number, par, yardage, yardage bucket, and front/back-nine placement.

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
course's actual hole setup. Historical individual scores are weighted by how
closely they match that target hole:

1. Exact course configuration + par + yardage bucket + front/back nine.
2. Par + yardage bucket + front/back nine across all courses.
3. Par + yardage bucket across all courses.
4. Player's overall complete individual-ball baseline.

An exact small sample must not dominate the result. The implementation uses a
minimum-sample threshold and weighted smoothing: more specific buckets receive
more weight, while broader buckets supply stability when specific history is
sparse or absent. Each displayed result must be able to report the samples and
fallback buckets it used.

Course-level performance can be incorporated as a separately weighted course
adjustment. It must not double-count the same score rows already selected by a
course-specific bucket.

## Monte Carlo engine

Each model calculation runs 10,000 complete simulated matches.

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
