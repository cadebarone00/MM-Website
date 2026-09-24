# Live hole submission rollout

Run `supabase/live_hole_submissions.sql` in the Supabase SQL Editor before deploying the updated scoring page. It requires the existing `live_match_publication.sql` and `course_library_tee_setups.sql` migrations. The migration is safe to rerun and does not delete existing scores.

The new `/api/portal/scoring/hole` endpoint saves both score entries and the scorer's stats in one PostgreSQL transaction. Both score comparisons must agree before either player enters the career archive. A later disagreement retracts both archive entries; matching resubmissions restore them. Foursome records remain team observations. Completing all 18 confirmed holes automatically records round submission; a new dispute reopens it.

Next Hole only changes the selected hole. Unsaved edits remain in memory while navigating holes and are lost on reload. Submit Score validates required information, saves, and advances. The old stroke and stats autosave endpoints reject requests so an outdated browser cannot bypass submission.

Tiger Center's Live Scoring Page Editor connects two sample phones through a local preview session. Use both phones to submit matching or mismatching scores, return to a submitted hole, change an entry, and resubmit. Reset preview clears the sample session. Preview submissions never call the live scoring API or write to the database.

Verification: TypeScript, targeted ESLint, 29 scoring tests, a desktop/mobile two-phone browser test, and a local PostgreSQL test using the actual archive trigger passed. The database test covered validation, dispute retraction, correction, round completion, par-3 stats, and Foursome team archiving. These checks do not apply the migration to the hosted database.
