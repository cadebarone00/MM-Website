# Live Scoring Round Lifecycle — Design

**Status:** Draft for review (2026-09-20). Nothing in this document is built yet.
**Scope:** How a tournament (Maroon Masters) round is started, scored, submitted, locked, closed out by Tiger, and how that one official result feeds everything downstream.
**Not in scope:** Handicap "Submit a score" (personal rounds) — already built and unchanged by this spec. Real-money wagers (separate spec).

---

## 1. Why live scoring is different from handicap scoring

| | Handicap scoring | Live scoring |
|---|---|---|
| Who starts it | The player, by choice | Tiger — matchups are locked and the round is assigned |
| Who is scored | Only yourself | Yourself **and** the person you are scoring for; they score you independently |
| Trust model | Trust the player | Two independent entries must agree, hole by hole |
| Saved | On the device, sent once at the end | Each hole goes to the server as you play |
| Leaving | Exit or delete the round | You can leave the screen; you can never abandon or delete the round |
| Feeds | The player's handicap index | Handicap, team points, match play and individual leaderboards, match results, wager results, rounds archive, player statistics, and all backend data the odds model reads |
| Done means | Submit Scores, final | Every hole matches, every player submits, Tiger closes out; then locked |

Alternate Shot (Foursome) is **team-only** everywhere: one team score per hole, no putts/fairways/greens, never an individual sample, never a handicap round (already the rule; keep it).

## 2. Decisions already made (by the user)

1. A live round can never be deleted. It stays the player's current round until it is finished. Leaving the Scoring tab (to the website, Portal, anywhere) and coming back leaves progress unchanged.
2. The Scoring tab shows the full matchup — the match, who you play against, who you are scoring for — and a **Begin Round** button that opens live scoring.
3. Submitting a hole saves it immediately; the local draft also survives leaving. There is no delete.
4. **Submit Round** exists on the live Scorecard. It is enabled only once all 18 holes are submitted **and every hole matches** the person being scored for/by.
5. **Every player in the match** must press Submit Round before Tiger's **Close Out Match** action appears.
6. After Submit Round the scorecard is **locked**. Only Tiger can change it.
7. Data is **provisional while live and official at closeout**: match status, odds and the leaderboard move with each confirmed hole; points, wager payouts, handicap, statistics and the archive become official when Tiger closes the match out.
8. Every round is played through all 18 holes — even if the match is mathematically decided earlier.

## 3. How it works today (verified in code, 2026-09-20)

**Hole entry (`ScoringPanel` → `POST /api/portal/scoring/hole` → RPC `submit_live_hole_reliable` → `submit_live_hole`)**
- Each player's entry (their own score, the opponent's score, and their putts/fairway/green) is stored in `live_hole_submissions`. Retries are idempotent (`live_submission_receipts`); a stale edit from another device is rejected.
- For every player in the match the function upserts `live_hole_scores`: `score` is what the *opponent* recorded for that player, `self_reported_score` is what the player recorded, and `confirmed_by` is set only when both sides' numbers agree. A disagreement retracts **both** sides' confirmation.
- Drafts survive on the device (`live-drafts:*`) and unsent submissions queue locally (`live-queue:*`).

**Triggers on `live_hole_scores`**
- `queue_live_publication` bumps a per-match revision → `publishOfficialMatchState` writes `live_match_official_state` (leader, margin, holes through, `complete` when mathematically decided) and a `live_match_odds_snapshots` row.
- `mirror_live_score_to_career_archive` writes **confirmed** holes to `career_archive_live_holes` (individual formats) or `career_archive_team_holes` (Foursome, once both partners agree) and retracts them if a hole becomes disputed. It sets the archive round `live`.

**Round lock → archive shell.** `syncLockedRoundToCareerArchive` creates each player's `career_archive_rounds` row (course, date, format, partner/opponents, and the tee/rating/slope in `handicap_setup`) when Tiger locks course + matchups.

**Closeout (`POST /api/portal/tiger/matchboxes/closeout` → RPC `close_live_match_atomic`, host only).** Requires confirmed scores for all players on every hole played; may close early if the match is mathematically decided. In one transaction it writes the closed-out official state, sets the match `Final`, sets the archive rounds `final`, records an audit event, and settles the MM Coin market (idempotent; refuses to disagree with an existing settlement).

**Tiger's card.** `MatchCloseoutCards` lists matches whose official status is `complete` — which can be true **before hole 18** because "complete" means mathematically decided.

**Round submission.** `live_match_box_submissions` records "this player submitted their round". Today it is written **automatically** by `submit_live_hole` the moment a player has 18 confirmed holes (and deleted if any hole becomes unconfirmed). A separate, unused route `POST /api/portal/scoring/submit` already contains the full validation for a manual Submit Round (all responsible holes confirmed, own stats complete) and writes the same table plus a `player_submitted` audit event — but it always fails today, because the automatic insert has already created the row ("You've already submitted…").

## 4. Downstream audit — where each output reads from and when it updates

| Output | Reads from today | Updates today | Gap against the target model (§2.7) |
|---|---|---|---|
| Match status / leader / thru | `live_match_official_state` | Each confirmed hole | None — keep |
| Odds | `live_match_odds_snapshots` (model reads confirmed archive holes) | Each confirmed hole | None — keep |
| Broadcast (leaderboard, match play, events) | `live_hole_scores`, official state, Realtime | Each confirmed hole; team points derived only once a match is final | None — keep |
| Portal live match cards | Official state + odds | Each confirmed hole | None — keep |
| Wager results | `close_live_match_atomic` → `settle_mm_coin_market` | Closeout | None; a Tiger edit **after** closeout cannot change a settled market (see §6.3) |
| Rounds archive | `career_archive_rounds` / `_live_holes` / `_team_holes` | Confirmed holes as they arrive; `final` at closeout | None — status already distinguishes live from final |
| **Handicap** (Maroon Masters + Overall) | `getFutureHandicapRounds` → `career_archive_live_holes` + `handicap_setup`; only 18-hole rounds count; Foursome and pickups are excluded | As soon as 18 confirmed holes exist | **Does not wait for `final`.** Must count only `career_archive_rounds.status = 'final'` |
| **Player statistics** | `careerStatsDatabase` → `career_archive_rounds` / `_live_holes` / `_team_holes` (confirmed only) | Confirmed holes as they arrive | **Does not wait for `final`.** Needs a decision (see §9 Q2) |
| **Team points + public individual leaderboard** (`/leaderboard`, futures markets) | `LIVE_FEED_URL` → Google Apps Script reading the **Google Sheet** | Only when someone updates the Sheet | **Not fed by live scoring at all.** The new Supabase system never writes the Sheet. Only the broadcast derives team points from official state |
| Tiger score edits for live rounds | (no route exists) | — | **Missing.** Needed for "only Tiger can change it" (see §6) |

Everything in the first six rows already fans out correctly from one source of truth (`live_hole_scores`). The work in this spec is the **player-side lifecycle**, the **Tiger side of it**, and closing the three flagged gaps.

## 5. Design — Phase 1: the player lifecycle

### 5.1 Scoring tab (`/portal/scoring`, `ScoringStatusScreen`)

States, driven by the player's current match (`findCurrentRoundForPlayer`, unchanged: the lowest-numbered locked round that is not `Final`):

| State | Shown | Button |
|---|---|---|
| No match yet | "Waiting For Matchup" | — |
| Upcoming (before tee time / not started) | Full matchup, tee time, course, format, "Waiting For Round To Begin" | disabled |
| Live, no holes submitted | Full matchup (see below) | **Begin Round** |
| Live, some holes submitted | Same, plus "Through N holes" | **Continue Round** |
| Live, all 18 submitted and matching, not yet submitted | Same, plus "All holes match — submit your round" | **Continue Round** (opens the Scorecard) |
| Player has submitted, others outstanding | "Round submitted — waiting on <names>" | **View Scorecard** (read-only) |
| All submitted, awaiting Tiger | "Submitted — waiting for Tiger to close out" | **View Scorecard** (read-only) |
| Match `Final` | Falls through to the next round, or "Waiting For Matchup" | — |

**Full matchup description** = round number and format, course and tee, tee time, "You & <partner> vs <opponents>" (existing `matchupLabel`), and an explicit **"You are scoring: <name(s)>"** line (the opposing-position competitor, or the opposing team for Foursome — `scoringSides`).

Begin Round / Continue Round both go to `/portal/scoring/play`, opening on the first hole not yet submitted (or hole 1). Beginning is navigation only — it records nothing.

### 5.2 Scoring screen (`ScoringPanel`)

- Unchanged: per-hole entry, hole selector with confirmed/disputed colors, offline queue.
- **No delete, no discard.** The header back arrow keeps its normal Back behavior (it is not the handicap "Exit" — there is nothing to exit *from*; leaving never discards).
- The **Scorecard** button (under the header, already built) opens the live Scorecard, which gains:
  - the same **totals box** as handicap (Score, To Par, Putts, Fairways, Greens; Foursome: score/to-par only), computed from confirmed holes;
  - a full-width **Submit Round** pill, disabled with the reason shown ("Hole 7 is not submitted", "Hole 12 doesn't match") until eligible;
  - the same **Confirm** dialog wording adapted for live: "After you submit your round you will not be able to edit it. Only Tiger can change it." with **Submit Round** and **Keep editing**.

### 5.3 Submit Round — server

Reuse and repair the existing pieces rather than adding new ones:

1. **Stop auto-submitting.** Remove the automatic `live_match_box_submissions` insert/delete from `submit_live_hole`. The row now means "the player pressed Submit Round" and nothing else.
2. **Explicit submit.** Promote the validation in `POST /api/portal/scoring/submit` into a single transaction (RPC `submit_live_round(p_box, p_player)`), so the check and the insert cannot race a hole edit. It must verify, for the caller: every hole 1–18 has a confirmed score for each player the caller is responsible for; for individual formats, own putts/fairway/green are complete (pickups marked `did_not_finish` are allowed); the match is open for scoring; the caller has not already submitted. On success insert the `live_match_box_submissions` row and a `player_submitted` audit event.
3. **Lock.** `submit_live_hole_reliable` rejects any entry from a player who has a submission row ("Your round is submitted. Ask Tiger to change it.").
4. **A partner's or opponent's later edit must not un-submit anyone.** Today a hole becoming disputed deletes the submission row; with the lock that rule is replaced by: a submitted player's entries are frozen, and if the other scorer later enters a different number the hole shows **disputed** to *them* and *they* cannot submit until it matches or Tiger resolves it (§6.2).
5. **Foursome.** Both partners are one side: each partner presses Submit Round for themselves; closeout waits for **all four**. (Their entries are duplicated and must agree, as today.)

### 5.4 Closeout gate (Tiger)

- `close_live_match_atomic` additionally requires: all 18 holes confirmed for every player **and** a `live_match_box_submissions` row for every player in the match. The early-close branch (`abs(a_wins-w_wins) > 18-h`) is removed for closeout eligibility; the official **result** still records when the match was decided, and the match-play calculation is unchanged (continuing after a clinch does not change the result — already tested).
- `MatchCloseoutCards` lists a match only when every player has submitted. Before that it shows the match as **Decided** (mathematically complete) or **In progress** with a "waiting on <names>" line, so Tiger can see who is holding a match up. The Close Out button is not shown.

### 5.5 What each player sees after closeout
The match becomes `Final`; the player's Scoring tab moves on to their next round. The Scorecard of a finished round stays viewable from the archive/profile (existing).

## 6. Design — Phase 2: Tiger's side

### 6.1 Edit Scores for live rounds (new)
Tiger can correct a player's hole (score, putts, fairway, green, pickup) for a live round, before or after players submit, through one RPC that writes `live_hole_scores` with `confirmed_by` set to the host and an audit event carrying before/after. Because every downstream output hangs off `live_hole_scores` triggers, an edit re-publishes match state, odds and the archive automatically.

### 6.2 Resolving a dispute
A disputed hole (both submitted, numbers differ) shows in Tiger Center with both entries and the two-click resolution: pick the correct score for each player, apply. Players are told the hole was resolved by Tiger. A frozen (submitted) player is not required to re-enter.

### 6.3 Changing a round after closeout
Closeout settles wagers and finalizes the archive. An edit after closeout that changes the match result cannot be applied silently: the RPC must refuse unless Tiger explicitly **reopens** the match, which un-finals the archive and must reverse or re-run settlement. **No path to reverse a settled MM Coin market exists in the code audited** (closeout deliberately refuses to disagree with an existing settlement), so that is out of scope for Phase 2 — until it does, a post-closeout edit that would change the winner is blocked with a clear message; edits that don't change the winner (a putt count, a non-deciding hole) are allowed.

## 7. Design — Phase 3: align every consumer to "official at closeout"

1. **Handicap:** `getFutureHandicapRounds` selects only rounds whose `career_archive_rounds.status = 'final'`. Live rounds then enter both the Maroon Masters and Overall handicap once Tiger closes the match; Foursome and pickups remain excluded. Verify the tee/rating/slope source: `round_format_setups` (if present) else `handicap_setup` from the locked round — a round with no usable tee setup must not silently disappear; Tiger Center shows it as "needs tee setup".
2. **Player statistics:** decision required (§9 Q2). Recommendation: statistics count `final` rounds only, while the **odds model** keeps reading confirmed holes as they arrive (it already excludes drafts and disputes).
3. **Team points and the public leaderboard:** decision required (§9 Q1). This is the largest gap: live scoring does not reach the Sheet-fed `/leaderboard`.

## 8. Error handling and edge cases

- **Offline at the end:** Submit Round is online-only and never queued; it shows "Connect to submit" rather than silently deferring an irreversible action.
- **Double press / retry:** the RPC is idempotent for the same player and match; the second call returns success without a second audit event.
- **Someone changes a hole while you review the Scorecard:** eligibility is re-checked by the server at submit time; a stale Scorecard cannot submit an unconfirmed hole.
- **A player who never submits** (phone died): Tiger's card names them; Tiger can submit on their behalf through the Edit Scores tool once their holes are confirmed, with an audit event.
- **Pickup (Fourball X):** allowed, counts as the recorded double-par match result, excluded from individual stats and handicap (existing behavior).
- **Match starts early/late (Tiger Start Match override, tee time):** unchanged.
- **Round already `Final`:** the Scoring tab never offers Begin/Continue for it.

## 9. Open questions (need the user)

1. **Public `/leaderboard` and team points.** Should the 2027 public leaderboard and team points come from live scoring (Supabase, at closeout), replacing the Google Sheet feed, or does the Sheet stay as a bridge that Tiger updates? This decides whether Phase 3 is a data-source migration or a documented exception.
2. **Player statistics timing.** Count only final (closed-out) rounds, or as confirmed holes arrive? (Recommendation: final only for statistics; confirmed holes for odds.)
3. **Seeing the other scorer's numbers.** The live Scorecard shows the competitor's grid under yours. Should it be hidden for a hole until you have submitted that hole, so entries stay independent?
4. **Handicap rounds after submit (separate feature).** Can Tiger ever correct a submitted personal handicap round? Not part of this spec; recorded so it is not lost.

## 10. Testing

- **SQL (PGlite, `npm run test:db`):** extend `scripts/test-scoring-reliability.mjs` — no auto-submit at 18 confirmed; `submit_live_round` accepts an eligible player and rejects each ineligible case (unconfirmed hole, missing stats, already submitted, match not open); a submitted player's later hole entry is rejected; a disagreeing edit by the other scorer does not delete the submission; closeout refuses until every player has submitted and all 18 holes are confirmed; closeout still settles once and only once; Foursome needs all four submissions.
- **Unit (`npm test`):** pure helpers — Scoring tab state selection (`liveRoundStage`), submit eligibility with human-readable reasons (`submitBlockers`), Tiger card "waiting on" list, live scorecard totals (Foursome excludes putts/greens/fairways).
- **Browser (`npm run test:browser`):** Begin vs Continue label, Scorecard totals, Submit Round disabled/enabled with reasons, Confirm dialog (Escape and Keep editing submit nothing), locked scorecard after submit.
- **Not testable from here (login + real database):** the deployed round trip; each phase ends with a manual two-phone checklist for the user.

## 11. Delivery order

1. **Phase 1** (player lifecycle + closeout gate) — one implementation plan.
2. **Phase 2** (Tiger edit / dispute / reopen) — separate plan; Phase 1 is usable without it because Tiger can already close out matches whose players all agree.
3. **Phase 3** (align handicap/stats/leaderboard) — separate plan; needs §9 answers first.

## 12. Definition of done (Phase 1)

- A player can begin, leave, return, and continue a live round with progress unchanged, and cannot delete it.
- Submit Round is impossible until all 18 holes match, asks for confirmation, and locks the player's entries.
- Tiger's Close Out is unavailable until every player in the match has submitted; closing out still finalizes the archive and settles wagers exactly once.
- `npm test`, `npm run test:db`, `npx tsc --noEmit`, `npm run lint` (touched files), `npm run build` and `npm run test:browser` are clean, and the manual two-phone checklist passes.
