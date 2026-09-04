# Live Match Publication, Confirmation, Archive, and Odds

## Goal

Make one confirmed live-score event the authoritative source for every
live-facing feature: match-play status, individual leaderboard, player
portal, Career Archive, odds, Wagers, and broadcast. Tiger retains the
ability to edit scheduled/locked matchups and to perform the final match
closeout before a wager can settle.

This supersedes the earlier scoring spec's statement that a Tiger review is
the first time a score becomes official. A score becomes **official live**
when its assigned scorer and its player agree. Tiger's closeout remains the
final accounting/audit action, not the routine publishing mechanism.

## Terms

| Term | Meaning |
| --- | --- |
| Active roster | The twelve players assigned to Maroon/White for one season: six per team. |
| Non-playing player | A registered player not on that season's active roster. They show `Did Not Play` and have no live schedule/scoring assignment. |
| Match lock | A publishable but editable setup state. It creates/updates downstream records; it does not freeze them. |
| Armed | A round has been started by Tiger; its match boxes wait for their own tee time. |
| Upcoming match | Locked/armed match before its tee time and before a Tiger override. |
| Live match | Tee time reached or Tiger used Start Match. |
| Draft/disputed score | A player's own entry and assigned opponent's entry are missing or disagree. It is not official. |
| Confirmed score | The player's self-reported stroke count equals the official score entered by their assigned scorer. |
| Published hole | A confirmed score is included in authoritative match state and all downstream views. |
| Closeout | Tiger's final review of a completed match. It freezes the result and permits wager settlement. |

## 1. Season roster and setup

1. Tiger may maintain more than twelve site players.
2. For each season, Tiger selects exactly six Maroon and six White active
   roster players before matchups can be locked.
3. Only active-roster players can receive a match box, Player Portal
   upcoming match, scoring access, archive round shell, or live-odds input
   for that season.
4. Tiger configures round count, dates, course, format, tee times, and match
   boxes. A box is a match and contains its ordered player positions.
5. The ordered positions define scoring assignments:
   - Singles: each player scores the other.
   - Fourball: Maroon 1 scores White 1 and vice versa; Maroon 2 scores White
     2 and vice versa.
   - Alternate Shot: one shared score per team; the designated opposing side
     records it.

## 2. Lock is a publish/update operation, not immutability

When a round has a course/format and matchups are locked:

1. Create or update the scheduled Career Archive round shells for each active
   player assigned to a box, with course, format, tee time, partner,
   opponents, and the configured 18 holes.
2. Upsert the match into Player Portal, scoring, public upcoming matches, and
   the match-play leaderboard.
3. Calculate and save a **pre-round odds snapshot** for that match. Every
   odds display reads that one snapshot/output contract.
4. Editing a locked course, tee time, player position, or matchup remains
   permitted to Tiger. The system must update the affected archive shells,
   public/portal match record, and pre-round odds snapshot. It must reject
   destructive edits once an official live score exists unless Tiger follows
   an explicit correction flow.

## 3. Starting a round and a match

1. Tiger's **Start Round** changes a fully configured round to `armed`.
   It does not automatically make every match live.
2. Each match becomes live at its own tee time while its round is armed.
3. Tiger's **Start Match** button overrides the tee time for that one box.
4. Before a match is live, public surfaces show its tee time. Once live,
   they show the live indicator and blank `THRU` until the first published
   hole. Thereafter they show `THRU <latest consecutively completed hole>`.

## 4. Score entry and confirmation

### Individual Singles/Fourball score

For each player's hole:

1. The player enters their own stroke count and personal stats (putts, FIR,
   GIR) where applicable.
2. Their assigned opposing scorer enters the official stroke count.
3. If both stroke counts match, that score is confirmed and publishes.
4. If either entry is absent, or they differ, it remains disputed. Draft and
   disputed values may be visible in the scoring experience but must not
   alter official match state, public leaderboard, Career Archive model pool,
   odds, Wagers, or broadcast.

### Fourball `X`

`X` is never a simulated/model outcome. It is a live-scoring action for a
player who does not finish a hole. Before saving, show this confirmation:

> If the player does not finish this hole, the recorded score will be double
> par.

On approval, store the course's double-par score: 6 on a par 3, 8 on a par
4, or 10 on a par 5. It goes through the same assigned-scorer confirmation
and publish rule as any other score. It counts for the live match and
leaderboard, but carries a `did_not_finish` marker so it is excluded from
personal stats and future odds-training pools.

### Alternate Shot

Alternate Shot has one official team score per hole. It affects team
match-play state and Alternate Shot archive/match history, but does not
create individual-ball score, putt, FIR, or GIR samples.

## 5. Confirmed-hole publisher

The server performs all official publication in one transaction or
idempotent retry-safe workflow after a score becomes confirmed:

1. Mark the score confirmed and write an audit event.
2. Upsert the canonical Career Archive hole/round information.
3. Recalculate official match state from confirmed holes only.
4. Update the live match box's status, leading side, latest completed hole,
   and mathematical-clinch state.
5. Update individual/team leaderboard aggregates and public match views.
6. Add the confirmed, eligible Singles/Fourball individual hole to the
   Career Archive model pool immediately. A round need not be complete for
   this raw per-hole sample to improve future/upcoming odds.
7. Recalculate and save an odds snapshot using completed holes as facts and
   simulating only the remaining holes. Publish that snapshot to odds,
   Wagers, leaderboard, Player Portal, and broadcast consumers.
8. Emit one realtime/publication event for consumers to refetch official
   state; consumers must not independently infer different match results.

The player scoring UI can write a draft value, but it must never call these
steps directly from the browser.

## 6. Live odds

The Match Simulator model is the one odds engine and model-version contract.

- Pre-round: simulate all 18 holes and save a pre-round snapshot on matchup
  lock/update.
- Live: confirmed holes through the current match state are fixed facts.
  Simulate only remaining configured holes from the same model pools, then
  combine the simulated remaining result with the official current lead.
- A draft/dispute causes no odds refresh. A correction to a published hole
  replaces the current snapshot and recalculates all unclosed consumers.
- Every snapshot records match ID, model version, current state, input data
  timestamp, probabilities, fair American odds, and created timestamp.

## 7. Match completion and closeout

1. A match can become mathematically complete before 18 holes. Unplayed holes
   no longer affect the match result, but players still enter their actual
   remaining holes for the individual leaderboard and Career Archive.
   Match-play points and the public final match result update immediately
   from the confirmed clinch; no score is invented for an unfinished hole.
2. Players may submit only after all required 18-hole score entries have
   been confirmed. Singles/Fourball submissions also require their personal
   putt/FIR/GIR entries. Their submissions surface a Tiger review card
   containing player totals, match status, disputes, and any unconfirmed
   holes.
3. Tiger may correct an official score before closeout. The normal publisher
   recalculates archive, standings, odds, and public views.
4. **Close Out Match** is available only when the required match result and
   submitted/confirmed data satisfy the format's completion rules. It is the
   final audit checkpoint and authorizes wager settlement; it does not delay
   the already-published result or match-play points.
5. Wagers show the confirmed winner/result after closeout. They must not pay
   merely because a live match is mathematically decided.

## 8. Data eligibility

- Confirmed individual Singles and Fourball holes enter the player-level
  historical sampling pool immediately, including a player who later has an
  incomplete round.
- Fourball's individual scores remain stored even though only the lower team
  score decides the match hole.
- Alternate Shot team scores are retained for team/partnership and Alternate
  Shot calibration data in a distinct team-hole archive, never as
  individual-ball score samples.
- Unplayed match holes, draft scores, and disputed scores never become model
  samples.
- Complete rounds remain useful for round-level summaries, quality checks,
  and format/consistency measures, but do not gate the raw confirmed-hole
  pool.

## 9. Required audit records

Persist who/what/when for: roster assignment, match lock/update, arm/start,
each player and opponent score entry, confirmation/dispute, `X` conversion,
Tiger correction, odds snapshot, player submission, and closeout/wager
settlement. This is required both for corrections and future probability
visualizations such as tournament-win chances.

## Delivery plan

1. **Foundation:** database state for score-entry audit, confirmed publication,
   official match state, odds snapshots, and closeout.
2. **Scoring:** change scoring routes/UI to retain draft entries and publish
   only confirmed values; add Fourball `X` confirmation and Alternate Shot
   shared-score rules.
3. **Lifecycle:** roster eligibility, editable locked-match propagation,
   arm/tee-time/start-match state, public upcoming/live `THRU` surfaces.
4. **Odds:** invoke the canonical model on lock and confirmed-hole publish;
   store/publish snapshots.
5. **Closeout:** Tiger review card, correction flow, standings/points,
   settlement gate.
6. **Verification:** unit tests for assignment/confirmation and match state;
   integration/manual walkthrough for Supabase realtime, tee-time transitions,
   and cross-surface consistency.

## Explicit non-goals for the first slice

- Tournament-win probability visualizations.
- Automated settlement reversal after a completed payout; corrections after
  closeout require an explicit Tiger/admin policy.
- Offline score-entry queueing.
