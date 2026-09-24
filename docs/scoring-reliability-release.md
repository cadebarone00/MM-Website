# Scoring reliability release

## Player behavior

- Both scoring flows retain edits in this browser, scoped to the player and match/round. Reloading restores drafts. This is device storage, not a server backup and not a fully offline app installation.
- Live Submit Score queues the exact hole submission locally before sending. Connection/server failures retry while the scoring page is open or after reopening it online. Retry uses the same request identifier to prevent duplicate writes. Next Hole continues to navigate without submitting.
- Stale edits from another device are rejected with a review/resubmit message. Editing a queued hole cancels the old queued entry. A saved score is still provisional until both scoring perspectives agree.
- Personal rounds require complete putts and shot results. Blank fields no longer silently become zero putts or missed shots. Par-three fairways remain N/A. Putts retain the requested 4+ choice.
- Scores are actual strokes rather than capped at double par. The slider includes 1–20, with Other score for a larger value.
- Foursome players see their side's latest shared submission and totals, including entries made by their teammate.

## Database guarantees

Apply `supabase/scoring_reliability.sql` before deploying the client/server changes.

- Personal round header and all 18 holes commit together. Repeating an identical submission returns the same round; a changed payload cannot reuse the same identifier.
- Live submissions have durable receipts and check the last submission timestamp under the match lock. The existing transaction still confirms both perspectives and mirrors/retracts archived holes together.
- Score changes create durable publication jobs. Official state and its odds snapshot publish together only if the score revision has not changed. Score-screen and public match/standings requests retry unfinished jobs; this is not a scheduled background worker.
- Starting a round updates the round and its match boxes together.
- Tiger closeout recomputes a contiguous confirmed result and saves final match state, archive status, audit entry, and MM Coins settlement in one transaction. A failed settlement rolls everything back. Retrying a completed closeout does not pay twice.
- Tiger may close a mathematically decided match before hole 18. Players may continue scoring until that explicit closeout. No unplayed hole receives an invented score; an incomplete round is not treated as a complete handicap round. Continuing stroke scores after a mathematical win does not change the match result.
- Historical scorecard edits save as one transaction. Edited individual-ball archived rounds replace their imported counterparts in career/odds inputs. Shared-ball rounds remain excluded from individual statistics. Archive reads paginate rather than truncating after 1,000 rows.

## Verification

- `npm test`: 282 passing tests, including archive replacement, early match victory, missing stats, and 4+ putts.
- `npm run test:db`: executes the full SQL migration chain in PGlite, reruns this migration, and tests rollback, duplicate receipts, stale-device writes, conflict retraction/restoration, publication revisions, early closeout, and settlement retry.
- `npm run test:browser`: Chromium tests real scoring components with controlled API responses, covering reload/reconnect behavior, validation, and action visibility at 390×844 and 375×667.
- Production build and TypeScript checks.
- Dependency upgrades: Next.js and compatible patches; SheetJS uses the maintained package from its [official distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). npm audit reports zero known vulnerabilities.
- Full-repository lint has existing errors in unrelated broadcast and scorecard components. Changed scoring code is lint checked separately.

## Boundaries

This release does not add GPS distances, pickups/concessions, GHIN integration, or full official WHS adjustments. The existing app handicap formula and eligibility rules remain in place. Database tests run in an isolated PostgreSQL engine; browser tests use controlled responses rather than writing fake tournament scores into production.
