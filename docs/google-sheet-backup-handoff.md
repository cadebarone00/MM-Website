# Google Sheet scoring backup: builder handoff

Reviewed September 18, 2026 against the local checkout at `794e9371b6b71ca180d6f8101d5dcd393a41f74f`. This is a read-only design/export of repository code, not a production database export or a deployed integration. No credentials are included. The companion `google-sheet-backup-sources.md` contains verbatim SQL and implementation files. SQL files contain successive migrations, not one flattened schema; later ALTER statements and function replacements take precedence. Do not execute the source bundle against a database.

## Decisions for version 1

Build **the selected live tournament only**, with an **independent match-result audit** alongside the app's published result. These are recommended scope defaults, not a claim that the owner has chosen to import historical records. Keep 2024–2026 historical imports and personal handicap-round entry out of the first version. Leave wagers, odds, and coin settlement out of the workbook's calculations.

The app remains the authority for accepted scores and closeout. The sheet is an append-only recovery log plus derived views. A sheet receipt is not an official app confirmation. Do not automatically overwrite the app from spreadsheet edits. Recovery should be an explicit, reviewed replay preserving original event IDs and reconciliation.

## Corrections to the proposed tournament model

- **The current model is a season with numbered rounds, not a fixed four-day/two-session grid.** The original schema had day/session columns, but later SQL drops them. Tournament settings allow 6–10 rounds. Each round has a date, one format, one course, and a locked tee snapshot. Add day/session as optional sheet scheduling metadata with an explicit round mapping; do not derive them from round number. A public display adapter currently labels `day = round` and `session = Morning`; that is presentation, not authoritative scheduling data.
- There are 12 assigned players for a complete round: six Maroon and six White. Fourball and Foursome require three boxes of 2-v-2. Singles requires six separate boxes of 1-v-1. Incomplete drafts can exist, but the normal matchup-lock flow requires all 12 unique players and the full box count.
- **A match box is a match. Tee time is a timestamp on that match**, not a separate database entity. Two singles matches may have the same timestamp; there is no stored four-player tee-group ID or enforced box-pair grouping. The sheet can group two explicit match UUIDs into a tee group for display. Never merge their scores or points. If using Maroon 1/White 1 and Maroon 2/White 2 in that display group, each pair must reference its own Singles match UUID.
- No hard maximum of 24 physical tee times follows from the current model. A round cannot mix formats. The live engine and locked tee validation require 18 holes; historic nine-hole records do not mean live nine-hole matches are supported.
- Native live season choices currently run **2027–2034**; 2034 is used for rehearsal. Historical 2024–2026 records use archive paths. Read the selected active season; do not assume the calendar year is the live tournament year.

## 1. Data model and stable keys

Full SQL is attached in the source companion. These are the relevant effective keys after migrations. Store UUIDs, player slugs, big integers, and composite keys as text in Sheets. Never key by row number, last name, displayed tee time, or course name.

| Entity/table | Primary key or stable natural key | Role |
|---|---|---|
| `profiles` | `id` UUID | Authenticated actor; export only the actor ID needed for audit, not email/account details |
| `player_slots` | `player_slug` text | Player identity, currently firstname-lastname; distinct from auth identity |
| `live_active_season` | singleton `id` boolean | Chooses active live season; export its `season_year` |
| `live_tournament_settings` | `season_year` integer | Round count, completion, venue/date settings and locks |
| `live_roster` | `(season_year, player_slug)` | Team assignment, `maroon` or `white` |
| `live_roster_assignment_locks` | `(season_year, player_slug)` | Includes locks on unassigned choices |
| `live_courses` | `id` UUID | Course name, holes and tee sets as JSON, rating/slope, location |
| `live_round_state` | `(season_year, round)` integers | Date, format, course UUID, tee snapshot, course/matchup locks, started |
| `round_format_setups` | `(season_year, round)` integers | Archive/live tee/date snapshot with source |
| `live_match_boxes` | `id` UUID; unique `(season_year, round, box_number)` | One match, tee timestamp, ordered side arrays, state, started and started_at |
| `live_hole_submissions` | `(match_box_id, player_slug, hole)` | Latest submission per player/hole, payload JSON, submitted_at |
| `live_hole_scores` | `id` UUID; unique `(season_year, player_slug, round, hole)` | Current opposing/self scores, personal stats, confirmation and edit flags |
| `live_submission_receipts` | `(player_slug, request_id)`; request UUID | Idempotency record: payload and result JSON; no separate timestamp column |
| `live_match_box_submissions` | `(match_box_id, player_slug)` | Marker once a player's 18 holes are confirmed; may be deleted again after a dispute |
| `live_publication_jobs` | `match_box_id` UUID | Coalesced pending publication with bigint revision, completed flag and updated_at |
| `live_match_official_state` | `match_box_id` UUID | Published derived match state plus Tiger closeout fields |
| `live_score_audit_events` | `id` UUID | Event kind, actor, player, match, round/hole, payload and created_at |
| `career_archive_rounds` | `(season_year, round, player_slug)` | Player-round shell, match relation, course/format/tee context |
| `career_archive_live_holes` | `(season_year, round, player_slug, hole)` | Confirmed individual hole observations |
| `career_archive_team_holes` | `(season_year, round, match_box_id, team, hole)` | One shared Foursome score per side; not two individual performances |
| `archived_scorecard_rounds` | `id` UUID | Historical player round; tournament_slug/player_slug/round identify context |
| `archived_scorecard_holes` | `id` UUID; unique `(round_id, hole)` | Historical hole values |
| `handicap_rounds` | `id` UUID; request dedupe `(player_slug, submission_id)` | Personal rounds, outside initial sheet scope |
| `handicap_round_holes` | `id` UUID; unique `(round_id, hole)` | Personal-round holes, outside initial scope |

There are no separate live tournament UUID, day, session, team, tee-time, tee-set, or course-hole SQL tables. Team is a constrained string. Tee IDs are strings scoped to a course. Hole definitions live in JSON; a hole number alone is not globally unique. Preserve snapshots as well as flattened course-hole rows.

Slugs are the app's player join keys today, but a rename feature may change them. Preserve explicit old-to-new mappings if that feature ships; never infer identity from partial name matching. Match UUIDs remain the principal sheet match keys.

## 2. Formats and scoring responsibility

| App format | Players per side | Hole result | Submission |
|---|---:|---|---|
| `Singles` | 1 | Lower confirmed gross stroke count wins | Each player submits own score, opposing score, and own stats |
| `Fourball` | 2 | Lower of each side's two confirmed individual gross scores | Each player records self and the opposing player at the same array position; both opposing pairs reconcile separately |
| `Foursome` | 2 | One shared alternate-shot gross score per side; lower wins | Either teammate can submit for their side; latest submission on each side is compared with the latest on the other side |

Foursome means alternate shot here, not merely any four-player group. Scramble is not a currently supported native live format, although historical/legacy source material can mention it. Fourball is best ball, not scramble. The app's match algorithm takes a side minimum in every format; Foursome's duplicated player rows must represent the same shared score. Flag inconsistent Foursome rows instead of treating unequal teammate scores as legitimate best ball.

All required players must have positive, confirmed scores for a hole before it advances the match calculation. In Fourball, one confirmed pair alone is insufficient to settle that hole. A halved hole adds no hole win to either side.

## 3. Exact result rules and statuses

See `lib/live/orchestration.ts`: `holeComplete`, `matchBoxStartedThru`, `matchBoxResult`, `effectiveMatchState`, `matchIsScoreable`, `matchBoxPayload`; `lib/live/officialMatchState.ts`: `buildOfficialMatchState`; and `components/leaderboard/matchUtils.ts`: `matchLabel`/`liveLabel`. Full files are attached.

Independent audit algorithm:

1. Use confirmed current scores only; iterate holes 1 through 18 in order. Stop at the first incomplete/unconfirmed hole, even if later holes exist.
2. Take each side's minimum gross score. Increment that side's hole wins if lower; equal scores halve the hole.
3. Signed lead is Maroon hole wins minus White hole wins. Margin is its absolute value. Remaining holes are `18 - currentHole`.
4. Stop the match result at the first point where margin exceeds remaining holes, or after hole 18. Later scores may count for an individual's round, but must not change the decided match result.
5. A final win awards 1 point; a tie after 18 gives 0.5 each. In-progress matches award zero settled match points. Keep displayed/projected points separate if adding projections.

Example: a lead of 3 after hole 16 is `3&2`. A lead of 2 after 16 is dormie, **not final**. Dormie is not a stored app status; the sheet may add a derived `margin == remaining && remaining > 0` field. Display is `VS`/tee time while scheduled, `AS` when tied, `N Up` while ahead (also at an 18-hole win), and `N&R` on early final. A tied final may still display `AS`; points are 0.5/0.5.

Keep all three status namespaces distinct:

- Box state: `Scheduled`, `Armed`, `Live`, `Final`. Effective state also considers started, tee time and 18 contiguous holes. Scoring authorization additionally respects Tiger's persisted `Live` override before tee time.
- Published official state: `upcoming`, `live`, `complete`, `closed_out`. Mathematical completion is not the same as Tiger closeout.
- Hole perspective: `empty`, `submitted`, `confirmed`, `disputed`, derived from submissions. These are not a status column on the submission table.

Tiger closeout is `POST /api/portal/tiger/matchboxes/closeout` → `close_live_match_atomic` in `supabase/scoring_reliability.sql`. It locks the match, recalculates from confirmed holes, refuses a non-final result, writes `closed_out_at`/`closed_out_by` and official result, sets box state `Final`, marks archive rounds final, appends a closeout audit event, and settles the linked coin market atomically. Retrying does not settle it twice. The sheet must mirror closeout, not invent it because its formula says the match is over.

**Overall points are a configuration gap to expose.** `lib/data/live.ts` currently displays 33 available / 17 to win; this is hardcoded, not calculated from the flexible schedule. Each native match is still worth one point. Show the planned match count, configured displayed threshold, and a mismatch warning if inconsistent. A proposed majority threshold is `plannedMatches / 2 + 0.5`, but do not silently replace the app's displayed value or impose a tournament rule. No generalized overall tie/playoff/defending-team-retention rule was found in the native result engine. Require an explicit organizer rule rather than assume one. Individual leaderboard order is to-par ascending, holes played descending, gross ascending, then player text; that display ordering is not a championship playoff rule.

## 4. Handicap and stroke allocation

**There is no handicap stroke allocation in the native live match engine.** It does not apply allowance percentages, subtract the low player's handicap, combine partners' handicaps, or distribute strokes by stroke index. Do not add 90%, 95%, 50%, or any other allowance to the sheet audit. Course holes currently have `number`, `par`, and `yards`; no native stroke-index field is defined.

Rating and slope are used separately for personal handicap calculations and historical/model inputs. `lib/handicap/whs.ts` computes a differential as `roundToOneDecimal((totalScore - rating) * 113 / slope)` and selects the applicable lowest differentials from the most recent eligible 20. This is not a net-match scoring system. Handicap index is computed, not a column on `live_roster`; export an optional value with calculation timestamp/source if desired, leave unknown values null, and do not use it to change hole winners. Foursome shared scores are excluded from individual handicap history.

## 5. Hole submissions, revisions and history

The current UI sends `POST /api/portal/scoring/hole` with:

```json
{
  "round": 1,
  "hole": 1,
  "matchBoxId": "11111111-1111-4111-8111-111111111111",
  "requestId": "22222222-2222-4222-8222-222222222222",
  "expectedSubmission": null,
  "ownScore": 4,
  "opponentScore": 5,
  "putts": 2,
  "fairway": "hit",
  "green": "left"
}
```

The server obtains actor UUID and player slug from authenticated identity and season from active-season settings. Do not trust a browser-supplied actor/team. `expectedSubmission` is the prior own-side submission timestamp, or null on the first entry. It is an optimistic concurrency token, not a numeric revision. A stale request is rejected for review. Request UUID deduplication returns the original result for the same payload; reuse with different entries is rejected.

Stored payload fields are `ownScore`, `opponentScore`, `putts`, `fairway`, `green`. Shot choices: `hit`, `long`, `short`, `left`, `right`, `penalty`. Par-3 fairway becomes null. Foursome putts/fairway/green become null. For individual formats stats must be filled; putts must be an integer from zero through own score. The UI's `4+` category stores 4; do not infer an exact count above four. Server validation is not a four-putt cap. Penalty is a shot-result choice, not a separately stored penalty-stroke count in this payload.

The submission table stores payload and server `submitted_at`, overwriting the current row on edit. Actor UUID is in the audit event, not that row. Live score rows store `score` (opponent's report of this player), `self_reported_score`, putts, FIR/GIR booleans and miss directions, `confirmed_by`, `host_edited`, `did_not_finish`, and `updated_at`. `confirmed_by` is set to the player's own slug as a confirmation marker; it is not a reliable submitter identity. This current hole endpoint resets `did_not_finish` false; the older stroke endpoint has a separate Fourball double-par/X path. Preserve imported DNF flags but do not assume the current slider submits them.

Both comparisons must pass: A.own = B.opponent **and** A.opponent = B.own. In Fourball, A and B are opposite players at the same array index. In Foursome, use latest submission per side (SQL orders submitted_at descending, then player_slug to break a timestamp tie). Stats are self-reported; opponents confirm scores, not every stat.

If one perspective is missing, the pair is pending. If both exist and disagree on either comparison, both players in that pair lose confirmation. Archive triggers remove their previously confirmed rows; Foursome retracts the shared team observations. The sheet must append retraction/update events and exclude old values from current projections. Never just append positive confirmations and retain them forever.

History is partial but useful: current submissions/scores overwrite; successful distinct requests remain in receipts; audit `score_entered` events retain payload, actor, and time. The audit enum supports more event kinds, but this current submit function emits `score_entered`, not a separate event for every confirmation/retraction. Receipts have no timestamp column and do not directly link an audit-event UUID. Publication revision is per match job and can increment several times per hole submission; it is not a player-hole revision. Do not fabricate missing request-to-audit links or a total order from UUIDs/timestamps. Rejected requests and never-submitted slider edits are not automatically stored as server audit events.

## 6. Lineups and locking

Tiger/host users set season roster and matchups. `live_match_boxes.maroon_players` and `white_players` are ordered text arrays. JS index 0 corresponds to slot 1; SQL array index 1 corresponds to slot 1. Preserve array order: it determines who scores whom in Fourball. Singles has one element per side. Foursome has two, with shared-side scoring.

Tiger locks course/date/format/tee setup, fills all matchups, then locks matchups and starts the round. Starting arms the boxes; tee time or Tiger's Start Match override opens scoring. The save route blocks ordinary matchup edits once the round is started; pre-start locked matchups can still be saved and republished by the current route. Thus `matchups_locked` is not an immutable version number. Mirror lineup updates and snapshots with timestamps, and flag changes affecting already received events.

## 7. Courses and roster

`live_round_state.course_id` assigns one course to the entire round. `course_setup` is its frozen tee snapshot, including `teeSetId`, `teeSetName`, `holes`, `rating`, `slope`, optionally `holeTeeSetIds`. `round_format_setups` also stores date/course/tee setup for the archive. Preserve the played snapshot even if the course library changes later. Mixed per-hole tees may be represented; do not invent a new combined rating/slope.

`live_courses.tee_sets` JSON contains tee IDs/names, optional color/locked/API provenance, rating/slope, and 18 hole definitions. Flatten into optional Tee/Hole helper tabs while retaining JSON for lossless recovery. Store UTC tee timestamps and explicit display timezone; do not key or compare by locale-formatted clock strings.

The checked-in player catalog has 13 players: `cade-barone`, `cam-latto`, `collin-ross`, `dalton-spriggs`, `drew-weisser`, `hugo-moebel`, `jackson-collins`, `kyle-schnabel`, `luke-sherrell`, `nate-wojciechowski`, `pete-peabody`, `peyton-vos`, `quez-currier`. A live round uses 12 roster assignments. This is not a verified current production roster, and no current team assignments or handicap indexes have been fetched. The integration must export `live_roster` for the selected season and calculated indexes separately. Do not copy historical team assignments into a future season.

## 8. Sample data

`google-sheet-backup-sample.json` contains **synthetic** data, never a production export: a complete first day with three Fourball matches in the morning and six Singles matches in the afternoon, plus a second-day morning Foursome round so all three supported formats are represented. Two sessions cannot cover three formats without violating the one-format-per-round rule. Day/session and singles tee-group IDs in this fixture are proposed sheet metadata, not native database columns.

All rounds include all assigned players, all 18 holes, both scoring perspectives, and expected results. Cases include Maroon 3&2, White 2&1, and halved after 18. Scores after mathematical completion remain present to test that they do not change the match result. The first Singles tee group contains two separate matches, each worth one point. A separate reconciliation scenario demonstrates pending → confirmed → disputed/retracted → corrected/confirmed. UUIDs, dates, names, courses and ratings in the fixture are dummy values.

## 9. Wagers and scope exclusions

Tables exist for `wagers_accounts`, `mm_coin_bets`, `wagers_market_settlements`, `wager_types`, `odds_model_settings`, `odds_model_runs`, and `live_match_odds_snapshots`. Live markets use `live-match:<match-box-uuid>`; odds snapshots reference match UUID directly. Closeout couples official finalization with coin settlement. Exclude balances, bets, payouts and odds modeling from initial backup calculations. Optionally record a closeout event's match identity/time, but do not execute settlement from the sheet or replay it through direct table inserts.

## 10. Integration contract to build toward (not implemented yet)

Keep the proposed Setup, Schedule, Hole Log, Matches, Leaderboard, and Sync Log tabs. Add flattened Courses/Tees/Holes and Current Holes helper tabs if useful. Hole Log must retain attempts and transitions; Matches and Leaderboard are projections, not editable sources.

Use a versioned envelope for the future integration:

```json
{
  "schemaVersion": 1,
  "eventId": "33333333-3333-4333-8333-333333333333",
  "eventType": "submission_intent",
  "source": "app",
  "seasonYear": 2027,
  "matchBoxId": "11111111-1111-4111-8111-111111111111",
  "round": 1,
  "hole": 1,
  "playerSlug": "sample-maroon-1",
  "requestId": "22222222-2222-4222-8222-222222222222",
  "expectedSubmission": null,
  "occurredAt": "2027-01-06T15:10:00Z",
  "receivedAt": null,
  "sourceRevision": null,
  "appAccepted": false,
  "payload": {"ownScore":4,"opponentScore":5,"putts":2,"fairway":"hit","green":"left"}
}
```

These envelope fields/event names are proposed integration fields, not existing table columns. `submission_intent` records pressing Submit, not every slider movement. `appAccepted: false` here means no app acceptance is established yet; it is not an official score. Use separate events for `submission_accepted`, `submission_rejected`, `confirmation_changed`, `match_state_published`, `match_closed_out`, and configuration snapshots. Accepted events should include authenticated actor, authoritative saved timestamp, resulting submissions/current-hole state and source revision where available. Model unverified backup intake separately from authenticated intake.

Receiver requirements:

1. Deduplicate retries by eventId. Return `{ok:true,eventId,duplicate:false}` only after durable storage; duplicates return the same identity with `duplicate:true`. Conflicting content for the same eventId is an error. Same requestId may have multiple lifecycle events; do not dedupe away acceptance/retraction using requestId alone.
2. Assign receipt time and an ingestion sequence on the receiver. Ingestion sequence orders arrivals, not necessarily app changes. Never let a late older projection overwrite newer authoritative state. Include a source watermark/revision on projections, detect gaps, and support a complete current-state reconciliation export.
3. Preserve raw JSON plus useful columns. Sheet formulas use current confirmed projections and independent result logic, not raw submission counts. Distinguish `pending`, `disputed`, `stale_sync`, and actual `result_mismatch`. Compare app and sheet results at the same source watermark to avoid false alarms during publication lag.
4. Synchronize setup/roster/course snapshots before play and keep explicit invalidation/deletion events. Deleting or replacing a match must not leave active orphaned sheet rows. Match UUID plus season/round validates identity; use tombstones in the log, not destructive history edits.
5. Provide last successful receipt, queue backlog, last reconciliation time, failed event/error/retry metadata, and a downloadable recovery export. Sheet failure must not make an already accepted app score look unsaved. Label primary-save and backup-save states separately.
6. Keep receiver credentials server-side; do not put reusable Google write credentials or Supabase service keys in the browser or workbook. Authenticate/authorize intake, validate assignments, and protect user-entered text from spreadsheet formula interpretation. Do not send emails, passwords, tokens, or profile account data.

**Failure coverage:** A Supabase-triggered exporter can mirror committed data, but cannot capture a request Supabase never accepted. The existing phone queue keeps retryable submissions locally; it is not a Google backup and does not cover loss of that device/storage. For the requested outage protection, add a durable independent intake path that can accept a scoring intent when the primary database is unavailable, with an authentication design that does not require that unavailable database. A proxy on the same app server still shares that server's failure domain. Full app-host outages require an independently reachable intake/recovery page or an already-loaded client configured for it. No network means neither backend can receive; retain the local queue until connectivity returns.

Do not claim dual-write atomicity: primary and backup can succeed independently. A durable outbox covers delivery after primary commit; a separate intake covers primary failure. Reconcile both with the same request identity and normal two-perspective validation. Backup-only data stays provisional until recovery review/acceptance. Never use the sheet's presence of a row as permission to confirm a hole.

## What the sheet builder should return

Return the workbook tab/column specification, independent formula/script rules, versioned receiver request/response contract, deduplication and ordering behavior, authentication/deployment requirements (without secrets), fixture import results, and recovery export format. Demonstrate duplicate delivery, stale/out-of-order events, one-sided submission, disputed edit after confirmation, Foursome shared scores, early final plus later individual scores, app-accepted/sheet-failed retry, and backup-only intake. We can then wire the app to the agreed contract. **No Google sync or automatic failover exists as a result of this handoff.**
