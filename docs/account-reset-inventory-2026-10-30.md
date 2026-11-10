# V2 account reset: production inventory (TEMPLATE, waiting for the R0 inspection)

Filled in by Claude from the CSV of `docs/database-inspection-account-reset.sql`, run by the owner on production. Counts
only, no personal data. Each row names the inspection row it comes from (section letter, then the row's text).
**Nothing here authorizes a deletion.** The final scope is approved separately (last table).

## Checks before trusting the numbers

| Check | Inspection row | Must be | Value |
|---|---|---|---|
| Export complete | row 1 "rows expected" = number of rows; no `row_no` gaps | yes | _pending_ |
| Ran on the right project | (owner confirms the top-left of the dashboard said production) | yes | _pending_ |
| Sees every row | C "running as" | "(sees every row)" | _pending_ |
| No immediate outside calls | X "extensions that call out IMMEDIATELY", G notes "IMMEDIATE OUTSIDE CALL" | none | _pending_ |
| Webhooks, jobs, Realtime | X rows 2–4, G notes "DATABASE WEBHOOK" | listed; switched off in the reset window | _pending_ |

## Accounts

| What | Inspection row | Value |
|---|---|---|
| Login accounts | A "auth.users: total login accounts" | _pending_ |
| Confirmed / never signed in | A | _pending_ |
| Signed in last 7 / 30 days | A | _pending_ |
| Created last 7 days (still arriving) | A | _pending_ |
| Sign-in methods (email / Google / Apple ...) | A "auth.identities: provider ..." | _pending_ |
| Sessions / live refresh tokens / MFA / one-time codes | A | _pending_ |
| Half-finished Google / Apple sign-ins | A "auth.flow_state" | _pending_ |
| Supabase sign-in log entries (D6 on hold: kept) | A "auth.audit_log_entries" | _pending_ |
| Profiles / orphans / logins without a profile | B | _pending_ |
| Already V2-active, tombstones | B | _pending_ (expected 0 / not installed) |

## Admins and owners (all lost at the reset; restored by `docs/admin-regrant-DRAFT.sql`)

| What | Inspection row | Value |
|---|---|---|
| Maroon Admin Center (`is_host`) | D | _pending_ |
| Platform admins | D | _pending_ |
| Tournament-creator access | D | _pending_ |
| The Maroon owner / organizer memberships | D "The Maroon: owner" | _pending_ |
| Trip organizers / code-tournament organizers | D | _pending_ |

## Shared records by group (Part 1)

The top rows come from section S. The rows under them come from section E, the group's CASCADE lines ("linked" is the
number removed).

| Group | Top rows | Rows removed with it (E) | Decision |
|---|---|---|---|
| S1 trips (+ override history, push subscriptions) | _pending_ | _pending_ | D2 conditional |
| S2 personal scoring groups, player rounds | _pending_ | _pending_ | D2 conditional |
| S3 shared rounds | _pending_ | _pending_ | D2 conditional |
| S4 code tournaments | _pending_ | _pending_ | D2 conditional |
| S5 customer tournaments / editions / players / organizations | _pending_ | _pending_ (upper bound) | D3 conditional |
| S6 MM coin bets / accounts / settlements | _pending_ | _pending_ | D4 conditional (retention check) |
| S7 typed-in emails on kept Maroon records (emptied, rows kept) | _pending_ | n/a | D7 conditional |

## Dependencies

| What | Inspection rows | Value |
|---|---|---|
| Links that BLOCK a delete (must be cleared by Part 1 first) | E notes "BLOCKS" | _pending_ |
| Kept rows whose link is emptied | E notes "row kept, link emptied" | _pending_ |
| Id columns with no foreign key | F | _pending_ |
| Retained old ids in Highlights history (D5 review) | F `highlight_config_*` rows | _pending_ |
| Triggers that refuse deletes / webhooks | G | _pending_ |
| Which safety SQL is installed (decides the path) | C | _pending_ |
| Storage: profile photos / tournament PDFs / shot videos (kept) | H | _pending_ |
| Tables never touched | I | _pending_ |

## Final deletion scope, for explicit approval (filled in after review)

| Item | Count | Approve? |
|---|---|---|
| Part 1 groups S1 to S7 | _pending_ | _owner_ |
| Part 2: accounts and account-only records | _pending_ | _owner_ |
| D6 sign-in log | kept (on hold) | n/a |
| Storage files removed in the dashboard (R7) | _pending_ | _owner_ |
