# Player Statistics Section — Design Spec

## What this is

A new "Statistics" section on the player scorecard page
(`/leaderboard/[slug]/players/[player]`), living directly below the shot
tracker built earlier and above the player's full bio (which already renders
on this page). Modeled on the reference screenshots the user supplied (a
PGA Tour-style stats app): a horizontally-scrollable row of stat categories,
a big comparison chart for whichever category is selected, a row of small
per-round charts below it, and a dropdown to swap the comparison target from
"the field" to any specific other player in that tournament.

Scope: this tournament only (the one the page is already showing), not
career-wide. The existing career-wide table at
`/teams/stats/players/[player]` is unrelated and untouched.

## Data

All of it already exists or is directly derivable — no new data files. Six of
the seven categories are derived straight from `tournament.scorecards`, which
makes them work identically for a historical *and* a live tournament (no
dependency on data that only gets filled in after the season). Only Strokes
Gained needs the separate season stats table, since expected-strokes
benchmarking isn't something hole-by-hole scores can reconstruct.

- **`tournament.scorecards`** (existing, `PlayerScorecard[]`): every player's
  hole-by-hole detail for this tournament — `RoundScorecard.putts`,
  `girHit/girTotal`, `firHit/firTotal`, and each
  `HoleStat.{score,par,putts,fir,gir,diff}`. Derives:
  - **Scoring Summary** counts (Eagle/Birdie/Par/Bogey/Double+) via the
    existing `holeMarker(diff)` classifier, tallied across a player's played
    holes.
  - **Fairways %/GIR %**, overall and per-round — `firHit/firTotal` and
    `girHit/girTotal` are already per-round fields, summed across rounds for
    the overall figure.
  - **3-Putt Avoidance %**, overall and per-round — % of holes where
    `putts < 3`.
  - **Up-and-Down %**, overall and per-round — % of GIR-missed holes where
    `score <= par`.
  - **Putts / Round** — `round.putts / holes played that round`, plus a
    three-putt count (holes with `putts >= 3`) for the "(n)" next to it.
- **`lib/data/stats/players-<year>.ts`** (existing, Strokes Gained only):
  `strokesGained.{offTee,approach,aroundGreen,putting}` per player, keyed by
  tournament year. If a year has no table yet (true today for the
  live/upcoming tournament, which only ships a table after the season), the
  Strokes Gained category shows a "not available yet" state instead of the
  bars — same honest-placeholder pattern used elsewhere on this page.
- **Field average** = the mean of a stat across every *other* player in that
  tournament's roster (the viewed player excluded), computed fresh per
  category from whichever source above that category uses.
- **Compare-to-a-player** mode swaps the same computation to a single named
  player instead of averaging the field.

New helper module: `lib/data/stats/tournamentStats.ts` — pure functions, no
new stored data:
```
getScoringSummary(tournament, player): { eagle, birdie, par, bogey, doubleOrWorse, holesPlayed }
getFairwaysGirSeries(tournament, player, kind: "fir" | "gir"): { overallPct, perRound: {round, pct}[] }
getThreePuttUpDownSeries(tournament, player, kind: "threePutt" | "upDown"): { overallPct, perRound: {round, pct}[] }
getStrokesGained(year, player): StrokesGained | null   // thin wrapper over existing getPlayerStatsByYear
getFieldOrPlayerComparison(tournament, excludePlayer, compareTo: "field" | playerName, categoryFn): ...
```

## Categories (fixed order, matches the horizontal pill bar)

| # | Label | Chart form | Per-round minis? |
|---|---|---|---|
| 1 | Scoring Summary | 5-segment single-player donut + legend/counts, plus a row of small player-vs-comparison donuts (one per score type) | No (the mini row *is* the per-category breakdown) |
| 2 | Fairways Hit % | Big two-ring donut (player outer, comparison inner) | Yes — 4 mini two-ring donuts, one per round |
| 3 | Greens in Regulation % | Same as above | Yes |
| 4 | Putts / Round | Per-round horizontal bar pair (player bar over comparison bar), one pair per round — same form as the user's Putting reference screenshot; three-putt count shown in parens next to the value | N/A (already per-round) |
| 5 | 3-Putt Avoidance % | Big two-ring donut | Yes — 4 mini donuts |
| 6 | Up & Down % | Big two-ring donut | Yes — 4 mini donuts |
| 7 | Strokes Gained | 4 zero-centered horizontal bars (Off Tee, Approach, Around Green, Putting) — bar extends right (maroon) for positive, left (ink-400) for negative | N/A (tournament-total only; no per-round SG data exists) |

Scoring Summary's big donut never compares to field/a player (it's this
player's own shot distribution, matching the reference "Rory McIlroy
Overall" screenshot) — only its mini row does.

## Comparison target

One piece of state, lifted above the category picker so it persists across
category switches: `compareTo: "field" | <player name>`.

- Small control near the top-right of the chart area, labeled "vs Field"
  by default.
- Clicking it opens a dropdown: "The Field" (default, resets to average) +
  every other player in this tournament's roster, alphabetical.
- Changing category while a specific player is selected keeps that player
  selected — the comparison-target picker is independent of which stat is
  showing.

## Colors (validated per the dataviz skill)

Two-color comparison pairs (donuts, bars): **Player = maroon-600 (`#6b161a`)
solid**, **Field/compared player = ink-400 (`#93897e`)** on an ink-100 track.
Ran `validate_palette.js` on this pair: CVD separation ΔE 28.1, normal-vision
floor ΔE 30.5, contrast ≥3:1 vs the cream surface — all pass. (Two checks
calibrated for equal-weight categorical series don't apply here by design:
"Field" is deliberately the muted, receding color, same relationship as the
reference screenshots' vivid green vs. flat gray.)

Scoring Summary's 5-segment donut is ordinal (best to worst), not purely
categorical, so it's colored as two short ramps meeting at a neutral
midpoint: Eagle = maroon-800 (darkest/richest), Birdie = maroon-600, Par =
ink-100 (neutral, the "baseline" segment), Bogey = ink-300, Double+ = ink-600.

Strokes Gained bars: positive = maroon-600, negative = ink-400, zero line in
ink-200.

## Components (new)

- `components/stats/StatsSection.tsx` — owns `selectedCategory` and
  `compareTo` state, renders the header, category pills, compare picker, and
  whichever chart the category needs.
- `components/stats/CategoryPills.tsx` — horizontally-scrollable pill row
  (same scrollbar-hidden treatment as the rest of the app).
- `components/stats/ComparePicker.tsx` — the "vs Field ▾" control + dropdown.
- `components/stats/DonutGauge.tsx` — the two-ring player/comparison donut,
  sized `size="big" | "mini"`.
- `components/stats/ScoringSummaryChart.tsx` — the 5-segment donut, legend,
  and mini comparison row.
- `components/stats/PuttsPerRoundBars.tsx` — the per-round bar-pair form.
- `components/stats/StrokesGainedBars.tsx` — the 4 zero-centered bars.

## Placement in the existing page

In `PlayerScorecardView.tsx`, directly below the `ShotVideoPanel` block:
```
<StatsSection tournament={...} player={scorecard.player} />
```
Needs the `Tournament` object (for full-roster/full-scorecards access) and
the tournament's stats year — both already resolvable from the page's
existing `slug`/`tournament` lookups; `PlayerScorecardView` currently only
receives `scorecard`, so it gains one more prop (`tournamentSlug`) or the
section is rendered by the page component instead and passed down — settled
during implementation, doesn't change the design above.

## Out of scope

- The live/in-progress tournament case: this section reads whatever
  `scorecards`/stats data the page already has for that tournament year, so
  for a live tournament it moves the same way the rest of the live scorecard
  already does — including the field average shifting as more players'
  rounds are recorded. Not separately tested here.
- Any editing of stats data — this is read-only, same as the rest of the
  scorecard.
