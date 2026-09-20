# Live Scoring Round Lifecycle — Design (v3)

**Status:** v3 (2026-09-20) — all design questions answered by the user; ready for implementation planning. Nothing in this document is built yet.
**Supersedes** two earlier drafts of the same day (v1: "everything becomes official at Tiger's closeout"; v2: side-by-side comparison of both scorers' numbers). Both were replaced after review.
**Scope:** How a tournament (Maroon Masters) round is started, scored live, confirmed, submitted by both scorers, and reviewed by Tiger, and which outputs update when.
**Not in scope:** Handicap "Submit a score" (personal rounds) — already built. Real-money wagers (separate spec).

---

## 1. The model in one page

- **Live things update hole by hole.** Leaderboards, team points, match results, player statistics, odds, the broadcast and match cards all derive from the *matched* hole scores as they come in.
- **Official records are created when both scorers submit.** Handicap (Maroon Masters and Overall) and the rounds archive are written when a player **and the person who scored them** have both pressed Submit Round.
- **Trust comes from two players agreeing.** There are no paid scorers. When two independent entries match, the number is treated as legitimate and accurate.
- **Everything public is derived, so nothing is ever stuck.** Points, leaderboards and match results are a public view of the underlying hole scores. If a score is corrected — by a player before they submit, or by Tiger at any time — the views recompute and are simply correct again.

This is the same idea as the Clippd Scoreboard app used in college golf: you keep score for a playing competitor, they keep score for you, and you both confirm at the end.

### Sources of truth
From here on every statistic comes from one of two places: **live scoring** (tournament rounds) or **handicap scoring** (personal rounds). Together with the 2024–2026 archive that was uploaded because those three years were played before this app existed, these are the recorded rounds all data and stats are read from. The Google Sheet is not a source; it is a **backup copy** written from live scoring (§9.4).

### The four layers of defense against a wrong score

| Layer | What it is | Who |
|---|---|---|
| 1. Hole by hole | Each hole is entered by both scorers; a mismatch turns red and must be resolved before moving on | Players |
| 2. End-of-round status | On your Scorecard the round total is **white** while the other scorer hasn't finished, **red** if any hole disagrees (that hole's number turns red), **green** when everything matches | Players |
| 3. Submit Round | Available only when the totals are green; when a player and their scorer have both submitted, the round becomes their official record | Players |
| 4. Tiger | A review "closeout" stamp, plus the ability to edit any score at any time, before or after | Tiger |

Layers 1–3 are *prevention*. Layer 4 is the safety net so a mistake is never permanent. Tiger should rarely need to change a live score, because players resolve disagreements with each other until they submit.

## 2. Handicap scoring vs live scoring

| | Handicap scoring | Live scoring |
|---|---|---|
| Who starts it | The player | Tiger — matchups are locked and the round is assigned |
| Who is scored | Only yourself | Yourself **and** the person you are scoring for |
| Trust model | Trust the player | Two independent entries must agree; both then submit |
| Saved | On the device, sent once at the end | Each hole goes to the server as you play |
| Leaving | Exit, or delete the round | Leave the screen freely; you can never abandon or delete the round |
| Feeds | The player's handicap index | Live: leaderboards, team points, match play, player statistics, odds, broadcast. On both submits: handicap (Maroon Masters + Overall) and the rounds archive |
| Done means | Submit Scores, final | Both scorers submit; Tiger's closeout is a review stamp |

Alternate Shot (Foursome) is **team-only** everywhere: one team score per hole, no putts/fairways/greens, never an individual sample, never a handicap round (already the rule; keep it).

## 3. Decisions already made (by the user)

1. A live round can never be deleted. It stays the player's current round until it is finished, and leaving the Scoring tab and returning leaves progress unchanged.
2. The Scoring tab shows the full matchup — the match, who you play, who you are scoring for — and a **Begin Round** button.
3. Everything that needs to be live updates per hole. Submit Round does **not** change how live data updates.
4. Handicap and the rounds archive are written when the player and their scorer have both submitted.
5. **Player statistics count holes as they match** — no waiting for submit or closeout.
6. **The other scorer's numbers are never shown.** Your Scorecard shows your own entries; the round total shows the state by color (white / red / green) and disagreeing holes show a red hole number (§7.3).
7. Submit Round turns maroon and becomes usable only when the totals are green.
8. Players may change scores after finishing and before submitting; they resolve any disagreement with each other.
9. Tiger's closeout is a review stamp ("reviewed, accurate, moving on"). **Wagers settle at closeout.** Tiger can edit any score at any time, including after submission and after closeout.
10. **Matches finish early, as a feature.** Up 3 with 2 to play means the match is over (3&2) and it updates immediately. Players still play and enter all 18 holes so their round counts.
11. Once a player and their scorer have both submitted, the player's Scoring tab moves on to their next round right away; it does not wait for Tiger.
12. After Submit Round the card is locked for the player. Only Tiger can change it.
13. Points and leaderboards are just a public view of the data. If a correction changes them, they adjust. They only need to be correct.
13a. **Wagers are reversible.** Tiger's closeout is the confirmation that triggers payouts. If Tiger later edits a score so that a settled match has a different winner (very unlikely), the payouts are reversed and the market is settled again with the correct winner. A reversal path is to be built.
14. **The public `/leaderboard` and team points come straight from live scoring.** The Google Sheet is kept as a backup copy fed from live scoring; Supabase is primary.

## 4. What updates when

| Output | Timing (target) | Today | Gap |
|---|---|---|---|
| Match status and result (including early finish) | Per matched hole | Derived per hole; `complete` at the clinch | Display wording ("3&2") and the same rule everywhere (§6) |
| Team points | Per matched hole (awarded when a match is decided) | Broadcast derives them from official state | Public `/leaderboard` does not — it reads the Google Sheet (§9.4) |
| Individual leaderboard | Per matched hole | Broadcast reads live scores | Public `/leaderboard` reads the Sheet (§9.4) |
| Player statistics | Per matched hole | Already reads confirmed holes as they arrive | None |
| Odds and model data | Per matched hole | Snapshot per revision; model reads confirmed archive holes | None — keep |
| Broadcast, live match cards | Per matched hole | Supabase + Realtime | None — keep |
| **Handicap** (Maroon Masters + Overall) | When player **and** scorer have submitted | Counts as soon as 18 confirmed holes exist | Must wait for both submissions |
| **Rounds archive** (player-facing) | Same | Confirmed holes mirror in live; status `live` → `final` at Tiger's closeout | Needs an "official" state tied to both submissions |
| **Wager results** | At Tiger's closeout | Settled at closeout | No reversal path if a correction *after* closeout flips a winner — to build (§8.3) |
| Google Sheet | Backup copy, per matched hole | Sheet is the public feed's source; the new system never writes it | Reverse the direction (§9.4) |
| Tiger score edits | Any time | **No tool exists for live rounds** | Missing (§8) |

Every row hangs off one source of truth, `live_hole_scores`. A correction to it must reach every row automatically — that is a requirement, not a feature (§8.2).

## 5. How it works today (verified in code, 2026-09-20)

**Hole entry (`ScoringPanel` → `POST /api/portal/scoring/hole` → RPC `submit_live_hole_reliable` → `submit_live_hole`).**
- Each player's entry (own score, opponent's score, putts/fairway/green) goes to `live_hole_submissions`. Retries are idempotent; a stale edit from another device is rejected.
- For every player the function upserts `live_hole_scores`: `score` is what the *scorer* recorded for that player, `self_reported_score` is what the player recorded, and `confirmed_by` is set only when both agree. A disagreement retracts both sides' confirmation.
- The client already derives a per-hole state — `empty` / `submitted` (waiting on the other scorer) / `confirmed` / `disputed` (`holeSubmissionStatus`) — and shows it on the hole strip.

**Triggers on `live_hole_scores`.** `queue_live_publication` → `publishOfficialMatchState` writes `live_match_official_state` (leader, margin, holes through, `complete` when one side is up by more holes than remain) and an odds snapshot. `mirror_live_score_to_career_archive` writes **confirmed** holes to `career_archive_live_holes` (individual formats) or `career_archive_team_holes` (Foursome, once both partners agree) and retracts them if a hole becomes disputed.

**The broadcast already treats a clinched match as final.** `final = closed_out || complete`; a `complete` match awards 1 (or ½ for a tie) team point and reports `thru = 18 − holes remaining`, so 3&2 is derived from `margin` and `thru`. Early finish is therefore mostly a matter of applying this same rule everywhere.

**Closeout (`close_live_match_atomic`, host only).** Requires confirmed scores for every player on every hole played (may close early when decided). In one transaction it writes the closed-out state, sets the match `Final`, sets the archive rounds `final`, audits, and settles the MM Coin market once. Tiger's card lists matches whose status is `complete`.

**Round submission.** `live_match_box_submissions` records "this player submitted". Today `submit_live_hole` writes it **automatically** the moment a player has 18 confirmed holes (and deletes it when a hole becomes unconfirmed). The unused manual route `POST /api/portal/scoring/submit` already holds the full Submit Round validation (all responsible holes confirmed, own stats complete) and writes the same table plus a `player_submitted` audit event — it always fails today because the automatic insert has already created the row.

**The Scoring tab** picks the lowest-numbered locked round whose match is not `Final` (`findCurrentRoundForPlayer`), so today a player's tab only moves on when Tiger closes the match out.

## 6. Feature: matches that finish early

- A match is decided the moment one side is up by more holes than remain (existing `mathematicallyComplete`). It is shown as, for example, "Maroon def. White 3&2" (margin 3, 2 holes remaining); a tie can only occur after 18.
- Team points and every public view update at that moment — derived, never separately stored.
- **Players keep playing and entering holes to 18.** The round still needs 18 holes for the handicap and the archive, and it stays on the Scoring tab until it is finished and submitted. Holes after the clinch cannot change the match result (already true in `matchBoxResult`); the hole selector marks them "match decided".
- If a later correction un-decides the match (a hole flips so the lead no longer exceeds the holes remaining), the match returns to live and the derived points and results follow.
- If a correction flips the winner, all derived views adjust. Wagers are only affected if the match was already closed out (§11 Q1).

## 7. Design — Phase 1: the player lifecycle

### 7.1 Scoring tab (`/portal/scoring`)
Driven by the player's current round, now chosen as the lowest-numbered locked round that this player has **not finished** — finished meaning the player and their scorer have both submitted, *or* the match is `Final`. (Today only `Final` counts, which is what would otherwise keep a player waiting on Tiger.)

| State | Shown | Button |
|---|---|---|
| No match yet | "Waiting For Matchup" | — |
| Upcoming | Full matchup, tee time, course, format, "Waiting For Round To Begin" | disabled |
| Live, no holes submitted | Full matchup | **Begin Round** |
| Live, holes submitted | Same, plus "Through N holes" | **Continue Round** |
| Live, all 18 matched, not submitted | Same, plus "Your card matches — submit your round" | **Continue Round** |
| You submitted, scorer has not | "Round submitted — waiting on <name>" | **View Scorecard** (read-only) |
| Both submitted | Moves on to the next round, or "Waiting For Matchup" | — |

Full matchup = round and format, course and tee, tee time, "You & <partner> vs <opponents>" (existing `matchupLabel`) and an explicit **"You are scoring: <name>"** line (your scorer is the opposing-position player — `scoringSides`; for Foursome, the opposing team). Begin/Continue open `/portal/scoring/play` on the first hole not yet submitted. Beginning is navigation only.

### 7.2 Scoring screen
Unchanged: per-hole entry, confirmed/disputed hole strip, offline queue. No delete or discard; the back arrow keeps normal Back behavior.

### 7.3 The Scorecard (live) — your entries plus a status color
The Scorecard button (already built) opens the live Scorecard. Changes from what is built today:

- **Remove the competitor grid.** The other scorer's numbers are never shown (Decision 6), so the two entries stay independent.
- **Grid (horizontal scroll, one column per hole):** Hole, Yardage, **Your score**, **<Opponent>'s score** (both as *you* entered them), then Putts, Fairway, Green (individual formats; your own stats). Nothing from the other scorer's entry appears.
- **Hole number states**, taken from the existing per-hole status: normal when confirmed or not yet entered, **white/neutral** while waiting on the other scorer, **red** when that hole disagrees. Tapping a red hole jumps back to it so you can talk with your scorer, resolve it, and change it.
- **Round totals** (your total and <Opponent>'s total, side by side) with one shared state:
  - **White** — data is missing: either you or your scorer has not finished entering the holes. You cannot confirm yet.
  - **Red** — one or more holes disagree. Those hole numbers are red.
  - **Green** — all 18 holes are entered by both scorers and every hole matches.
- **Totals box** (Score, To Par, Putts, Fairways, Greens) — the same shared box as handicap, from your confirmed values. Foursome shows team score and to-par only.
- **Submit Round pill**, full width like the box: **grey/disabled with the reason** ("Waiting for <Scorer> to finish", "Hole 12 doesn't match") until the totals are green, then **maroon**. Pressing it opens the Confirm dialog: "After you submit your round you will not be able to edit it. Tiger can correct it later if something is wrong." — **Submit Round** / **Keep editing** (Keep editing is the default focus; Escape backs out).
- **Fourball:** the state is between you and your opposing-position scorer only, never your partner. **Foursome:** team score against the opposing team's entry; all four players submit.
- After you submit the card is read-only and shows "Submitted — waiting on <scorer>".

### 7.4 Submit Round — server
Reuse and repair rather than add:
1. **Stop auto-submitting.** Remove the automatic `live_match_box_submissions` insert/delete from `submit_live_hole`; the row now means "the player pressed Submit Round".
2. **Explicit submit.** Move the validation in `POST /api/portal/scoring/submit` into one transaction (RPC `submit_live_round(p_box, p_player)`): every hole 1–18 confirmed for each player the caller is responsible for; own stats complete for individual formats (pickups marked `did_not_finish` allowed); match open for scoring; not already submitted. Insert the submission row and a `player_submitted` audit event. Idempotent for repeat presses.
3. **Lock.** `submit_live_hole_reliable` rejects entries from a player who has submitted ("Your round is submitted. Tiger can change it."). There is no player "unsubmit".
4. **A scorer's later edit must never un-submit anyone.** If the other scorer enters a different number afterwards, the hole shows red to *them* and they cannot submit until it matches; the submitted player's entries stay frozen. Tiger can resolve it (§8).
5. **Official when the pair agrees.** When a player and their scorer have both submitted, their archive rounds become **`submitted`** — a new status between `live` and `final` meaning "official record". **Handicap and the player-facing archive** read `submitted` and `final` rounds only. Player statistics do **not** — they keep counting matched holes as they arrive. (Foursome: all four players.)

### 7.5 Tiger's closeout
Closeout is Tiger's review stamp — "reviewed, accurate, moving on" — and the point where **wagers settle**. It does not gate anything players or the public see: points and results already came from the live data. Its card appears once every player in the match has submitted (or Tiger overrides for a player who cannot). Closing out sets the match `Final` and the archive rounds `final`, and settles the market once (existing behavior). Tiger can still edit afterwards.

## 8. Design — Phase 2: Tiger's editing

### 8.1 Edit Scores for live rounds (new)
Tiger can correct any player's hole (score, putts, fairway, green, pickup) for any live round at any time — before or after players submit, before or after closeout — through one RPC that writes `live_hole_scores` (`confirmed_by` = the host) and an audit event with before/after values. Players do not need Tiger for live corrections; this exists so a mistake is never permanent.

### 8.2 One correction reaches everything (requirement)
Because every output derives from `live_hole_scores`, an edit must automatically re-derive: match state and result (including un-deciding or flipping a match), team points, both leaderboards, player statistics, odds, the archive holes, and — for `submitted`/`final` rounds — the handicap. It must also reach the Google Sheet backup. This is tested end to end (§10) rather than assumed.

### 8.3 Points change; wagers reverse
- **Points and leaderboards just change.** They are derived from the hole scores, so a correction recomputes them and there is nothing to reverse.
- **Wagers need a reversal path** because money has moved. Before Tiger's closeout nothing is settled, so a correction changes nothing about money. After closeout, if an edit changes the official result of a settled match, the system must, in **one transaction under the same market lock the settlement uses**:
  1. subtract each previously paid `potential_payout` from the winners' `wagers_accounts.mm_coins_balance`;
  2. set the market's settled bets (`won`/`lost`) back to `pending` and clear `settled_at`;
  3. remove the market's `wagers_market_settlements` row, keeping a copy in a reversal log (old winner, new winner, who, when, amounts);
  4. run the normal settlement again with the corrected winner.
- Reversal is triggered automatically when a Tiger edit changes a *closed-out* match's result, and is also exposed as an explicit Tiger action. It is idempotent: repeating it with the same corrected result changes nothing.
- **Edge case:** a winner may already have spent the winnings, so a balance can go below zero after a reversal. MM Coins are play money, so this is allowed and shown to Tiger in the reversal log rather than blocked. Real-money wagers (separate spec) will need a stricter rule.
- Edits that do not change the winner never touch wagers.

### 8.4 Disputes
A disagreement is normally resolved by the two players talking and one of them changing a number. Tiger Center also shows both entries side by side so Tiger can fix one when a player is unreachable.

## 9. Design — Phase 3: align the remaining consumers

1. **Handicap:** `getFutureHandicapRounds` selects only rounds whose `career_archive_rounds.status` is `submitted` or `final`. Live rounds then enter Maroon Masters and Overall together; Foursome and pickups stay excluded. Confirm the tee/rating/slope source (`round_format_setups`, else the locked round's `handicap_setup`); a round with no usable tee setup must surface in Tiger Center as "needs tee setup" rather than silently disappearing.
2. **Rounds archive (player-facing):** same `submitted`/`final` filter. **Player statistics and the odds model keep reading matched holes as they arrive.**
3. **Match wording:** one shared formatter for "3&2", "1 up", "Tied", "Final" used by the broadcast, portal match cards and the public pages.
4. **Public leaderboard, team points and futures markets from live scoring.** Today they read the Google Sheet (`LIVE_FEED_URL`), which the new system never writes. They should derive from the same live scores the broadcast uses, producing the existing `Tournament` shape for the 2027 tournament. **The Sheet becomes a one-way backup:** after each matched-hole revision the server pushes the data to the Sheet (reusing the Apps Script writer, `write-scores.gs`, and its server secret). That push is best-effort with retry and reconciliation, and a failure must never slow or block scoring. The site does not read the Sheet for the 2027 tournament. This is the largest item in the spec and gets its own plan.

## 10. Testing

- **SQL (PGlite, `npm run test:db`):** no auto-submit at 18 confirmed holes; `submit_live_round` accepts an eligible player and rejects each ineligible case; a submitted player's later entry is rejected; another scorer's disagreement does not delete a submission; the archive round becomes `submitted` only when the pair have both submitted; **an edit to `live_hole_scores` after submission re-derives match state, archive holes and (for `submitted` rounds) the handicap input**; early-finish, un-deciding and winner-flipping edits behave as §6 says; closeout does not change anything the public sees except `final` and the wager settlement.
- **Unit (`npm test`):** Scoring tab state selection (including "both submitted moves on"), submit eligibility with human-readable reasons, the round-status color (white / red / green) and which hole numbers are red, the shared "3&2" formatter, Foursome exclusions, the Sheet-backup payload builder.
- **Browser (`npm run test:browser`):** Begin vs Continue; the Scorecard shows only your entries (no competitor grid); totals white → red → green as the other scorer's entries change; red hole number jumps to that hole; Submit Round grey then maroon; the Confirm dialog (Escape and Keep editing submit nothing); read-only after submit.
- **Sheet backup:** a failing Sheet write never fails or delays a hole submission (tested with a stubbed failing endpoint).
- **Not testable from here (login + real database):** each phase ends with a manual two-phone checklist.

## 11. Open questions

None. The last one — what happens to payouts if a correction after closeout changes a winner — is resolved in §8.3.

**Assumed unless corrected:** the Google Sheet backup mirrors matched holes as they arrive (not only at submit); the closeout card still waits for every player in the match to submit, with a Tiger override for a player who cannot; a wager reversal may leave a play-money balance below zero.

## 12. Delivery order

1. **Phase 1 — player lifecycle.** Scoring tab states, Begin/Continue, the Scorecard status colors (removing the competitor grid), Submit Round, server changes (no auto-submit, lock, `submitted` status, tab moving on), and the handicap/archive filters that hang off it.
2. **Phase 2 — Tiger's editing and wagers.** Edit Scores, dispute view, closeout as review stamp, the wager reversal path (§8.3), the end-to-end re-derivation tests.
3. **Phase 3 — public views.** Leaderboard, team points and futures from live data; the Sheet backup mirror; shared match wording.

## 13. Definition of done (Phase 1)

- A player can begin, leave, return and continue a live round with progress unchanged, and cannot delete it.
- The Scorecard shows only your own entries; the round total is white while data is missing, red with the disagreeing hole numbers red, and green when everything matches; Submit Round is impossible until green, asks for confirmation, then locks the player.
- A round becomes an official record (handicap, archive) only when the player and their scorer have both submitted, never earlier; player statistics are unaffected by submit.
- Once both have submitted, the player's Scoring tab moves on without waiting for Tiger.
- Live views (leaderboard, points, match status, odds) are unaffected by Submit Round.
- `npm test`, `npm run test:db`, `npx tsc --noEmit`, `npm run lint` (touched files), `npm run build` and `npm run test:browser` are clean, and the manual two-phone checklist passes.
